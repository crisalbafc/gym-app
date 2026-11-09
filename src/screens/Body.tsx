import { useCallback, useEffect, useState } from 'react'
import { Trash2, Check } from 'lucide-react'
import { supabase, me } from '../supabase'
import type { BodyWeight, Measurement } from '../types'
import { Button, Card, Empty, ErrorText, Input, SectionTitle, Stepper } from '../components/ui'
import { errMsg, fmtDay, isoDay, num, round } from '../lib/utils'

export default function Body() {
  const [weights, setWeights] = useState<BodyWeight[]>([])
  const [measures, setMeasures] = useState<Measurement[]>([])
  const [day, setDay] = useState(isoDay())
  const [w, setW] = useState('')
  const [m, setM] = useState({ waist: '', chest: '', arm: '', leg: '' })
  const [saved, setSaved] = useState<'w' | 'm' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('body_weights').select('*').eq('user_id', me).order('day', { ascending: false }).limit(60),
      supabase.from('measurements').select('*').eq('user_id', me).order('day', { ascending: false }).limit(30),
    ])
    const ws = (a.data as BodyWeight[]) || []
    setWeights(ws)
    setMeasures((b.data as Measurement[]) || [])
    return ws
  }, [])

  useEffect(() => {
    load().then((ws) => { if (ws[0]) setW(String(round(ws[0].weight, 2))) })
  }, [load])

  function flash(k: 'w' | 'm') { setSaved(k); setTimeout(() => setSaved(null), 1500) }

  async function saveWeight() {
    setError(null)
    const { error } = await supabase.from('body_weights').upsert({ day, weight: num(w) }, { onConflict: 'user_id,day' })
    if (error) return setError(errMsg(error))
    flash('w'); load()
  }
  async function saveMeasures() {
    setError(null)
    const val = (s: string) => (s.trim() ? num(s) : null)
    const { error } = await supabase.from('measurements').upsert(
      { day, waist: val(m.waist), chest: val(m.chest), arm: val(m.arm), leg: val(m.leg) },
      { onConflict: 'user_id,day' },
    )
    if (error) return setError(errMsg(error))
    flash('m'); setM({ waist: '', chest: '', arm: '', leg: '' }); load()
  }
  async function delWeight(id: string) {
    await supabase.from('body_weights').delete().eq('id', id); load()
  }
  async function delMeasure(id: string) {
    await supabase.from('measurements').delete().eq('id', id); load()
  }

  const diff = weights.length > 1 ? weights[0].weight - weights[Math.min(weights.length - 1, 6)].weight : null

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-4">Cuerpo</h1>
      <ErrorText error={error} />

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Peso corporal</h2>
          <input type="date" value={day} max={isoDay()} onChange={(e) => setDay(e.target.value || isoDay())} className="bg-zinc-800 rounded-lg px-2 h-9 text-sm" />
        </div>
        <Stepper label="Peso" unit="kg" value={w} onChange={setW} step={0.1} />
        <Button className="w-full mt-3" onClick={saveWeight} disabled={num(w) <= 0}>
          {saved === 'w' ? <><Check size={18} /> Guardado</> : 'Guardar peso'}
        </Button>
        {diff !== null && (
          <p className="text-sm text-zinc-400 mt-2 text-center">
            Cambio en tus últimos registros: <b className={diff > 0 ? 'text-orange-300' : 'text-accent'}>{diff > 0 ? '+' : ''}{round(diff, 1)} kg</b>
          </p>
        )}
      </Card>

      <Card className="mt-3">
        <h2 className="font-bold mb-1">Medidas (opcional)</h2>
        <p className="text-xs text-zinc-500 mb-3">En centímetros. Rellena solo las que quieras.</p>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Cintura" inputMode="decimal" value={m.waist} onChange={(e) => setM({ ...m, waist: e.target.value })} />
          <Input label="Pecho" inputMode="decimal" value={m.chest} onChange={(e) => setM({ ...m, chest: e.target.value })} />
          <Input label="Brazo" inputMode="decimal" value={m.arm} onChange={(e) => setM({ ...m, arm: e.target.value })} />
          <Input label="Pierna" inputMode="decimal" value={m.leg} onChange={(e) => setM({ ...m, leg: e.target.value })} />
        </div>
        <Button variant="secondary" className="w-full mt-3" onClick={saveMeasures} disabled={!Object.values(m).some((v) => v.trim())}>
          {saved === 'm' ? <><Check size={18} /> Guardado</> : 'Guardar medidas'}
        </Button>
      </Card>

      <SectionTitle>Registro de peso</SectionTitle>
      {weights.length === 0 && <Empty>Aún no has apuntado tu peso.</Empty>}
      <ul className="space-y-1">
        {weights.slice(0, 20).map((x) => (
          <li key={x.id} className="flex items-center bg-zinc-900 rounded-xl px-3 h-12">
            <span className="flex-1 text-zinc-400 text-sm">{fmtDay(x.day)}</span>
            <span className="font-semibold">{round(x.weight, 2)} kg</span>
            <button onClick={() => delWeight(x.id)} className="h-9 w-9 ml-1 text-zinc-600 flex items-center justify-center" aria-label="Borrar"><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>

      {measures.length > 0 && (
        <>
          <SectionTitle>Registro de medidas</SectionTitle>
          <ul className="space-y-1">
            {measures.map((x) => (
              <li key={x.id} className="flex items-center bg-zinc-900 rounded-xl px-3 min-h-12 py-2">
                <span className="w-24 text-zinc-400 text-sm">{fmtDay(x.day)}</span>
                <span className="flex-1 text-sm">
                  {[['Cintura', x.waist], ['Pecho', x.chest], ['Brazo', x.arm], ['Pierna', x.leg]]
                    .filter(([, v]) => v != null).map(([l, v]) => `${l} ${v}`).join(' · ')}
                </span>
                <button onClick={() => delMeasure(x.id)} className="h-9 w-9 text-zinc-600 flex items-center justify-center" aria-label="Borrar"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

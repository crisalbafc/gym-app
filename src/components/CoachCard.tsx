import { useCallback, useEffect, useState } from 'react'
import { UserCheck, Unlink } from 'lucide-react'
import { supabase } from '../supabase'
import { Button, Card, ErrorText, Input } from './ui'
import { errMsg } from '../lib/utils'

type Shares = { share_workouts: boolean; share_diet: boolean; share_body: boolean; share_photos: boolean }
type MyCoach = Shares & { coach_id: string; name: string; created_at: string }

const OPTIONS: { key: keyof Shares; label: string; hint: string }[] = [
  { key: 'share_workouts', label: 'Entrenos', hint: 'series, kilos, rutinas, historial' },
  { key: 'share_diet', label: 'Dieta', hint: 'comidas, calorías y macros' },
  { key: 'share_body', label: 'Peso y medidas', hint: '' },
  { key: 'share_photos', label: 'Fotos de entrenos', hint: '' },
]

function ShareChecks({ value, onChange }: { value: Shares; onChange: (v: Shares) => void }) {
  return (
    <div className="space-y-1">
      {OPTIONS.map((o) => (
        <label key={o.key} className="flex items-center justify-between gap-3 min-h-11">
          <span>
            <span className="block text-sm font-semibold">{o.label}</span>
            {o.hint && <span className="block text-xs text-zinc-500">{o.hint}</span>}
          </span>
          <input type="checkbox" checked={value[o.key]} onChange={(e) => onChange({ ...value, [o.key]: e.target.checked })} className="h-6 w-6 accent-lime-400 shrink-0" />
        </label>
      ))}
    </div>
  )
}

/** Ajustes > Mi entrenador: conectar con un código y decidir qué compartir. */
export default function CoachCard() {
  const [coaches, setCoaches] = useState<MyCoach[] | null>(null)
  const [code, setCode] = useState('')
  const [shares, setShares] = useState<Shares>({ share_workouts: true, share_diet: true, share_body: true, share_photos: false })
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_coaches')
    if (error) { setUnavailable(true); setCoaches([]); return }
    setCoaches((data as MyCoach[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function join() {
    setError(null); setInfo(null)
    const { data, error } = await supabase.rpc('join_coach', {
      p_code: code, p_workouts: shares.share_workouts, p_diet: shares.share_diet, p_body: shares.share_body, p_photos: shares.share_photos,
    })
    if (error) return setError(errMsg(error).includes('no válido') ? 'Ese código de entrenador no existe. Revísalo con tu entrenador.' : errMsg(error))
    setInfo(`¡Conectado con ${data}! Ya puede seguir tu progreso.`)
    setCode(''); setConsent(false); load()
  }
  async function update(c: MyCoach, v: Shares) {
    setCoaches((l) => l?.map((x) => (x.coach_id === c.coach_id ? { ...x, ...v } : x)) || null)
    const { error } = await supabase.rpc('update_coach_sharing', {
      p_coach: c.coach_id, p_workouts: v.share_workouts, p_diet: v.share_diet, p_body: v.share_body, p_photos: v.share_photos,
    })
    if (error) { setError(errMsg(error)); load() }
  }
  async function leave(c: MyCoach) {
    if (!confirm(`¿Desconectarte de ${c.name}? Dejará de ver tus datos.`)) return
    await supabase.from('coach_clients').delete().eq('coach_id', c.coach_id)
    load()
  }

  if (coaches === null) return null
  if (unavailable) return <Card><p className="text-sm text-zinc-400">La conexión con entrenador aún no está activada en el servidor.</p></Card>

  return (
    <Card className="space-y-4">
      {coaches.map((c) => (
        <div key={c.coach_id} className="space-y-2">
          <div className="flex items-center gap-2">
            <UserCheck size={20} className="text-accent" />
            <div className="flex-1 font-bold">{c.name}</div>
            <button onClick={() => leave(c)} className="text-xs text-zinc-400 underline flex items-center gap-1"><Unlink size={14} /> Desconectar</button>
          </div>
          <p className="text-xs text-zinc-500">Lo que puede ver tu entrenador (puedes cambiarlo cuando quieras):</p>
          <ShareChecks value={c} onChange={(v) => update(c, v)} />
          <div className="border-t border-zinc-800" />
        </div>
      ))}

      <div className="space-y-3">
        <h3 className="font-bold">{coaches.length ? 'Conectar con otro entrenador' : 'Conectar con tu entrenador'}</h3>
        <p className="text-sm text-zinc-400">Pídele su código de entrenador (empieza por «E») para que pueda seguir tu progreso, asignarte rutinas y mandarte mensajes.</p>
        <Input placeholder="Ej. E1A2B3C" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={7} />
        {code.trim().length >= 7 && (
          <>
            <p className="text-xs text-zinc-500">Elige qué podrá ver:</p>
            <ShareChecks value={shares} onChange={setShares} />
            <label className="flex items-start gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5 mt-0.5 shrink-0 accent-lime-400" />
              Doy mi consentimiento para que este entrenador vea los datos que he marcado, incluidos los de salud (peso, dieta, fotos). Puedo retirarlo en cualquier momento desconectándome.
            </label>
            <Button className="w-full" onClick={join} disabled={!consent}>Conectar</Button>
          </>
        )}
      </div>
      {info && <p className="text-sm text-accent">{info}</p>}
      <ErrorText error={error} />
    </Card>
  )
}

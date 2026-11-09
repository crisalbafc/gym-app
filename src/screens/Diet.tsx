import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Search, CopyPlus } from 'lucide-react'
import { supabase, me } from '../supabase'
import { useApp } from '../App'
import type { Food, FoodEntry, Meal } from '../types'
import { Bar, Button, Card, Empty, ErrorText, Input, Segmented, Sheet } from '../components/ui'
import { addDays, errMsg, fmtDay, isoDay, num, round } from '../lib/utils'

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'comida', label: 'Comida' },
  { id: 'merienda', label: 'Merienda' },
  { id: 'cena', label: 'Cena' },
  { id: 'snacks', label: 'Snacks' },
]

export function totals(entries: FoodEntry[]) {
  return entries.reduce(
    (t, e) => ({ kcal: t.kcal + +e.kcal, protein: t.protein + +e.protein, carbs: t.carbs + +e.carbs, fat: t.fat + +e.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

export function MacroBars({ entries }: { entries: FoodEntry[] }) {
  const { profile } = useApp()
  const t = totals(entries)
  const rows = [
    { label: 'Proteína', v: t.protein, goal: profile.protein_goal, color: 'bg-sky-400' },
    { label: 'Hidratos', v: t.carbs, goal: profile.carbs_goal, color: 'bg-amber-300' },
    { label: 'Grasas', v: t.fat, goal: profile.fat_goal, color: 'bg-pink-400' },
  ]
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-3xl font-extrabold">{round(t.kcal)}</span>
        <span className="text-sm text-zinc-400">de {profile.kcal_goal} kcal · quedan {Math.max(0, round(profile.kcal_goal - t.kcal))}</span>
      </div>
      <Bar value={t.kcal} max={profile.kcal_goal} />
      <div className="grid grid-cols-3 gap-3 mt-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="text-xs text-zinc-400">{r.label}</div>
            <div className="text-sm font-semibold mb-1">{round(r.v)}<span className="text-zinc-500 font-normal">/{r.goal} g</span></div>
            <Bar value={r.v} max={r.goal} color={r.color} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Diet() {
  const [day, setDay] = useState(isoDay())
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [addTo, setAddTo] = useState<Meal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = isoDay()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('food_entries').select('*').eq('user_id', me).eq('day', day).order('created_at')
    if (error) setError(errMsg(error))
    setEntries((data as FoodEntry[]) || [])
  }, [day])
  useEffect(() => { load() }, [load])

  async function remove(id: string) {
    await supabase.from('food_entries').delete().eq('id', id)
    setEntries((e) => e.filter((x) => x.id !== id))
  }

  async function copyYesterday() {
    const { data } = await supabase.from('food_entries').select('meal,name,grams,kcal,protein,carbs,fat').eq('user_id', me).eq('day', addDays(day, -1))
    if (!data?.length) return alert('El día anterior no tiene comidas apuntadas.')
    if (!confirm(`¿Copiar las ${data.length} comidas del día anterior a este día?`)) return
    const { error } = await supabase.from('food_entries').insert(data.map((d) => ({ ...d, day })))
    if (error) setError(errMsg(error))
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setDay(addDays(day, -1))} className="h-11 w-11 rounded-full bg-zinc-900 flex items-center justify-center" aria-label="Día anterior"><ChevronLeft /></button>
        <div className="text-center">
          <h1 className="text-xl font-extrabold">{day === today ? 'Hoy' : day === addDays(today, -1) ? 'Ayer' : fmtDay(day)}</h1>
          <p className="text-xs text-zinc-500">{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={() => setDay(addDays(day, 1))} disabled={day >= today} className="h-11 w-11 rounded-full bg-zinc-900 flex items-center justify-center disabled:opacity-30" aria-label="Día siguiente"><ChevronRight /></button>
      </div>

      <ErrorText error={error} />
      <Card><MacroBars entries={entries} /></Card>

      <div className="space-y-3 mt-4">
        {MEALS.map((m) => {
          const list = entries.filter((e) => e.meal === m.id)
          const kcal = list.reduce((s, e) => s + +e.kcal, 0)
          return (
            <Card key={m.id} className="!p-3">
              <div className="flex items-center justify-between">
                <div className="font-bold">{m.label} {kcal > 0 && <span className="text-sm text-zinc-500 font-normal">· {round(kcal)} kcal</span>}</div>
                <button onClick={() => setAddTo(m.id)} className="h-10 px-3 rounded-xl bg-zinc-800 text-accent font-semibold flex items-center gap-1"><Plus size={18} /> Añadir</button>
              </div>
              {list.length > 0 && (
                <ul className="mt-2 divide-y divide-zinc-800">
                  {list.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{e.name}</div>
                        <div className="text-xs text-zinc-500">{round(e.grams)} g · P {round(e.protein)} · H {round(e.carbs)} · G {round(e.fat)}</div>
                      </div>
                      <div className="text-sm font-semibold">{round(e.kcal)} kcal</div>
                      <button onClick={() => remove(e.id)} className="h-9 w-9 text-zinc-500 flex items-center justify-center" aria-label="Borrar"><Trash2 size={16} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>

      {entries.length === 0 && (
        <Button variant="ghost" className="w-full mt-3" onClick={copyYesterday}><CopyPlus size={18} /> Copiar comidas del día anterior</Button>
      )}

      <AddFood meal={addTo} day={day} onClose={() => setAddTo(null)} onAdded={load} />
    </div>
  )
}

/* ---------------- Añadir alimento ---------------- */

export function AddFood({ meal, day, onClose, onAdded }: { meal: Meal | null; day: string; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<'mine' | 'new'>('mine')
  const [foods, setFoods] = useState<Food[]>([])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Food | null>(null)
  const [mealSel, setMealSel] = useState<Meal>('comida')
  const [grams, setGrams] = useState('100')
  const [f, setF] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' })
  const [save, setSave] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!meal) return
    setMealSel(meal); setPicked(null); setQ(''); setError(null)
    setF({ name: '', kcal: '', protein: '', carbs: '', fat: '' }); setGrams('100')
    supabase.from('foods').select('*').order('name').then(({ data }) => {
      // Primero los tuyos, luego los comunes
      const list = ((data as Food[]) || []).sort((a, b) => Number(!a.user_id) - Number(!b.user_id) || a.name.localeCompare(b.name, 'es'))
      setFoods(list)
      setMode(list.length ? 'mine' : 'new')
    })
  }, [meal])

  const filtered = useMemo(() => foods.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())), [foods, q])

  const per100 = picked
    ? { kcal: +picked.kcal, protein: +picked.protein, carbs: +picked.carbs, fat: +picked.fat }
    : { kcal: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) }
  const g = num(grams)
  const total = {
    kcal: (per100.kcal * g) / 100, protein: (per100.protein * g) / 100,
    carbs: (per100.carbs * g) / 100, fat: (per100.fat * g) / 100,
  }

  async function add() {
    setBusy(true); setError(null)
    try {
      const name = picked ? picked.name : f.name.trim()
      const { error } = await supabase.from('food_entries').insert({
        day, meal: mealSel, name, grams: g,
        kcal: round(total.kcal, 1), protein: round(total.protein, 1), carbs: round(total.carbs, 1), fat: round(total.fat, 1),
      })
      if (error) throw error
      if (picked?.user_id) await supabase.from('foods').update({ last_grams: g }).eq('id', picked.id)
      else if (save) await supabase.from('foods').insert({ name, ...per100, last_grams: g })
      onAdded(); onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteFood(id: string) {
    if (!confirm('¿Borrar este alimento de tu lista?')) return
    await supabase.from('foods').delete().eq('id', id)
    setFoods((l) => l.filter((x) => x.id !== id))
  }

  const canAdd = g > 0 && (picked || f.name.trim())

  return (
    <Sheet open={!!meal} onClose={onClose} title="Añadir alimento">
      <div className="space-y-3">
        <select value={mealSel} onChange={(e) => setMealSel(e.target.value as Meal)} className="w-full min-h-12 px-3 rounded-xl bg-zinc-800 border border-zinc-700">
          {MEALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>

        {!picked && (
          <Segmented value={mode} onChange={setMode} options={[{ value: 'mine', label: `Alimentos (${foods.length})` }, { value: 'new', label: 'Nuevo' }]} />
        )}

        {picked ? (
          <Card className="!p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">{picked.name}</div>
              <div className="text-xs text-zinc-500">por 100 g: {round(picked.kcal)} kcal · P {round(picked.protein, 1)} · H {round(picked.carbs, 1)} · G {round(picked.fat, 1)}</div>
            </div>
            <button className="text-sm text-zinc-400 underline" onClick={() => setPicked(null)}>Cambiar</button>
          </Card>
        ) : mode === 'mine' ? (
          <div>
            <div className="relative mb-2">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-full min-h-12 pl-10 pr-3 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-accent" />
            </div>
            {filtered.length === 0 && <Empty>No hay alimentos{q ? ' con ese nombre' : ''}. Créalo en «Nuevo».</Empty>}
            <p className="text-[11px] text-zinc-500 mb-1">Valores aproximados. Si tienes la etiqueta, mejor crea el tuyo en «Nuevo».</p>
            <ul className="max-h-72 overflow-y-auto">
              {filtered.map((x) => (
                <li key={x.id} className="flex items-center">
                  <button className="flex-1 text-left min-h-12 px-2 rounded-xl active:bg-zinc-800" onClick={() => { setPicked(x); setGrams(String(round(x.last_grams))) }}>
                    <div>{x.name}</div>
                    <div className="text-xs text-zinc-500">
                      {round(x.kcal)} kcal / 100 g · P {round(x.protein, 1)} · H {round(x.carbs, 1)} · G {round(x.fat, 1)}
                      {x.user_id && <span className="ml-1 text-accent">· tuyo</span>}
                    </div>
                  </button>
                  {x.user_id
                    ? <button onClick={() => deleteFood(x.id)} className="h-10 w-10 text-zinc-600 flex items-center justify-center" aria-label="Borrar alimento"><Trash2 size={16} /></button>
                    : <span className="w-10" />}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <Input label="Nombre (ej. Pechuga de pollo)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <p className="text-xs text-zinc-400">Valores <b>por 100 g</b> (vienen en la etiqueta):</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Kcal" inputMode="decimal" value={f.kcal} onChange={(e) => setF({ ...f, kcal: e.target.value })} />
              <Input label="Proteína (g)" inputMode="decimal" value={f.protein} onChange={(e) => setF({ ...f, protein: e.target.value })} />
              <Input label="Hidratos (g)" inputMode="decimal" value={f.carbs} onChange={(e) => setF({ ...f, carbs: e.target.value })} />
              <Input label="Grasas (g)" inputMode="decimal" value={f.fat} onChange={(e) => setF({ ...f, fat: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-5 w-5 accent-lime-400" />
              Guardar en «Mis alimentos» para la próxima vez
            </label>
          </div>
        )}

        {(picked || mode === 'new') && (
          <>
            <Input label="Cantidad que has comido (g)" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} onFocus={(e) => e.target.select()} />
            <div className="text-sm text-zinc-300 bg-zinc-800/60 rounded-xl px-3 py-2">
              Total: <b>{round(total.kcal)} kcal</b> · P {round(total.protein, 1)} g · H {round(total.carbs, 1)} g · G {round(total.fat, 1)} g
            </div>
            <ErrorText error={error} />
            <Button className="w-full" onClick={add} disabled={!canAdd || busy}><Plus size={18} /> Añadir</Button>
          </>
        )}
      </div>
    </Sheet>
  )
}

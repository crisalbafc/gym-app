import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar as RBar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import { ChevronDown, Trophy } from 'lucide-react'
import { useApp } from '../App'
import type { BodyWeight, Exercise, FoodEntry, WorkoutSet } from '../types'
import { Card, Empty, ErrorText, Segmented } from '../components/ui'
import { ExercisePicker } from './Workout'
import { addDays, e1rm, errMsg, fmtDay, isoDay, kg, parseDay, round } from '../lib/utils'
import { fetchAll } from '../lib/fetchAll'

type Period = '1m' | '3m' | '1a' | 'todo'
const PERIOD_DAYS: Record<Period, number | null> = { '1m': 30, '3m': 91, '1a': 365, todo: null }

const AXIS = { stroke: '#71717a', fontSize: 11, tickLine: false, axisLine: false } as const
const TIP = {
  contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 13 },
  labelStyle: { color: '#a1a1aa' },
  itemStyle: { padding: 0 },
}
const shortDay = (d: string) => fmtDay(d, { day: 'numeric', month: 'short' })

/** Lunes de la semana de un día. */
function weekStart(day: string) {
  const d = parseDay(day)
  const dow = (d.getDay() + 6) % 7
  return addDays(day, -dow)
}

export default function Progress() {
  const { profile, exercises } = useApp()
  const [period, setPeriod] = useState<Period>('3m')
  const [sets, setSets] = useState<WorkoutSet[] | null>(null)
  const [weights, setWeights] = useState<BodyWeight[]>([])
  const [food, setFood] = useState<Pick<FoodEntry, 'day' | 'kcal' | 'protein'>[]>([])
  const [exId, setExId] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const since = PERIOD_DAYS[period] ? addDays(isoDay(), -PERIOD_DAYS[period]!) : null

  useEffect(() => {
    (async () => {
      try {
        const [s, w, f] = await Promise.all([
          fetchAll<WorkoutSet>('workout_sets', 'id,workout_id,exercise_id,weight,reps,created_at',
            (q) => (since ? q.gte('created_at', since) : q).order('created_at')),
          fetchAll<BodyWeight>('body_weights', 'id,day,weight', (q) => (since ? q.gte('day', since) : q).order('day')),
          fetchAll<Pick<FoodEntry, 'day' | 'kcal' | 'protein'>>('food_entries', 'day,kcal,protein', (q) => (since ? q.gte('day', since) : q)),
        ])
        setSets(s.map((x) => ({ ...x, weight: +x.weight })))
        setWeights(w.map((x) => ({ ...x, weight: +x.weight })))
        setFood(f)
      } catch (e) { setError(errMsg(e)) }
    })()
  }, [since])

  // Ejercicios con datos, ordenados por número de series
  const exStats = useMemo(() => {
    const count = new Map<string, number>()
    for (const s of sets || []) count.set(s.exercise_id, (count.get(s.exercise_id) || 0) + 1)
    return count
  }, [sets])
  const exById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises])
  const selected: Exercise | undefined = exById[exId || ''] ||
    exById[[...exStats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '']

  const exSeries = useMemo(() => {
    if (!selected || !sets) return []
    const byDay = new Map<string, { max: number; e1rm: number }>()
    for (const s of sets.filter((x) => x.exercise_id === selected.id)) {
      const d = isoDay(new Date(s.created_at))
      const cur = byDay.get(d) || { max: 0, e1rm: 0 }
      byDay.set(d, { max: Math.max(cur.max, s.weight), e1rm: Math.max(cur.e1rm, e1rm(s.weight, s.reps)) })
    }
    return [...byDay.entries()].map(([day, v]) => ({ day, max: round(v.max, 2), e1rm: round(v.e1rm, 1) }))
  }, [selected, sets])
  const best = exSeries.reduce((b, x) => (x.max > b ? x.max : b), 0)

  const weekly = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sets || []) {
      const w = weekStart(isoDay(new Date(s.created_at)))
      m.set(w, (m.get(w) || 0) + s.weight * s.reps)
    }
    return [...m.entries()].sort().map(([week, vol]) => ({ week, vol: round(vol) }))
  }, [sets])

  const bodySeries = useMemo(() => weights.map((w, i) => {
    const from = addDays(w.day, -6)
    const win = weights.slice(0, i + 1).filter((x) => x.day >= from)
    return { day: w.day, peso: w.weight, media: round(win.reduce((s, x) => s + x.weight, 0) / win.length, 2) }
  }), [weights])

  const foodSeries = useMemo(() => {
    const m = new Map<string, { kcal: number; protein: number }>()
    for (const f of food) {
      const cur = m.get(f.day) || { kcal: 0, protein: 0 }
      m.set(f.day, { kcal: cur.kcal + +f.kcal, protein: cur.protein + +f.protein })
    }
    return [...m.entries()].sort().map(([day, v]) => ({ day, kcal: round(v.kcal), proteina: round(v.protein) }))
  }, [food])

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-4">Progreso</h1>
      <Segmented value={period} onChange={setPeriod} options={[
        { value: '1m', label: '1 mes' }, { value: '3m', label: '3 meses' }, { value: '1a', label: '1 año' }, { value: 'todo', label: 'Todo' },
      ]} />
      <ErrorText error={error} />
      {!sets && !error && <Empty>Cargando…</Empty>}

      {sets && (
        <div className="space-y-4 mt-4">
          <Card>
            <h2 className="font-bold mb-2">Fuerza por ejercicio</h2>
            <button onClick={() => setPicker(true)} className="w-full min-h-12 px-3 rounded-xl bg-zinc-800 flex items-center justify-between mb-3">
              <span className="font-semibold">{selected?.name || 'Elige un ejercicio'}</span><ChevronDown size={18} />
            </button>
            {exSeries.length === 0 ? <Empty>Sin datos en este periodo.</Empty> : (
              <>
                <p className="text-sm text-zinc-400 mb-2 flex items-center gap-1.5"><Trophy size={15} className="text-yellow-400" /> Máximo del periodo: <b className="text-zinc-100">{kg(best)}</b></p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={exSeries} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid stroke="#27272a" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={20} />
                    <YAxis {...AXIS} domain={['auto', 'auto']} />
                    <Tooltip {...TIP} labelFormatter={(d) => shortDay(String(d))} formatter={(v, n) => [`${v} kg`, n === 'max' ? 'Peso máximo' : '1RM estimado']} />
                    <Legend formatter={(n) => (n === 'max' ? 'Peso máximo' : '1RM estimado')} wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="max" stroke="#a3e635" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="e1rm" stroke="#38bdf8" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-zinc-500 mt-1">1RM estimado = el peso que podrías levantar a 1 repetición, calculado con tus series.</p>
              </>
            )}
          </Card>

          <Card>
            <h2 className="font-bold mb-2">Volumen por semana</h2>
            {weekly.length === 0 ? <Empty>Sin entrenos en este periodo.</Empty> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekly} margin={{ left: -10, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="week" tickFormatter={shortDay} {...AXIS} minTickGap={16} />
                  <YAxis {...AXIS} tickFormatter={(v) => (v >= 1000 ? `${round(v / 1000, 1)}k` : v)} />
                  <Tooltip {...TIP} cursor={{ fill: '#27272a' }} labelFormatter={(d) => `Semana del ${shortDay(String(d))}`} formatter={(v) => [`${Number(v).toLocaleString('es-ES')} kg`, 'Volumen']} />
                  <RBar dataKey="vol" fill="#a3e635" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-zinc-500 mt-1">Volumen = suma de kilos × repeticiones de todas tus series.</p>
          </Card>

          <Card>
            <h2 className="font-bold mb-2">Peso corporal</h2>
            {bodySeries.length === 0 ? <Empty>Apunta tu peso en «Cuerpo».</Empty> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={bodySeries} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={20} />
                  <YAxis {...AXIS} domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(v) => round(v, 1).toString()} />
                  <Tooltip {...TIP} labelFormatter={(d) => shortDay(String(d))} formatter={(v, n) => [`${v} kg`, n === 'peso' ? 'Peso' : 'Media 7 días']} />
                  <Legend formatter={(n) => (n === 'peso' ? 'Peso' : 'Media 7 días')} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="peso" stroke="#71717a" strokeWidth={1} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="media" stroke="#a3e635" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <h2 className="font-bold mb-2">Calorías y proteína por día</h2>
            {foodSeries.length === 0 ? <Empty>Apunta tus comidas en «Dieta».</Empty> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={foodSeries} margin={{ left: -10, right: 8, top: 8 }}>
                    <CartesianGrid stroke="#27272a" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={20} />
                    <YAxis {...AXIS} />
                    <Tooltip {...TIP} cursor={{ fill: '#27272a' }} labelFormatter={(d) => shortDay(String(d))} formatter={(v) => [`${v} kcal`, 'Calorías']} />
                    <ReferenceLine y={profile.kcal_goal} stroke="#f97316" strokeDasharray="4 3" />
                    <RBar dataKey="kcal" fill="#a3e635" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={foodSeries} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid stroke="#27272a" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={20} />
                    <YAxis {...AXIS} />
                    <Tooltip {...TIP} labelFormatter={(d) => shortDay(String(d))} formatter={(v) => [`${v} g`, 'Proteína']} />
                    <ReferenceLine y={profile.protein_goal} stroke="#f97316" strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="proteina" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-zinc-500 mt-1">La línea naranja es tu objetivo diario.</p>
              </>
            )}
          </Card>
        </div>
      )}

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onlyIds={new Set(exStats.keys())}
        onPick={(e) => { setExId(e.id); setPicker(false) }}
      />
    </div>
  )
}

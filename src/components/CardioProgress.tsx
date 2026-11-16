import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { supabase, me } from '../supabase'
import { Card } from './ui'
import { addDays, fmtDay, parseDay, round } from '../lib/utils'
import { fmtPace, type CardioSession } from './Cardio'

const AXIS = { stroke: '#71717a', fontSize: 11, tickLine: false, axisLine: false } as const
const TIP = { contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 13 }, labelStyle: { color: '#a1a1aa' } }
const weekStart = (day: string) => addDays(day, -((parseDay(day).getDay() + 6) % 7))
const short = (d: string) => fmtDay(d, { day: 'numeric', month: 'short' })

/** Progreso > Cardio: km por semana y ritmo medio corriendo. No aparece si no hay cardio. */
export default function CardioProgress({ since }: { since: string | null }) {
  const [items, setItems] = useState<CardioSession[]>([])
  useEffect(() => {
    let q = supabase.from('cardio_sessions').select('*').eq('user_id', me).order('day')
    if (since) q = q.gte('day', since)
    q.then(({ data, error }) => setItems(error ? [] : ((data as CardioSession[]) || [])))
  }, [since])

  const weekly = useMemo(() => {
    const m = new Map<string, { correr: number; ciclismo: number }>()
    for (const s of items) {
      const w = weekStart(s.day)
      const t = m.get(w) || { correr: 0, ciclismo: 0 }
      if (s.sport === 'correr' || s.sport === 'ciclismo') t[s.sport] += +(s.distance_km || 0)
      m.set(w, t)
    }
    return [...m.entries()].sort().map(([week, t]) => ({ week, correr: round(t.correr, 1), ciclismo: round(t.ciclismo, 1) }))
  }, [items])
  const pace = items.filter((s) => s.sport === 'correr' && s.avg_pace_s).map((s) => ({ day: s.day, ritmo: s.avg_pace_s! }))
  const totals = useMemo(() => ({
    km: round(items.reduce((t, s) => t + +(s.distance_km || 0), 0), 1),
    h: round(items.reduce((t, s) => t + (s.duration_s || 0), 0) / 3600, 1),
    n: items.length,
  }), [items])

  if (!items.length) return null
  return (
    <Card>
      <h2 className="font-bold mb-1">Cardio</h2>
      <p className="text-sm text-zinc-400 mb-2">{totals.n} sesiones · {totals.km} km · {totals.h} h</p>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={weekly} margin={{ left: -20, right: 8, top: 8 }}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="week" tickFormatter={short} {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} />
          <Tooltip {...TIP} cursor={{ fill: '#27272a' }} labelFormatter={(d) => `Semana del ${short(String(d))}`} formatter={(v, n) => [`${v} km`, n === 'correr' ? 'Correr' : 'Ciclismo']} />
          <Legend formatter={(n) => (n === 'correr' ? 'Correr (km)' : 'Ciclismo (km)')} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="correr" stackId="a" fill="#a3e635" />
          <Bar dataKey="ciclismo" stackId="a" fill="#38bdf8" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {pace.length > 1 && (
        <>
          <h3 className="font-semibold mt-4 text-sm">Ritmo medio corriendo</h3>
          <p className="text-xs text-zinc-500">Cuanto más abajo, más rápido.</p>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={pace} margin={{ left: -10, right: 8, top: 8 }}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="day" tickFormatter={short} {...AXIS} minTickGap={20} />
              <YAxis {...AXIS} domain={['dataMin - 15', 'dataMax + 15']} tickFormatter={(v) => fmtPace(v).replace('/km', '')} />
              <Tooltip {...TIP} labelFormatter={(d) => short(String(d))} formatter={(v) => [fmtPace(Number(v)), 'Ritmo']} />
              <Line type="monotone" dataKey="ritmo" stroke="#a3e635" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  )
}

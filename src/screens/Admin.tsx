import { useEffect, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar as RBar, XAxis, YAxis, Tooltip } from 'recharts'
import { Users, UserPlus, Activity, Dumbbell, Camera, Database, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../supabase'
import { Bar, Card, Empty, ErrorText, SectionTitle } from '../components/ui'
import { errMsg, fmtDay, round } from '../lib/utils'

type Stats = {
  users: number; new_7: number; new_30: number; active_7: number; active_30: number
  workouts: number; sets: number; food: number; photos: number; groups: number
  db_bytes: number; storage_bytes: number; signups: { day: string; n: number }[]
}

// Límites del plan gratuito de Supabase
const DB_LIMIT = 500 * 1024 ** 2
const STORAGE_LIMIT = 1024 ** 3
const mb = (b: number) => (b >= 1024 ** 3 ? `${round(b / 1024 ** 3, 2)} GB` : `${round(b / 1024 ** 2, 1)} MB`)

export default function Admin() {
  const [s, setS] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('admin_stats').then(({ data, error }) => {
      if (error) setError(errMsg(error))
      else setS(data as Stats)
    })
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">Estadísticas</h1>
      <p className="text-sm text-zinc-400 mb-4">Solo tú ves esta pantalla. Son cifras globales, sin datos personales.</p>
      <ErrorText error={error} />
      {!s && !error && <Empty>Cargando…</Empty>}
      {s && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={<Users size={18} />} label="Usuarios registrados" value={s.users} />
            <Stat icon={<UserPlus size={18} />} label="Nuevos (7 / 30 días)" value={`${s.new_7} / ${s.new_30}`} />
            <Stat icon={<Activity size={18} />} label="Activos 7 días" value={s.active_7} />
            <Stat icon={<Activity size={18} />} label="Activos 30 días" value={s.active_30} />
            <Stat icon={<Dumbbell size={18} />} label="Entrenos · series" value={`${s.workouts} · ${s.sets}`} />
            <Stat icon={<Camera size={18} />} label="Fotos · grupos" value={`${s.photos} · ${s.groups}`} />
          </div>

          <SectionTitle>Registros últimos 30 días</SectionTitle>
          <Card>
            {s.signups.length === 0 ? <Empty>Nadie nuevo este mes.</Empty> : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={s.signups} margin={{ left: -25, right: 8, top: 8 }}>
                  <XAxis dataKey="day" tickFormatter={(d) => fmtDay(d, { day: 'numeric', month: 'short' })} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis allowDecimals={false} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }} cursor={{ fill: '#27272a' }}
                    labelFormatter={(d) => fmtDay(String(d))} formatter={(v) => [v, 'Registros']} />
                  <RBar dataKey="n" fill="#a3e635" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <SectionTitle>Límites del plan gratis</SectionTitle>
          <Card className="space-y-4">
            <Limit icon={<Database size={16} />} label="Base de datos" used={s.db_bytes} limit={DB_LIMIT} />
            <Limit icon={<ImageIcon size={16} />} label="Fotos" used={s.storage_bytes} limit={STORAGE_LIMIT} />
            <p className="text-xs text-zinc-500">
              Si alguna barra pasa del 80 %, toca pensar en el plan Pro de Supabase (25 $/mes). El tráfico mensual
              se mira en Supabase → Usage.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="!p-3">
      <div className="text-zinc-400 text-xs flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
    </Card>
  )
}

function Limit({ icon, label, used, limit }: { icon: React.ReactNode; label: string; used: number; limit: number }) {
  const pct = round((used / limit) * 100, 1)
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span className="text-zinc-400">{mb(used)} de {mb(limit)} · {pct} %</span>
      </div>
      <Bar value={used} max={limit} color={pct > 80 ? 'bg-orange-400' : 'bg-accent'} />
    </div>
  )
}

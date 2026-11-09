import { useEffect, useState } from 'react'
import { Dumbbell, Apple, Scale, Trophy, ChevronRight, Users } from 'lucide-react'
import { supabase } from '../supabase'
import { useApp } from '../App'
import type { FoodEntry, Meal } from '../types'
import { Card, SectionTitle } from '../components/ui'
import { MacroBars, AddFood } from './Diet'
import CoachMessages from '../components/CoachMessages'
import { IS_PRO } from '../edition'
import { fmtDate, isoDay, round } from '../lib/utils'

type PR = { display_name: string; exercise_name: string; weight: number; reps: number; done_at: string }

export default function Today() {
  const { profile, go } = useApp()
  const today = isoDay()
  const [workout, setWorkout] = useState<{ active: boolean; doneToday: boolean; sets: number } | null>(null)
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [weight, setWeight] = useState<number | null>(null)
  const [prs, setPrs] = useState<PR[]>([])
  const [hasGroup, setHasGroup] = useState(false)
  const [addFood, setAddFood] = useState(false)

  async function loadFood() {
    const { data } = await supabase.from('food_entries').select('*').eq('day', today)
    setEntries((data as FoodEntry[]) || [])
  }

  useEffect(() => {
    (async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
      const [w, bw, pr, gm] = await Promise.all([
        supabase.from('workouts').select('id,ended_at,workout_sets(count)').gte('started_at', startOfDay.toISOString()),
        supabase.from('body_weights').select('weight').eq('day', today).maybeSingle(),
        supabase.rpc('group_recent_prs'),
        supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('user_id', profile.id),
      ])
      const { data: open } = await supabase.from('workouts').select('id').is('ended_at', null).limit(1)
      const ws = (w.data as { ended_at: string | null; workout_sets: { count: number }[] }[]) || []
      setWorkout({
        active: !!open?.length,
        doneToday: ws.some((x) => x.ended_at),
        sets: ws.reduce((s, x) => s + (x.workout_sets[0]?.count || 0), 0),
      })
      setWeight(bw.data ? +bw.data.weight : null)
      setPrs((pr.data as PR[]) || [])
      setHasGroup((gm.count || 0) > 0)
    })()
    loadFood()
  }, [today, profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hour = new Date().getHours()
  const hello = hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div>
      <p className="text-zinc-400">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1 className="text-2xl font-extrabold mb-4">{hello}, {profile.display_name} 👋</h1>

      <div className="grid grid-cols-3 gap-2">
        <QuickBtn icon={<Dumbbell />} label={workout?.active ? 'Seguir entreno' : 'Empezar entreno'} onClick={() => go('entreno')} highlight={workout?.active} />
        <QuickBtn icon={<Apple />} label="Añadir comida" onClick={() => setAddFood(true)} />
        <QuickBtn icon={<Scale />} label="Apuntar peso" onClick={() => go('cuerpo')} />
      </div>

      {IS_PRO && <CoachMessages />}

      <SectionTitle>Resumen de hoy</SectionTitle>
      <div className="space-y-3">
        <Row onClick={() => go('entreno')} icon={<Dumbbell size={20} />} title="Entreno"
          value={workout?.active ? `En marcha · ${workout.sets} series` : workout?.doneToday ? `✅ Hecho · ${workout.sets} series` : 'Aún no has entrenado'} />
        <Row onClick={() => go('cuerpo')} icon={<Scale size={20} />} title="Peso de hoy"
          value={weight ? `${round(weight, 2)} kg` : 'Sin apuntar'} />
        <Card>
          <button className="w-full flex items-center justify-between mb-3" onClick={() => go('dieta')}>
            <span className="font-bold flex items-center gap-2"><Apple size={20} /> Dieta</span>
            <ChevronRight size={18} className="text-zinc-500" />
          </button>
          <MacroBars entries={entries} />
        </Card>
      </div>

      <SectionTitle>Tu grupo</SectionTitle>
      {!hasGroup ? (
        <Row onClick={() => go('grupo')} icon={<Users size={20} />} title="Entrena con tus amigos" value="Crea un grupo o únete con un código" />
      ) : prs.length === 0 ? (
        <Card><p className="text-sm text-zinc-400">Esta semana nadie del grupo ha batido récords todavía. ¿Serás tú el primero? 💪</p></Card>
      ) : (
        <Card className="space-y-2">
          {prs.map((p, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <Trophy size={16} className="text-yellow-400 shrink-0 mt-0.5" />
              <span><b>{p.display_name}</b> ha batido su récord en <b>{p.exercise_name}</b>: {round(p.weight, 2)} kg × {p.reps} <span className="text-zinc-500">· {fmtDate(p.done_at)}</span> 💪</span>
            </div>
          ))}
        </Card>
      )}

      <AddFood meal={addFood ? defaultMeal() : null} day={today} onClose={() => setAddFood(false)} onAdded={loadFood} />
    </div>
  )
}

function defaultMeal(): Meal {
  const h = new Date().getHours()
  return h < 12 ? 'desayuno' : h < 17 ? 'comida' : h < 20 ? 'merienda' : 'cena'
}

function QuickBtn({ icon, label, onClick, highlight }: { icon: React.ReactNode; label: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button onClick={onClick} className={`h-24 rounded-2xl flex flex-col items-center justify-center gap-2 text-sm font-semibold border ${highlight ? 'bg-accent text-zinc-950 border-accent' : 'bg-zinc-900 border-zinc-800 active:bg-zinc-800'}`}>
      <span className={highlight ? '' : 'text-accent'}>{icon}</span>
      {label}
    </button>
  )
}

function Row({ icon, title, value, onClick }: { icon: React.ReactNode; title: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-3 text-left active:bg-zinc-800">
      <span className="text-accent">{icon}</span>
      <span className="flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-zinc-400">{value}</span>
      </span>
      <ChevronRight size={18} className="text-zinc-500" />
    </button>
  )
}

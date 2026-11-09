import { useEffect, useMemo, useState } from 'react'
import { Trophy, Clock, Dumbbell, ListChecks } from 'lucide-react'
import { supabase, me } from '../supabase'
import { useApp } from '../App'
import type { Exercise, Workout, WorkoutSet } from '../types'
import { Button, ErrorText, Sheet } from './ui'
import { PhotoButtons, ShareToggle } from './WorkoutPhoto'
import { setWorkoutPhoto } from '../lib/photos'
import { errMsg, fmtDuration, round } from '../lib/utils'

const pick = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)]

const HYPE = [
  ['🔥', 'HOY SE VIENE PR', 'El hierro no se levanta solo. A por ello.'],
  ['⚡', 'MODO BESTIA: ON', 'Deja el móvil en paz entre series y dale caña.'],
  ['💪', 'NADIE TE VA A REGALAR NADA', 'Cada repetición cuenta. Hazlas todas bien.'],
  ['🦍', 'A ROMPER LA BARRA', 'Hoy entrenas como si te estuvieran mirando.'],
  ['🚀', 'MEJOR QUE AYER', 'Una repetición más o un poco más de peso. Así se crece.'],
  ['🏆', 'LOS RESULTADOS SE GANAN AQUÍ', 'Lo que haces hoy es lo que verás en el espejo mañana.'],
  ['🥵', 'SUDA AHORA, PRESUME DESPUÉS', 'Céntrate, respira y a darlo todo.'],
  ['🧠', 'CABEZA FRÍA, BARRA PESADA', 'Técnica primero. Luego, a apretar.'],
] as const

/** Pantalla a pantalla completa al empezar el entreno, para venirte arriba. */
export function HypeScreen({ onGo }: { onGo: () => void }) {
  const [emoji, title, text] = useMemo(() => pick([...HYPE]), [])
  useEffect(() => {
    try { navigator.vibrate?.([80, 60, 80, 60, 200]) } catch { /* sin vibración */ }
  }, [])
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-8 text-center bg-gradient-to-b from-zinc-950 via-lime-950 to-zinc-950" onClick={onGo}>
      <div className="text-8xl animate-bounce">{emoji}</div>
      <h1 className="mt-6 text-4xl font-black tracking-tight text-accent leading-none">{title}</h1>
      <p className="mt-4 text-lg text-zinc-200">{text}</p>
      <Button className="mt-10 w-full max-w-xs h-16 text-xl font-black" onClick={onGo}>¡VAMOS! 💪</Button>
    </div>
  )
}

const DONE = [
  '¡Entreno completado! Hoy has cumplido. 💪',
  'Otro día más. Así es como se construye un físico. 🔨',
  'Hecho. La constancia gana a la motivación. 🧱',
  '¡Buen trabajo! Tu yo del futuro te lo agradecerá. 🙌',
  'Misión cumplida. Ahora, a comer bien y a descansar. 🍗😴',
]
const DONE_PR = [
  '¡BESTIA! Has batido récords hoy. 🏆🔥',
  '¡Nuevo récord! Esto va hacia arriba. 🚀',
  'Hoy has sido más fuerte que nunca. 🦍',
]

type PR = { name: string; weight: number; reps: number }

/** Resumen al terminar el entreno + opción de foto. */
export function FinishSummary({ workout, sets, exById, onDone }: {
  workout: Workout | null; sets: WorkoutSet[]; exById: Record<string, Exercise>; onDone: () => void
}) {
  const { session } = useApp()
  const [prs, setPrs] = useState<PR[] | null>(null)
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exIds = useMemo(() => [...new Set(sets.map((s) => s.exercise_id))], [sets])
  const reps = sets.reduce((t, s) => t + s.reps, 0)
  // Duración fija: de la hora de inicio a la hora en que pulsaste "Terminar"
  const duration = workout ? fmtDuration(workout.started_at, workout.ended_at || workout.started_at) : ''

  // Récords: el peso máximo de hoy supera tu máximo anterior en ese ejercicio
  useEffect(() => {
    if (!workout) return
    setPrs(null); setPreview(null); setError(null)
    ;(async () => {
      const { data } = await supabase.from('workout_sets').select('exercise_id,weight')
        .eq('user_id', me).in('exercise_id', exIds).neq('workout_id', workout.id)
      const prevMax = new Map<string, number>()
      for (const r of (data as { exercise_id: string; weight: number }[]) || [])
        prevMax.set(r.exercise_id, Math.max(prevMax.get(r.exercise_id) || 0, +r.weight))
      const found: PR[] = []
      for (const id of exIds) {
        const best = sets.filter((s) => s.exercise_id === id).sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0]
        const prev = prevMax.get(id)
        if (best && prev !== undefined && +best.weight > prev) found.push({ name: exById[id]?.name || 'Ejercicio', weight: +best.weight, reps: best.reps })
      }
      setPrs(found)
    })()
  }, [workout?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const phrase = useMemo(() => (prs?.length ? pick(DONE_PR) : pick(DONE)), [prs?.length])

  async function upload(f: File) {
    if (!workout) return
    setBusy(true); setError(null)
    try {
      await setWorkoutPhoto(session.user.id, workout.id, f, share)
      setPreview(URL.createObjectURL(f))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!workout} onClose={onDone} title="Resumen del entreno">
      <div className="space-y-4">
        <p className="text-xl font-extrabold text-accent text-center leading-snug">{phrase}</p>

        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Clock size={18} />} value={duration} label="Duración" />
          <Stat icon={<Dumbbell size={18} />} value={exIds.length} label="Ejercicios" />
          <Stat icon={<ListChecks size={18} />} value={`${sets.length} · ${reps}`} label="Series · reps" />
        </div>

        {prs && prs.length > 0 && (
          <div className="rounded-2xl bg-yellow-400/10 border border-yellow-400/30 p-3 space-y-1">
            {prs.map((p) => (
              <p key={p.name} className="text-sm flex items-center gap-2">
                <Trophy size={16} className="text-yellow-400 shrink-0" />
                <span>Nuevo récord en <b>{p.name}</b>: {round(p.weight, 2)} kg × {p.reps}</span>
              </p>
            ))}
          </div>
        )}

        <ul className="text-sm text-zinc-300 space-y-0.5">
          {exIds.map((id) => {
            const ss = sets.filter((s) => s.exercise_id === id)
            return <li key={id}><b>{exById[id]?.name || 'Ejercicio'}</b> <span className="text-zinc-500">· {ss.map((s) => `${round(+s.weight, 2)}×${s.reps}`).join(' · ')}</span></li>
          })}
        </ul>

        <div className="border-t border-zinc-800 pt-3 space-y-3">
          {preview ? (
            <>
              <img src={preview} alt="Foto del entreno" className="w-full max-h-96 object-cover rounded-2xl" />
              <p className="text-accent font-semibold text-center">¡Foto guardada!{share ? ' Tu grupo ya puede verla.' : ''}</p>
              <Button className="w-full" onClick={onDone}>Listo</Button>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-400">¿Te haces una foto para recordar este entreno?</p>
              <ShareToggle value={share} onChange={setShare} />
              <PhotoButtons onFile={upload} busy={busy} />
              <ErrorText error={error} />
              <Button variant="ghost" className="w-full" onClick={onDone} disabled={busy}>Terminar sin foto</Button>
            </>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-zinc-800/60 p-3 text-center">
      <div className="text-accent flex justify-center">{icon}</div>
      <div className="text-lg font-extrabold mt-1">{value}</div>
      <div className="text-[11px] text-zinc-400">{label}</div>
    </div>
  )
}

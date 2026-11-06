import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Copy, Trash2, Trophy, Timer, Search, ChevronDown, ChevronUp, Play, Flag, Save, History, X } from 'lucide-react'
import { supabase } from '../supabase'
import { useApp } from '../App'
import type { Exercise, Template, Workout, WorkoutSet } from '../types'
import { Button, Card, Empty, ErrorText, Input, SectionTitle, Sheet, Stepper } from '../components/ui'
import { errMsg, fmtDate, kg, num, round } from '../lib/utils'
import { FinishSheet, HistoryPhoto } from '../components/WorkoutPhoto'
import { deletePhotoFile } from '../lib/photos'
import { Camera } from 'lucide-react'

const pendingKey = (id: string) => `wo-pending-${id}`
function readPending(id: string): string[] {
  try { return JSON.parse(localStorage.getItem(pendingKey(id)) || '[]') } catch { return [] }
}
function writePending(id: string, ids: string[]) {
  try { localStorage.setItem(pendingKey(id), JSON.stringify(ids)) } catch { /* sin almacenamiento */ }
}

export default function WorkoutScreen() {
  const [active, setActive] = useState<Workout | null | undefined>(undefined)

  const load = useCallback(async () => {
    const { data } = await supabase.from('workouts').select('*').is('ended_at', null).order('started_at', { ascending: false }).limit(1)
    setActive((data?.[0] as Workout) || null)
  }, [])
  useEffect(() => { load() }, [load])

  if (active === undefined) return null
  return active
    ? <ActiveWorkout workout={active} onEnd={() => setActive(null)} />
    : <Idle onStarted={setActive} />
}

/* ---------------- Sin entreno activo ---------------- */

function Idle({ onStarted }: { onStarted: (w: Workout) => void }) {
  const { exercises } = useApp()
  const [templates, setTemplates] = useState<Template[]>([])
  const [history, setHistory] = useState<(Workout & { workout_sets: WorkoutSet[] })[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const exName = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e.name])), [exercises])

  const load = useCallback(async () => {
    const [t, h] = await Promise.all([
      supabase.from('templates').select('*').order('created_at'),
      supabase.from('workouts').select('*, workout_sets(*)').not('ended_at', 'is', null).order('started_at', { ascending: false }).limit(30),
    ])
    setTemplates((t.data as Template[]) || [])
    setHistory((h.data as (Workout & { workout_sets: WorkoutSet[] })[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function start(template?: Template) {
    setError(null)
    const { data, error } = await supabase.from('workouts').insert({ name: template?.name ?? null }).select().single()
    if (error) return setError(errMsg(error))
    if (template) writePending(data.id, template.exercise_ids)
    onStarted(data as Workout)
  }
  async function reopen(w: Workout) {
    const { data, error } = await supabase.from('workouts').update({ ended_at: null }).eq('id', w.id).select().single()
    if (error) return setError(errMsg(error))
    onStarted(data as Workout)
  }
  async function removeWorkout(w: Workout) {
    if (!confirm('¿Borrar este entreno y todas sus series?')) return
    if (w.photo_path) await deletePhotoFile(w.photo_path)
    await supabase.from('workouts').delete().eq('id', w.id)
    load()
  }
  async function removeTemplate(t: Template) {
    if (!confirm(`¿Borrar la rutina "${t.name}"?`)) return
    await supabase.from('templates').delete().eq('id', t.id)
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-4">Entreno</h1>
      <ErrorText error={error} />
      <Button className="w-full h-16 text-lg" onClick={() => start()}>
        <Play size={22} /> Empezar entreno
      </Button>

      <SectionTitle>Mis rutinas</SectionTitle>
      {templates.length === 0 ? (
        <Card><p className="text-sm text-zinc-400">Aún no tienes rutinas. Haz un entreno y, al final, pulsa <b>«Guardar como rutina»</b> para repetirlo otro día con un toque.</p></Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id} className="flex items-center gap-3 !p-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{t.name}</div>
                <div className="text-xs text-zinc-500 truncate">{t.exercise_ids.map((id) => exName[id]).filter(Boolean).join(' · ')}</div>
              </div>
              <button onClick={() => removeTemplate(t)} className="h-10 w-10 text-zinc-500 flex items-center justify-center" aria-label="Borrar rutina"><Trash2 size={18} /></button>
              <Button className="!min-h-10" onClick={() => start(t)}><Play size={16} /> Empezar</Button>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Historial</SectionTitle>
      {history.length === 0 && <Empty>Aquí aparecerán tus entrenos terminados.</Empty>}
      <div className="space-y-2">
        {history.map((w) => {
          const sets = [...w.workout_sets].sort((a, b) => a.created_at.localeCompare(b.created_at))
          const vol = sets.reduce((s, x) => s + x.weight * x.reps, 0)
          const byEx = groupSets(sets)
          const isOpen = open === w.id
          return (
            <Card key={w.id} className="!p-0">
              <button className="w-full p-4 flex items-center gap-3 text-left" onClick={() => setOpen(isOpen ? null : w.id)}>
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-1.5">{w.name || 'Entreno'} · <span className="text-zinc-400 font-normal">{fmtDate(w.started_at, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    {w.photo_path && <Camera size={14} className="text-accent" aria-label="Tiene foto" />}</div>
                  <div className="text-xs text-zinc-500">{byEx.length} ejercicios · {sets.length} series · {round(vol).toLocaleString('es-ES')} kg de volumen</div>
                </div>
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <HistoryPhoto workout={w} onChange={load} />
                  {byEx.map(([exId, ss]) => (
                    <div key={exId}>
                      <div className="text-sm font-semibold">{exName[exId] || 'Ejercicio'}</div>
                      <div className="text-sm text-zinc-400">{ss.map((s) => `${round(s.weight, 2)}×${s.reps}`).join('  ·  ')}</div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="flex-1" onClick={() => reopen(w)}>Editar</Button>
                    <Button variant="danger" className="flex-1" onClick={() => removeWorkout(w)}><Trash2 size={16} /> Borrar</Button>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function groupSets(sets: WorkoutSet[]): [string, WorkoutSet[]][] {
  const m = new Map<string, WorkoutSet[]>()
  for (const s of sets) {
    if (!m.has(s.exercise_id)) m.set(s.exercise_id, [])
    m.get(s.exercise_id)!.push(s)
  }
  return [...m.entries()]
}

/* ---------------- Entreno en marcha ---------------- */

function ActiveWorkout({ workout, onEnd }: { workout: Workout; onEnd: () => void }) {
  const { exercises, profile } = useApp()
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [pending, setPending] = useState<string[]>(() => readPending(workout.id))
  const [picker, setPicker] = useState(false)
  const [saveTpl, setSaveTpl] = useState(false)
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('workout_sets').select('*').eq('workout_id', workout.id).order('created_at')
      .then(({ data }) => setSets((data as WorkoutSet[]) || []))
  }, [workout.id])

  useEffect(() => {
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(workout.started_at).getTime()) / 1000)
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
      setElapsed(h ? `${h} h ${m} min` : `${m} min`)
    }
    tick()
    const t = setInterval(tick, 30000)
    return () => clearInterval(t)
  }, [workout.started_at])

  const order = useMemo(() => {
    const ids: string[] = []
    for (const s of sets) if (!ids.includes(s.exercise_id)) ids.push(s.exercise_id)
    for (const p of pending) if (!ids.includes(p)) ids.push(p)
    return ids
  }, [sets, pending])

  const exById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises])

  function addExercise(ex: Exercise) {
    const next = [...pending.filter((p) => p !== ex.id), ex.id]
    setPending(next); writePending(workout.id, next)
    setPicker(false)
    setTimeout(() => document.getElementById(`ex-${ex.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }
  function removeExercise(id: string) {
    if (sets.some((s) => s.exercise_id === id)) {
      if (!confirm('¿Quitar este ejercicio y sus series de este entreno?')) return
      supabase.from('workout_sets').delete().eq('workout_id', workout.id).eq('exercise_id', id).then(() => {
        setSets((ss) => ss.filter((s) => s.exercise_id !== id))
      })
    }
    const next = pending.filter((p) => p !== id)
    setPending(next); writePending(workout.id, next)
  }

  async function addSet(exerciseId: string, weight: number, reps: number) {
    setError(null)
    const { data, error } = await supabase.from('workout_sets')
      .insert({ workout_id: workout.id, exercise_id: exerciseId, weight, reps }).select().single()
    if (error) { setError(errMsg(error)); return false }
    setSets((s) => [...s, data as WorkoutSet])
    if (profile.rest_seconds > 0) setRestEnd(Date.now() + profile.rest_seconds * 1000)
    return true
  }
  async function deleteSet(id: string) {
    await supabase.from('workout_sets').delete().eq('id', id)
    setSets((s) => s.filter((x) => x.id !== id))
  }

  async function finish() {
    if (sets.length === 0) {
      if (!confirm('No has apuntado ninguna serie. ¿Descartar este entreno?')) return
      await supabase.from('workouts').delete().eq('id', workout.id)
      done()
    } else {
      const { error } = await supabase.from('workouts').update({ ended_at: new Date().toISOString() }).eq('id', workout.id)
      if (error) return setError(errMsg(error))
      setRestEnd(null)
      setFinished(true) // muestra la ventana de "¿te haces una foto?"
    }
  }
  function done() {
    try { localStorage.removeItem(pendingKey(workout.id)) } catch { /* nada */ }
    onEnd()
  }

  const volume = sets.reduce((s, x) => s + x.weight * x.reps, 0)

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-extrabold">{workout.name || 'Entreno de hoy'}</h1>
          <p className="text-sm text-zinc-400">{elapsed} · {sets.length} series · {round(volume).toLocaleString('es-ES')} kg</p>
        </div>
        <Button onClick={finish} className="!min-h-10"><Flag size={16} /> Terminar</Button>
      </div>
      <ErrorText error={error} />

      <div className="space-y-3 mt-4">
        {order.map((id) => exById[id] && (
          <ExerciseCard
            key={id}
            exercise={exById[id]}
            workoutId={workout.id}
            sets={sets.filter((s) => s.exercise_id === id)}
            onAdd={(w, r) => addSet(id, w, r)}
            onDelete={deleteSet}
            onRemove={() => removeExercise(id)}
          />
        ))}
      </div>

      {order.length === 0 && <Empty>Añade el primer ejercicio para empezar.</Empty>}

      <Button variant="secondary" className="w-full mt-4 h-14" onClick={() => setPicker(true)}>
        <Plus size={20} /> Añadir ejercicio
      </Button>
      {order.length > 0 && (
        <Button variant="ghost" className="w-full mt-2" onClick={() => setSaveTpl(true)}>
          <Save size={18} /> Guardar como rutina
        </Button>
      )}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercise} />
      <SaveTemplate open={saveTpl} onClose={() => setSaveTpl(false)} exerciseIds={order} defaultName={workout.name || ''} />
      {restEnd && <RestTimer end={restEnd} onChange={setRestEnd} />}
      <FinishSheet workout={finished ? workout : null} sets={sets.length} volume={volume} onDone={done} />
    </div>
  )
}

/* ---------------- Tarjeta de un ejercicio ---------------- */

type Board = { user_id: string; display_name: string; weight: number; reps: number; done_at: string; is_me: boolean }

function ExerciseCard({ exercise, workoutId, sets, onAdd, onDelete, onRemove }: {
  exercise: Exercise; workoutId: string; sets: WorkoutSet[]
  onAdd: (w: number, r: number) => Promise<boolean>; onDelete: (id: string) => void; onRemove: () => void
}) {
  const [last, setLast] = useState<WorkoutSet[] | null>(null)
  const [board, setBoard] = useState<Board[]>([])
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [busy, setBusy] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('workout_sets').select('*')
        .eq('exercise_id', exercise.id).neq('workout_id', workoutId)
        .order('created_at', { ascending: false }).limit(30)
      const rows = (data as WorkoutSet[]) || []
      const lastWorkout = rows[0]?.workout_id
      const lastSets = rows.filter((r) => r.workout_id === lastWorkout).reverse()
      setLast(lastSets)
      const { data: b } = await supabase.rpc('exercise_leaderboard', { p_exercise: exercise.id })
      setBoard(((b as Board[]) || []).sort((x, y) => y.weight - x.weight || y.reps - x.reps))
    })()
  }, [exercise.id, workoutId])

  // Rellena kilos/reps con la serie anterior (de hoy o del último entreno)
  useEffect(() => {
    if (initialized.current) return
    const ref = sets[sets.length - 1] || last?.[0]
    if (ref) { setWeight(String(round(ref.weight, 2))); setReps(String(ref.reps)); initialized.current = true }
    else if (last) initialized.current = true
  }, [sets, last])

  async function add(w = num(weight), r = Math.round(num(reps))) {
    if (r <= 0) return
    setBusy(true)
    await onAdd(w, r)
    setBusy(false)
  }

  const myBest = board.find((b) => b.is_me)
  const friends = board.filter((b) => !b.is_me)
  const lastOne = sets[sets.length - 1]

  return (
    <Card className="scroll-mt-20" >
      <div id={`ex-${exercise.id}`} className="scroll-mt-20" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-lg leading-tight">{exercise.name}</h3>
          <p className="text-xs text-zinc-500">{exercise.muscle}</p>
        </div>
        <button onClick={onRemove} className="h-9 w-9 -mr-1 -mt-1 rounded-full text-zinc-500 flex items-center justify-center active:bg-zinc-800" aria-label="Quitar ejercicio"><X size={18} /></button>
      </div>

      <div className="mt-2 text-sm space-y-1">
        {last && last.length > 0 ? (
          <p className="text-zinc-400 flex gap-1.5"><History size={15} className="mt-0.5 shrink-0" />
            <span>Última vez ({fmtDate(last[0].created_at)}): <span className="text-zinc-200">{last.map((s) => `${round(s.weight, 2)}×${s.reps}`).join(' · ')}</span></span>
          </p>
        ) : last && <p className="text-zinc-500">Primera vez con este ejercicio 💪</p>}
        {myBest && <p className="text-zinc-400 flex gap-1.5"><Trophy size={15} className="mt-0.5 shrink-0 text-yellow-400" />Tu récord: <span className="text-zinc-200">{kg(myBest.weight)} × {myBest.reps}</span></p>}
        {friends.length > 0 && (
          <p className="text-zinc-400 flex gap-1.5"><Trophy size={15} className="mt-0.5 shrink-0 text-accent" />
            <span>Tus amigos: <span className="text-zinc-200">{friends.slice(0, 3).map((f) => `${f.display_name} ${round(f.weight, 2)}×${f.reps}`).join(' · ')}</span></span>
          </p>
        )}
      </div>

      {sets.length > 0 && (
        <ol className="mt-3 space-y-1">
          {sets.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 bg-zinc-800/60 rounded-xl px-3 h-11">
              <span className="text-xs text-zinc-500 w-12">Serie {i + 1}</span>
              <span className="flex-1 font-semibold">{round(s.weight, 2)} kg × {s.reps}</span>
              <button onClick={() => onDelete(s.id)} className="h-9 w-9 text-zinc-500 flex items-center justify-center" aria-label="Borrar serie"><Trash2 size={16} /></button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex gap-2 mt-3">
        <Stepper label="Kilos" value={weight} onChange={setWeight} step={2.5} />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} />
      </div>
      <div className="flex gap-2 mt-2">
        <Button className="flex-1 h-14" disabled={busy || !reps} onClick={() => add()}>
          <Plus size={20} /> Añadir serie
        </Button>
        {lastOne && (
          <Button variant="secondary" className="h-14" disabled={busy} onClick={() => add(lastOne.weight, lastOne.reps)} aria-label="Repetir la última serie">
            <Copy size={18} /> Repetir
          </Button>
        )}
      </div>
    </Card>
  )
}

/* ---------------- Selector de ejercicios ---------------- */

const MUSCLES = ['Pecho', 'Espalda', 'Piernas', 'Glúteos', 'Hombros', 'Bíceps', 'Tríceps', 'Core', 'Otro']
/** Minúsculas y sin tildes, para buscar y comparar nombres. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim()

export function ExercisePicker({ open, onClose, onPick, onlyIds }: {
  open: boolean; onClose: () => void; onPick: (e: Exercise) => void; onlyIds?: Set<string>
}) {
  const { exercises, reloadExercises, session } = useApp()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState('Pecho')
  const [error, setError] = useState<string | null>(null)

  const filtered = exercises.filter((e) => (!onlyIds || onlyIds.has(e.id)) && norm(e.name).includes(norm(q)))
  const groups = MUSCLES.map((m) => [m, filtered.filter((e) => e.muscle === m)] as const).filter(([, l]) => l.length)
  const others = filtered.filter((e) => !MUSCLES.includes(e.muscle))

  async function create() {
    setError(null)
    if (!name.trim()) return
    // Si ya existe uno con el mismo nombre (común, tuyo o del grupo), usa ese
    const existing = exercises.find((e) => norm(e.name) === norm(name))
    if (existing) { setCreating(false); setName(''); onPick(existing); return }
    const { data, error } = await supabase.from('exercises').insert({ name: name.trim(), muscle, user_id: session.user.id }).select().single()
    if (error) return setError(errMsg(error))
    await reloadExercises()
    setCreating(false); setName('')
    onPick(data as Exercise)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Elegir ejercicio">
      {creating ? (
        <div className="space-y-3">
          <Input label="Nombre del ejercicio" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Músculo</span>
            <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="w-full min-h-12 px-3 rounded-xl bg-zinc-800 border border-zinc-700">
              {MUSCLES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <ErrorText error={error} />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={create} disabled={!name.trim()}>Crear y añadir</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
              className="w-full min-h-12 pl-10 pr-3 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-accent"
            />
          </div>
          {!onlyIds && (
            <Button variant="secondary" className="w-full mb-3" onClick={() => { setCreating(true); setName(q) }}>
              <Plus size={18} /> Crear ejercicio nuevo
            </Button>
          )}
          {[...groups, ...(others.length ? [['Otros', others] as const] : [])].map(([m, list]) => (
            <div key={m} className="mb-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{m}</div>
              {list.map((e) => (
                <button key={e.id} onClick={() => onPick(e)} className="w-full text-left min-h-12 px-3 rounded-xl active:bg-zinc-800 flex items-center justify-between">
                  {e.name}
                  {e.user_id && (
                    <span className={`text-[10px] border rounded px-1 ${e.user_id === session.user.id ? 'text-zinc-500 border-zinc-700' : 'text-accent border-accent/40'}`}>
                      {e.user_id === session.user.id ? 'propio' : 'grupo'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && <Empty>No hay ejercicios con ese nombre.</Empty>}
        </>
      )}
    </Sheet>
  )
}

/* ---------------- Guardar rutina ---------------- */

function SaveTemplate({ open, onClose, exerciseIds, defaultName }: { open: boolean; onClose: () => void; exerciseIds: string[]; defaultName: string }) {
  const [name, setName] = useState(defaultName)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (open) { setDone(false); setName(defaultName) } }, [open, defaultName])
  async function save() {
    const { error } = await supabase.from('templates').insert({ name: name.trim(), exercise_ids: exerciseIds })
    if (error) return setError(errMsg(error))
    setDone(true)
    setTimeout(onClose, 900)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Guardar como rutina">
      {done ? <p className="text-accent py-4 text-center font-semibold">¡Rutina guardada!</p> : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Se guardarán los {exerciseIds.length} ejercicios de este entreno para empezar con ellos otro día.</p>
          <Input label="Nombre (ej. Día de pierna)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <ErrorText error={error} />
          <Button className="w-full" onClick={save} disabled={!name.trim()}>Guardar</Button>
        </div>
      )}
    </Sheet>
  )
}

/* ---------------- Temporizador de descanso ---------------- */

function beep() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880
      o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.3, ctx.currentTime + t)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15)
    })
  } catch { /* sin sonido */ }
  try { navigator.vibrate?.([300, 150, 300]) } catch { /* sin vibración */ }
}

function RestTimer({ end, onChange }: { end: number; onChange: (v: number | null) => void }) {
  const [left, setLeft] = useState(Math.ceil((end - Date.now()) / 1000))
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.ceil((end - Date.now()) / 1000)
      setLeft(l)
      if (l <= 0) { clearInterval(t); beep(); setTimeout(() => onChange(null), 2500) }
    }, 250)
    return () => clearInterval(t)
  }, [end, onChange])
  const m = Math.floor(Math.max(0, left) / 60), s = Math.max(0, left) % 60
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-4 pb-2">
      <div className={`max-w-lg mx-auto rounded-2xl border px-4 py-2 flex items-center gap-3 shadow-xl ${left <= 0 ? 'bg-accent text-zinc-950 border-accent' : 'bg-zinc-900 border-zinc-700'}`}>
        <Timer size={22} />
        <div className="flex-1">
          <div className="text-xs opacity-70">{left <= 0 ? '¡A por la siguiente serie!' : 'Descanso'}</div>
          <div className="text-2xl font-bold tabular-nums">{m}:{String(s).padStart(2, '0')}</div>
        </div>
        {left > 0 && <button className="h-10 px-3 rounded-xl bg-zinc-800 font-semibold" onClick={() => onChange(end + 15000)}>+15 s</button>}
        <button className={`h-10 px-3 rounded-xl font-semibold ${left <= 0 ? 'bg-zinc-950/20' : 'bg-zinc-800'}`} onClick={() => onChange(null)}>{left <= 0 ? 'OK' : 'Saltar'}</button>
      </div>
    </div>
  )
}

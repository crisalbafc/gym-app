import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Copy, Trash2, Trophy, Timer, Search, ChevronDown, ChevronUp, Play, Flag, Save, History, X, Pencil, Target, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../supabase'
import { useApp } from '../App'
import type { Exercise, PlanItem, Template, Workout, WorkoutSet } from '../types'
import { Button, Card, Empty, ErrorText, Input, SectionTitle, Sheet, Stepper } from '../components/ui'
import { e1rm, errMsg, fmtDate, fmtDuration, num, round } from '../lib/utils'
import { HistoryPhoto } from '../components/WorkoutPhoto'
import { FinishSummary, HypeScreen } from '../components/Motivation'
import { deletePhotoFile } from '../lib/photos'
import { Camera } from 'lucide-react'

const pendingKey = (id: string) => `wo-pending-${id}`
function readPending(id: string): string[] {
  try { return JSON.parse(localStorage.getItem(pendingKey(id)) || '[]') } catch { return [] }
}
function writePending(id: string, ids: string[]) {
  try { localStorage.setItem(pendingKey(id), JSON.stringify(ids)) } catch { /* sin almacenamiento */ }
}
// Objetivo de cada ejercicio (ej. "4 × 8-10") cuando el entreno sale de una rutina
const targetsKey = (id: string) => `wo-targets-${id}`
function readTargets(id: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(targetsKey(id)) || '{}') } catch { return {} }
}
function writeTargets(id: string, t: Record<string, string>) {
  try { localStorage.setItem(targetsKey(id), JSON.stringify(t)) } catch { /* sin almacenamiento */ }
}
// Hora de fin original de un entreno antiguo que estás editando
const editKey = (id: string) => `wo-edit-end-${id}`
function readEditEnd(id: string): string | null {
  try { return localStorage.getItem(editKey(id)) } catch { return null }
}
function writeEditEnd(id: string, iso: string) {
  try { localStorage.setItem(editKey(id), iso) } catch { /* sin almacenamiento */ }
}

export default function WorkoutScreen() {
  const [active, setActive] = useState<Workout | null | undefined>(undefined)
  const [hype, setHype] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('workouts').select('*').is('ended_at', null).order('started_at', { ascending: false }).limit(1)
    setActive((data?.[0] as Workout) || null)
  }, [])
  useEffect(() => { load() }, [load])

  if (active === undefined) return null
  return (
    <>
      {active
        ? <ActiveWorkout workout={active} onEnd={() => setActive(null)} />
        : <Idle onStarted={(w, fresh) => { setActive(w); if (fresh) setHype(true) }} />}
      {hype && <HypeScreen onGo={() => setHype(false)} />}
    </>
  )
}

/* ---------------- Sin entreno activo ---------------- */

function Idle({ onStarted }: { onStarted: (w: Workout, fresh: boolean) => void }) {
  const { exercises } = useApp()
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
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
    if (template) {
      const plan = template.plan?.length ? template.plan : template.exercise_ids.map((id) => ({ exercise_id: id, sets: null, reps: '' }))
      writePending(data.id, plan.map((p) => p.exercise_id))
      writeTargets(data.id, Object.fromEntries(plan.filter((p) => p.sets || p.reps)
        .map((p) => [p.exercise_id, `${p.sets ?? '?'} × ${p.reps || '?'}`])))
    }
    onStarted(data as Workout, true)
  }
  async function reopen(w: Workout) {
    // Guardamos la hora real de fin para no perderla al editar
    if (w.ended_at) writeEditEnd(w.id, w.ended_at)
    const { data, error } = await supabase.from('workouts').update({ ended_at: null }).eq('id', w.id).select().single()
    if (error) return setError(errMsg(error))
    onStarted(data as Workout, false)
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

      <SectionTitle right={
        <button onClick={() => setEditing('new')} className="h-9 px-3 rounded-full bg-zinc-800 text-accent text-sm font-semibold flex items-center gap-1">
          <Plus size={16} /> Nueva rutina
        </button>
      }>Mis rutinas</SectionTitle>
      {templates.length === 0 ? (
        <Card><p className="text-sm text-zinc-400">Aún no tienes rutinas. Pulsa <b>«Nueva rutina»</b> para montarla con tus ejercicios, series y repeticiones, o al terminar un entreno pulsa <b>«Guardar como rutina»</b>.</p></Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id} className="flex items-center gap-2 !p-3">
              <button className="flex-1 min-w-0 text-left" onClick={() => setEditing(t)}>
                <div className="font-semibold truncate">{t.name}</div>
                <div className="text-xs text-zinc-500 truncate">
                  {(t.plan?.length ? t.plan : t.exercise_ids.map((id) => ({ exercise_id: id, sets: null, reps: '' })))
                    .map((p) => exName[p.exercise_id] && `${exName[p.exercise_id]}${p.sets ? ` ${p.sets}×${p.reps || '?'}` : ''}`)
                    .filter(Boolean).join(' · ')}
                </div>
              </button>
              <button onClick={() => setEditing(t)} className="h-10 w-10 text-zinc-400 flex items-center justify-center" aria-label="Editar rutina"><Pencil size={18} /></button>
              <Button className="!min-h-10" onClick={() => start(t)}><Play size={16} /> Empezar</Button>
            </Card>
          ))}
        </div>
      )}
      <RoutineEditor
        routine={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }}
        onDelete={async (t) => { await removeTemplate(t); setEditing(null) }}
      />

      <SectionTitle>Historial</SectionTitle>
      {history.length === 0 && <Empty>Aquí aparecerán tus entrenos terminados.</Empty>}
      <div className="space-y-2">
        {history.map((w) => {
          const sets = [...w.workout_sets].sort((a, b) => a.created_at.localeCompare(b.created_at))
          const byEx = groupSets(sets)
          const isOpen = open === w.id
          return (
            <Card key={w.id} className="!p-0">
              <button className="w-full p-4 flex items-center gap-3 text-left" onClick={() => setOpen(isOpen ? null : w.id)}>
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-1.5">{w.name || 'Entreno'} · <span className="text-zinc-400 font-normal">{fmtDate(w.started_at, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    {w.photo_path && <Camera size={14} className="text-accent" aria-label="Tiene foto" />}</div>
                  <div className="text-xs text-zinc-500">{w.ended_at ? `${fmtDuration(w.started_at, w.ended_at)} · ` : ''}{byEx.length} ejercicios · {sets.length} series</div>
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
  const { exercises, profile, setRestEnd } = useApp()
  const [sets, setSets] = useState<WorkoutSet[]>([])
  const [pending, setPending] = useState<string[]>(() => readPending(workout.id))
  const [targets] = useState<Record<string, string>>(() => readTargets(workout.id))
  const [picker, setPicker] = useState(false)
  const [saveTpl, setSaveTpl] = useState(false)
  const [finishedAt, setFinishedAt] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Si vienes de "Editar" en el historial, el entreno ya terminó: no hay cronómetro
  const [editEnd] = useState<string | null>(() => readEditEnd(workout.id))

  useEffect(() => {
    supabase.from('workout_sets').select('*').eq('workout_id', workout.id).order('created_at')
      .then(({ data }) => setSets((data as WorkoutSet[]) || []))
  }, [workout.id])

  useEffect(() => {
    const end = finishedAt || editEnd
    const tick = () => setElapsed(fmtDuration(workout.started_at, end || new Date().toISOString()))
    tick()
    if (end) return // entreno terminado: duración fija
    const t = setInterval(tick, 30000)
    return () => clearInterval(t)
  }, [workout.started_at, finishedAt, editEnd])

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
    if (profile.rest_seconds > 0 && !editEnd) setRestEnd(Date.now() + profile.rest_seconds * 1000)
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
      // Al editar un entreno antiguo se conserva su hora de fin real
      const end = editEnd || new Date().toISOString()
      const { error } = await supabase.from('workouts').update({ ended_at: end }).eq('id', workout.id)
      if (error) return setError(errMsg(error))
      setRestEnd(null)
      if (editEnd) done()
      else setFinishedAt(end) // muestra el resumen
    }
  }
  function done() {
    try {
      localStorage.removeItem(pendingKey(workout.id))
      localStorage.removeItem(targetsKey(workout.id))
      localStorage.removeItem(editKey(workout.id))
    } catch { /* nada */ }
    onEnd()
  }


  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          {editEnd && <p className="text-xs font-semibold text-sky-300 uppercase tracking-wide">Editando entreno del {fmtDate(workout.started_at, { weekday: 'short', day: 'numeric', month: 'short' })}</p>}
          <h1 className="text-2xl font-extrabold">{workout.name || (editEnd ? 'Entreno' : 'Entreno de hoy')}</h1>
          <p className="text-sm text-zinc-400">{elapsed} · {order.length} ejercicios · {sets.length} series</p>
        </div>
        <Button onClick={finish} className="!min-h-10">
          {editEnd ? <><Save size={16} /> Guardar cambios</> : <><Flag size={16} /> Terminar</>}
        </Button>
      </div>
      <ErrorText error={error} />

      <div className="space-y-3 mt-4">
        {order.map((id) => exById[id] && (
          <ExerciseCard
            key={id}
            exercise={exById[id]}
            target={targets[id]}
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
      <SaveTemplate open={saveTpl} onClose={() => setSaveTpl(false)} plan={order.map((id) => planFromSets(id, sets.filter((s) => s.exercise_id === id)))} defaultName={workout.name || ''} />
      <FinishSummary workout={finishedAt ? { ...workout, ended_at: finishedAt } : null} sets={sets} exById={exById} onDone={done} />
    </div>
  )
}

/* ---------------- Tarjeta de un ejercicio ---------------- */

type Board = { user_id: string; display_name: string; weight: number; reps: number; done_at: string; is_me: boolean }

function ExerciseCard({ exercise, workoutId, sets, onAdd, onDelete, onRemove, target }: {
  exercise: Exercise; workoutId: string; sets: WorkoutSet[]; target?: string
  onAdd: (w: number, r: number) => Promise<boolean>; onDelete: (id: string) => void; onRemove: () => void
}) {
  const [last, setLast] = useState<WorkoutSet[] | null>(null)
  const [board, setBoard] = useState<Board[]>([])
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('workout_sets').select('*')
        .eq('exercise_id', exercise.id).neq('workout_id', workoutId)
        .order('created_at', { ascending: false }).limit(30)
      const rows = (data as WorkoutSet[]) || []
      const lastWorkout = rows[0]?.workout_id
      setLast(rows.filter((r) => r.workout_id === lastWorkout).reverse())
      const { data: b } = await supabase.rpc('exercise_leaderboard', { p_exercise: exercise.id })
      setBoard(((b as Board[]) || []).sort((x, y) => y.weight - x.weight || y.reps - x.reps))
    })()
  }, [exercise.id, workoutId])

  // Prepara la siguiente serie con lo que hiciste en esa misma serie la sesión anterior
  // (si no hay, con tu última serie de hoy)
  const nextIdx = sets.length
  const prevForNext = last?.[nextIdx]
  useEffect(() => {
    if (last === null) return
    const ref = prevForNext || sets[sets.length - 1] || last[last.length - 1]
    if (ref) { setWeight(String(round(+ref.weight, 2))); setReps(String(ref.reps)) }
  }, [nextIdx, last]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(w = num(weight), r = Math.round(num(reps))) {
    if (r <= 0) return
    setBusy(true)
    await onAdd(w, r)
    setBusy(false)
  }

  const myBest = board.find((b) => b.is_me)
  const friends = board.filter((b) => !b.is_me)
  const lastOne = sets[sets.length - 1]
  const fmt = (s: { weight: number; reps: number }) => `${round(+s.weight, 2)} kg × ${s.reps}`
  // Compara una serie de hoy con la misma serie de la sesión anterior
  const vs = (s: WorkoutSet, i: number) => {
    const p = last?.[i]
    if (!p) return null
    const d = e1rm(+s.weight, s.reps) - e1rm(+p.weight, p.reps)
    return d > 0.01 ? 'up' : d < -0.01 ? 'down' : 'same'
  }

  return (
    <Card className="scroll-mt-20">
      <div id={`ex-${exercise.id}`} className="scroll-mt-20" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-lg leading-tight">{exercise.name}</h3>
          <p className="text-xs text-zinc-500">{exercise.muscle}</p>
        </div>
        <button onClick={onRemove} className="h-9 w-9 -mr-1 -mt-1 rounded-full text-zinc-500 flex items-center justify-center active:bg-zinc-800" aria-label="Quitar ejercicio"><X size={18} /></button>
      </div>

      {target && <p className="mt-2 text-sm text-accent flex gap-1.5 font-semibold"><Target size={15} className="mt-0.5 shrink-0" />Objetivo: {target}</p>}

      {/* Sesión anterior, serie a serie */}
      {last && last.length > 0 && (
        <div className="mt-3 rounded-xl bg-sky-500/10 border border-sky-500/20 p-3">
          <div className="text-xs font-semibold text-sky-300 flex items-center gap-1.5 mb-1.5">
            <History size={14} /> Sesión anterior · {fmtDate(last[0].created_at, { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          <ol className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
            {last.map((s, i) => (
              <li key={s.id} className={i === nextIdx ? 'text-zinc-50 font-semibold' : 'text-zinc-300'}>
                <span className="text-zinc-500 text-xs mr-1">S{i + 1}</span>{fmt(s)}
              </li>
            ))}
          </ol>
          <p className="text-xs text-zinc-400 mt-1.5">💡 Intenta igualar o mejorar cada serie: un poco más de peso o una repetición más.</p>
        </div>
      )}
      {last && last.length === 0 && <p className="mt-2 text-sm text-zinc-500">Primera vez con este ejercicio 💪</p>}

      <div className="mt-2 text-sm space-y-1">
        {myBest && <p className="text-zinc-400 flex gap-1.5"><Trophy size={15} className="mt-0.5 shrink-0 text-yellow-400" />Tu récord: <span className="text-zinc-200">{fmt(myBest)}</span></p>}
        {friends.length > 0 && (
          <p className="text-zinc-400 flex gap-1.5"><Trophy size={15} className="mt-0.5 shrink-0 text-accent" />
            <span>Tus amigos: <span className="text-zinc-200">{friends.slice(0, 3).map((f) => `${f.display_name} ${round(f.weight, 2)}×${f.reps}`).join(' · ')}</span></span>
          </p>
        )}
      </div>

      {sets.length > 0 && (
        <ol className="mt-3 space-y-1">
          {sets.map((s, i) => {
            const c = vs(s, i)
            return (
              <li key={s.id} className="flex items-center gap-2 bg-zinc-800/60 rounded-xl px-3 h-11">
                <span className="text-xs text-zinc-500 w-12">Serie {i + 1}</span>
                <span className="flex-1 font-semibold">{fmt(s)}</span>
                {c && <span className={`text-xs font-semibold ${c === 'up' ? 'text-accent' : c === 'down' ? 'text-orange-300' : 'text-zinc-500'}`}>
                  {c === 'up' ? '▲ mejor' : c === 'down' ? '▼' : '= igual'}
                </span>}
                <button onClick={() => onDelete(s.id)} className="h-9 w-9 text-zinc-500 flex items-center justify-center" aria-label="Borrar serie"><Trash2 size={16} /></button>
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-3 text-xs text-zinc-400">
        Serie {nextIdx + 1}{prevForNext ? <> · la sesión anterior: <b className="text-sky-300">{fmt(prevForNext)}</b></> : null}
      </div>
      <div className="flex gap-2 mt-1">
        <Stepper label="Kilos" value={weight} onChange={setWeight} step={2.5} />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} />
      </div>
      <div className="flex gap-2 mt-2">
        <Button className="flex-1 h-14" disabled={busy || !reps} onClick={() => add()}>
          <Plus size={20} /> Añadir serie
        </Button>
        {lastOne && (
          <Button variant="secondary" className="h-14" disabled={busy} onClick={() => add(+lastOne.weight, lastOne.reps)} aria-label="Repetir la última serie">
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

/** Convierte lo hecho en un ejercicio en un objetivo de rutina (nº de series × reps más habituales). */
function planFromSets(exerciseId: string, ss: WorkoutSet[]): PlanItem {
  if (!ss.length) return { exercise_id: exerciseId, sets: null, reps: '' }
  const reps = ss.map((s) => s.reps)
  const min = Math.min(...reps), max = Math.max(...reps)
  return { exercise_id: exerciseId, sets: ss.length, reps: min === max ? String(min) : `${min}-${max}` }
}

function SaveTemplate({ open, onClose, plan, defaultName }: { open: boolean; onClose: () => void; plan: PlanItem[]; defaultName: string }) {
  const [name, setName] = useState(defaultName)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (open) { setDone(false); setName(defaultName) } }, [open, defaultName])
  async function save() {
    const { error } = await supabase.from('templates').insert({ name: name.trim(), exercise_ids: plan.map((p) => p.exercise_id), plan })
    if (error) return setError(errMsg(error))
    setDone(true)
    setTimeout(onClose, 900)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Guardar como rutina">
      {done ? <p className="text-accent py-4 text-center font-semibold">¡Rutina guardada!</p> : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Se guardarán los {plan.length} ejercicios de este entreno, con sus series y repeticiones, para empezar con ellos otro día.</p>
          <Input label="Nombre (ej. Día de pierna)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <ErrorText error={error} />
          <Button className="w-full" onClick={save} disabled={!name.trim()}>Guardar</Button>
        </div>
      )}
    </Sheet>
  )
}

/* ---------------- Crear / editar rutina ---------------- */

function RoutineEditor({ routine, onClose, onSaved, onDelete }: {
  routine: Template | 'new' | null; onClose: () => void; onSaved: () => void; onDelete: (t: Template) => void
}) {
  const { exercises } = useApp()
  const exById = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises])
  const [name, setName] = useState('')
  const [items, setItems] = useState<PlanItem[]>([])
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = routine === 'new'

  useEffect(() => {
    if (!routine) return
    setError(null); setBusy(false)
    if (routine === 'new') { setName(''); setItems([]); return }
    setName(routine.name)
    setItems(routine.plan?.length ? routine.plan.map((p) => ({ ...p }))
      : routine.exercise_ids.map((id) => ({ exercise_id: id, sets: null, reps: '' })))
  }, [routine])

  const update = (i: number, patch: Partial<PlanItem>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, d: number) => setItems((l) => {
    const j = i + d
    if (j < 0 || j >= l.length) return l
    const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c
  })

  async function save() {
    setBusy(true); setError(null)
    const row = { name: name.trim(), exercise_ids: items.map((x) => x.exercise_id), plan: items }
    const { error } = routine && routine !== 'new'
      ? await supabase.from('templates').update(row).eq('id', routine.id)
      : await supabase.from('templates').insert(row)
    setBusy(false)
    if (error) return setError(errMsg(error).includes('plan') ? 'Falta actualizar la base de datos (archivo 006-rutinas.sql).' : errMsg(error))
    onSaved()
  }

  return (
    <>
      <Sheet open={!!routine} onClose={onClose} title={isNew ? 'Nueva rutina' : 'Editar rutina'}>
        <div className="space-y-3">
          <Input label="Nombre (ej. Lunes · Pecho y tríceps)" value={name} onChange={(e) => setName(e.target.value)} />

          {items.length === 0 && <Empty>Añade los ejercicios de tu rutina.</Empty>}
          <ol className="space-y-2">
            {items.map((it, i) => (
              <li key={`${it.exercise_id}-${i}`} className="rounded-2xl bg-zinc-800/60 p-3">
                <div className="flex items-center gap-1">
                  <span className="text-zinc-500 text-sm w-5">{i + 1}.</span>
                  <span className="flex-1 font-semibold truncate">{exById[it.exercise_id]?.name || 'Ejercicio'}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="h-9 w-9 text-zinc-400 disabled:opacity-20 flex items-center justify-center" aria-label="Subir"><ArrowUp size={16} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="h-9 w-9 text-zinc-400 disabled:opacity-20 flex items-center justify-center" aria-label="Bajar"><ArrowDown size={16} /></button>
                  <button onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="h-9 w-9 text-zinc-500 flex items-center justify-center" aria-label="Quitar"><X size={16} /></button>
                </div>
                <div className="flex items-center gap-2 mt-2 text-sm">
                  <input
                    inputMode="numeric" placeholder="4" value={it.sets ?? ''}
                    onChange={(e) => update(i, { sets: e.target.value ? Math.max(1, Math.round(num(e.target.value))) : null })}
                    className="w-16 h-11 rounded-xl bg-zinc-900 border border-zinc-700 text-center font-semibold focus:outline-none focus:border-accent" aria-label="Series"
                  />
                  <span className="text-zinc-400">series ×</span>
                  <input
                    placeholder="8-10" value={it.reps}
                    onChange={(e) => update(i, { reps: e.target.value.slice(0, 12) })}
                    className="w-20 h-11 rounded-xl bg-zinc-900 border border-zinc-700 text-center font-semibold focus:outline-none focus:border-accent" aria-label="Repeticiones"
                  />
                  <span className="text-zinc-400">reps</span>
                </div>
              </li>
            ))}
          </ol>

          <Button variant="secondary" className="w-full" onClick={() => setPicker(true)}><Plus size={18} /> Añadir ejercicio</Button>
          <p className="text-xs text-zinc-500">Series y repeticiones son opcionales. En reps puedes poner un rango, como «8-10».</p>
          <ErrorText error={error} />
          <Button className="w-full" onClick={save} disabled={busy || !name.trim() || items.length === 0}>
            <Save size={18} /> {busy ? 'Guardando…' : 'Guardar rutina'}
          </Button>
          {!isNew && routine && (
            <Button variant="danger" className="w-full" onClick={() => onDelete(routine)}><Trash2 size={18} /> Borrar rutina</Button>
          )}
        </div>
      </Sheet>
      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(e) => { setItems((l) => [...l, { exercise_id: e.id, sets: 3, reps: '10' }]); setPicker(false) }}
      />
    </>
  )
}

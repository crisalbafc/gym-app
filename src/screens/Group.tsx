import { useCallback, useEffect, useState } from 'react'
import { Users, Share2, Trophy, LogOut, ChevronDown, Copy } from 'lucide-react'
import { supabase } from '../supabase'
import { useApp } from '../App'
import type { Exercise } from '../types'
import { Button, Card, Empty, ErrorText, Input, SectionTitle } from '../components/ui'
import { ExercisePicker } from './Workout'
import { errMsg, fmtDate, round } from '../lib/utils'

type G = { id: string; name: string; invite_code: string }
type Person = { user_id: string; display_name: string }
type Board = { user_id: string; display_name: string; weight: number; reps: number; done_at: string; is_me: boolean }

export default function Group() {
  const { profile, exercises } = useApp()
  const [groups, setGroups] = useState<G[] | null>(null)
  const [people, setPeople] = useState<Record<string, Person[]>>({})
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ex, setEx] = useState<Exercise | null>(null)
  const [board, setBoard] = useState<Board[]>([])
  const [picker, setPicker] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('groups').select('id,name,invite_code').order('created_at')
    const gs = (data as G[]) || []
    setGroups(gs)
    const entries = await Promise.all(gs.map(async (g) => {
      const { data } = await supabase.rpc('group_people', { gid: g.id })
      return [g.id, (data as Person[]) || []] as const
    }))
    setPeople(Object.fromEntries(entries))
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!ex && exercises.length) setEx(exercises.find((e) => e.name === 'Press banca' && !e.user_id) || null)
  }, [exercises, ex])

  useEffect(() => {
    if (!ex) return
    supabase.rpc('exercise_leaderboard', { p_exercise: ex.id }).then(({ data }) => {
      setBoard(((data as Board[]) || []).sort((a, b) => b.weight - a.weight || b.reps - a.reps))
    })
  }, [ex, groups])

  async function create() {
    setError(null)
    const { error } = await supabase.rpc('create_group', { p_name: name })
    if (error) return setError(errMsg(error))
    setName(''); load()
  }
  async function join() {
    setError(null)
    const { error } = await supabase.rpc('join_group', { p_code: code })
    if (error) return setError(errMsg(error).includes('no válido') ? 'Ese código no existe. Revísalo con tu amigo.' : errMsg(error))
    setCode(''); load()
  }
  async function leave(g: G) {
    if (!confirm(`¿Salir del grupo "${g.name}"?`)) return
    await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', profile.id)
    load()
  }
  async function share(g: G) {
    const url = location.origin + location.pathname
    const text = `¡Únete a mi grupo "${g.name}" en GymLog! 💪\n1. Entra en ${url}\n2. Crea tu cuenta\n3. Ve a Grupo (icono de personas) y mete el código: ${g.invite_code}`
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(text); setCopied(g.id); setTimeout(() => setCopied(null), 1500) }
    } catch { /* cancelado */ }
  }

  if (!groups) return null

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">Grupo de amigos</h1>
      <p className="text-sm text-zinc-400 mb-4">Solo se comparten tus récords por ejercicio. Tu dieta, peso y medidas son siempre privados.</p>
      {!profile.share_records && (
        <p className="text-sm text-orange-300 bg-orange-500/10 rounded-xl px-3 py-2 mb-3">Ahora mismo no compartes tus récords (puedes cambiarlo en Ajustes).</p>
      )}
      <ErrorText error={error} />

      {groups.map((g) => (
        <Card key={g.id} className="mb-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2"><Users size={18} className="text-accent" /> {g.name}</h2>
              <p className="text-sm text-zinc-400">Código de invitación: <b className="text-zinc-100 tracking-widest">{g.invite_code}</b></p>
            </div>
            <button onClick={() => leave(g)} className="h-9 w-9 text-zinc-500 flex items-center justify-center" aria-label="Salir del grupo"><LogOut size={18} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {(people[g.id] || []).map((p) => (
              <span key={p.user_id} className="text-sm bg-zinc-800 rounded-full px-3 py-1">{p.display_name}{p.user_id === profile.id ? ' (tú)' : ''}</span>
            ))}
          </div>
          <Button variant="secondary" className="w-full mt-3" onClick={() => share(g)}>
            {copied === g.id ? <><Copy size={18} /> Copiado</> : <><Share2 size={18} /> Invitar amigos</>}
          </Button>
        </Card>
      ))}

      {groups.length > 0 && (
        <>
          <SectionTitle>Ranking</SectionTitle>
          <Card>
            <button onClick={() => setPicker(true)} className="w-full min-h-12 px-3 rounded-xl bg-zinc-800 flex items-center justify-between mb-3">
              <span className="font-semibold">{ex?.name || 'Elige ejercicio'}</span><ChevronDown size={18} />
            </button>
            {board.length === 0 ? <Empty>Nadie ha hecho este ejercicio todavía.</Empty> : (
              <ol className="space-y-1">
                {board.map((b, i) => (
                  <li key={b.user_id} className={`flex items-center gap-3 rounded-xl px-3 h-12 ${b.is_me ? 'bg-accent/10 border border-accent/30' : 'bg-zinc-800/60'}`}>
                    <span className="w-6 text-center font-bold">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                    <span className="flex-1 truncate">{b.display_name}{b.is_me ? ' (tú)' : ''}</span>
                    <span className="font-semibold">{round(b.weight, 2)} kg × {b.reps}</span>
                    <span className="text-xs text-zinc-500 w-12 text-right">{fmtDate(b.done_at)}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1"><Trophy size={12} /> Mejor serie de cada persona (más kilos).</p>
          </Card>
        </>
      )}

      <SectionTitle>{groups.length ? 'Otro grupo' : 'Empieza aquí'}</SectionTitle>
      <Card className="space-y-3">
        <div>
          <h3 className="font-bold mb-2">Unirme con un código</h3>
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="Ej. A1B2C3" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} />
            <Button onClick={join} disabled={code.trim().length < 6}>Unirme</Button>
          </div>
        </div>
        <div className="border-t border-zinc-800 pt-3">
          <h3 className="font-bold mb-2">Crear un grupo nuevo</h3>
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="Ej. Los del gym" value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="secondary" onClick={create} disabled={!name.trim()}>Crear</Button>
          </div>
        </div>
      </Card>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(e) => { setEx(e); setPicker(false) }}
        onlyIds={new Set(exercises.filter((e) => !e.user_id).map((e) => e.id))} />
    </div>
  )
}

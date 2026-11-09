import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Clock, Users, Hourglass } from 'lucide-react'
import { supabase } from '../supabase'
import { Button, Card, Empty, ErrorText, SectionTitle } from '../components/ui'
import { errMsg } from '../lib/utils'
import MyPlan from '../components/MyPlan'

export type ClassItem = {
  id: string; name: string; color: string; starts_at: string; duration_min: number; capacity: number
  status: 'programada' | 'cancelada'; center: string; confirmed: number; waiting: number
  my_status: 'confirmada' | 'espera' | null; my_position: number | null; cancel_hours: number
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

export async function loadSchedule(from: Date, to: Date): Promise<ClassItem[]> {
  const { data, error } = await supabase.rpc('member_schedule', { p_from: from.toISOString(), p_to: to.toISOString() })
  if (error) throw error
  return (data as ClassItem[]) || []
}

/** Reservar clases del centro (módulo traído de FitBox). */
export default function Classes() {
  const today = startOfDay(new Date())
  const [day, setDay] = useState(today)
  const [items, setItems] = useState<ClassItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    setTick((t) => t + 1)
    try { setItems(await loadSchedule(new Date(), addDays(today, 14))) }
    catch (e) { setError(errMsg(e)); setItems([]) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), []) // eslint-disable-line react-hooks/exhaustive-deps
  const ofDay = (items || []).filter((c) => startOfDay(new Date(c.starts_at)).getTime() === day.getTime())
  const mine = (items || []).filter((c) => c.my_status && c.status === 'programada')

  async function book(c: ClassItem) {
    setBusy(c.id); setError(null); setMsg(null)
    const { data, error } = await supabase.rpc('book_class', { p_session: c.id })
    setBusy(null)
    if (error) return setError(errMsg(error))
    setMsg(data === 'espera' ? 'Clase llena: estás en la lista de espera. Te avisaremos si queda una plaza.' : '¡Reserva confirmada! 💪')
    load()
  }
  async function cancel(c: ClassItem) {
    if (!confirm(c.my_status === 'espera' ? '¿Salir de la lista de espera?' : '¿Cancelar tu reserva?')) return
    setBusy(c.id); setError(null); setMsg(null)
    const { error } = await supabase.rpc('cancel_class', { p_session: c.id })
    setBusy(null)
    if (error) return setError(errMsg(error))
    setMsg('Reserva cancelada'); load()
  }

  if (items && error?.includes('member_schedule')) return <Empty>Tu centro aún no tiene activadas las reservas de clases.</Empty>

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-4">Clases</h1>
      <MyPlan refresh={tick} />

      {mine.length > 0 && (
        <>
          <SectionTitle>Mis reservas</SectionTitle>
          <div className="space-y-2 mb-2">
            {mine.map((c) => (
              <Card key={c.id} className="!p-3 flex items-center gap-3">
                <CalendarCheck size={20} className={c.my_status === 'confirmada' ? 'text-accent' : 'text-amber-300'} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-xs text-zinc-400">
                    {new Date(c.starts_at).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · {hhmm(c.starts_at)}
                    {c.my_status === 'espera' && <b className="text-amber-300"> · lista de espera nº {c.my_position}</b>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Horario</SectionTitle>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-3">
        {days.map((d) => {
          const sel = d.getTime() === day.getTime()
          const has = (items || []).some((c) => startOfDay(new Date(c.starts_at)).getTime() === d.getTime())
          return (
            <button key={d.toISOString()} onClick={() => setDay(d)}
              className={`shrink-0 w-14 h-16 rounded-2xl border flex flex-col items-center justify-center ${sel ? 'bg-accent text-zinc-950 border-accent' : 'bg-zinc-900 border-zinc-800'}`}>
              <span className="text-[11px] uppercase">{d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 3)}</span>
              <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
              <span className={`h-1 w-1 rounded-full ${has ? (sel ? 'bg-zinc-950' : 'bg-accent') : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>

      {msg && <p className="text-sm text-accent bg-accent/10 rounded-xl px-3 py-2 mb-3">{msg}</p>}
      <ErrorText error={error} />

      {!items ? <Empty>Cargando…</Empty> : ofDay.length === 0 ? <Empty>No hay clases este día.</Empty> : (
        <div className="space-y-3 mt-2">
          {ofDay.map((c) => {
            const full = c.confirmed >= c.capacity
            const cancelled = c.status === 'cancelada'
            const free = Math.max(0, c.capacity - c.confirmed)
            return (
              <Card key={c.id} className={`!p-4 ${cancelled ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="h-10 w-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-lg leading-tight">{c.name}</div>
                    <div className="text-sm text-zinc-400 flex flex-wrap gap-x-3">
                      <span className="flex items-center gap-1"><Clock size={14} />{hhmm(c.starts_at)} · {c.duration_min} min</span>
                      <span className="flex items-center gap-1"><Users size={14} />{cancelled ? 'Cancelada' : full ? `Llena${c.waiting ? ` · ${c.waiting} en espera` : ''}` : `${free} plaza${free === 1 ? '' : 's'} libre${free === 1 ? '' : 's'}`}</span>
                    </div>
                    <div className="text-xs text-zinc-500">{c.center}</div>
                  </div>
                </div>
                {!cancelled && (
                  <div className="mt-3">
                    {c.my_status === 'confirmada' ? (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-semibold text-accent">✅ Tienes plaza</span>
                        <Button variant="secondary" className="!min-h-10" disabled={busy === c.id} onClick={() => cancel(c)}>Cancelar</Button>
                      </div>
                    ) : c.my_status === 'espera' ? (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-semibold text-amber-300 flex items-center gap-1"><Hourglass size={14} /> Lista de espera nº {c.my_position}</span>
                        <Button variant="secondary" className="!min-h-10" disabled={busy === c.id} onClick={() => cancel(c)}>Salir</Button>
                      </div>
                    ) : (
                      <Button className="w-full" variant={full ? 'secondary' : 'primary'} disabled={busy === c.id} onClick={() => book(c)}>
                        {full ? 'Apuntarme a la lista de espera' : 'Reservar'}
                      </Button>
                    )}
                    {c.my_status === 'confirmada' && <p className="text-[11px] text-zinc-500 mt-1">Puedes cancelar hasta {c.cancel_hours} h antes.</p>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

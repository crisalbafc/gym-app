import { useEffect, useState } from 'react'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { useApp } from '../App'
import { Card, SectionTitle } from './ui'
import { loadSchedule, type ClassItem } from '../screens/Classes'

/** Pantalla Hoy: próximas clases reservadas (solo si el centro tiene clases). */
export default function UpcomingClasses() {
  const { go } = useApp()
  const [items, setItems] = useState<ClassItem[] | null>(null)

  useEffect(() => {
    const now = new Date()
    loadSchedule(now, new Date(now.getTime() + 7 * 86400000)).then(setItems).catch(() => setItems(null))
  }, [])

  if (!items || items.length === 0) return null // el centro no tiene clases
  const mine = items.filter((c) => c.my_status && c.status === 'programada').slice(0, 3)

  return (
    <>
      <SectionTitle>Clases</SectionTitle>
      <Card className="!p-0">
        {mine.map((c) => (
          <button key={c.id} onClick={() => go('clases')} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-zinc-800 last:border-0">
            <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="flex-1">
              <span className="block font-semibold">{c.name}</span>
              <span className="block text-xs text-zinc-400">
                {new Date(c.starts_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })} · {new Date(c.starts_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                {c.my_status === 'espera' && <b className="text-amber-300"> · en espera ({c.my_position})</b>}
              </span>
            </span>
          </button>
        ))}
        <button onClick={() => go('clases')} className="w-full flex items-center gap-3 px-4 py-3 text-left text-accent font-semibold">
          <CalendarDays size={18} /> <span className="flex-1">{mine.length ? 'Ver horario' : 'Reservar una clase'}</span><ChevronRight size={18} />
        </button>
      </Card>
    </>
  )
}

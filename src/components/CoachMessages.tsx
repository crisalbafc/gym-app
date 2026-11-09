import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../supabase'
import { Card, SectionTitle } from './ui'
import { fmtDate } from '../lib/utils'

type Msg = { id: string; body: string; created_at: string; read_at: string | null; coaches: { name: string } | null }

/** Mensajes recientes del entrenador (pantalla Hoy). No muestra nada si no hay. */
export default function CoachMessages() {
  const [msgs, setMsgs] = useState<Msg[]>([])

  useEffect(() => {
    supabase.from('coach_messages').select('id,body,created_at,read_at,coaches(name)')
      .order('created_at', { ascending: false }).limit(3)
      .then(({ data, error }) => {
        if (error || !data?.length) return
        setMsgs(data as unknown as Msg[])
        if (data.some((m) => !m.read_at)) supabase.rpc('mark_coach_messages_read')
      })
  }, [])

  if (!msgs.length) return null
  return (
    <>
      <SectionTitle>Tu entrenador</SectionTitle>
      <Card className="space-y-3">
        {msgs.map((m) => (
          <div key={m.id} className="flex gap-2">
            <MessageCircle size={18} className={`shrink-0 mt-0.5 ${m.read_at ? 'text-zinc-500' : 'text-accent'}`} />
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">{m.coaches?.name || 'Entrenador'} · {fmtDate(m.created_at, { weekday: 'short', day: 'numeric', month: 'short' })}{!m.read_at && <b className="text-accent"> · nuevo</b>}</div>
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>
        ))}
      </Card>
    </>
  )
}

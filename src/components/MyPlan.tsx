import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { supabase } from '../supabase'
import { Card } from './ui'

type M = { center: string; plan_name: string; plan_type: 'ilimitado' | 'creditos'; end_date: string; status: 'activa' | 'expira_pronto' | 'expirada'; credits_left: number | null; credits: number | null }

/** Mi plan en el centro (bono o mensualidad). No muestra nada si no hay planes. */
export default function MyPlan({ refresh = 0 }: { refresh?: number }) {
  const [plans, setPlans] = useState<M[]>([])
  useEffect(() => {
    supabase.rpc('my_memberships').then(({ data, error }) => { if (!error) setPlans((data as M[]) || []) })
  }, [refresh])
  if (!plans.length) return null
  return (
    <div className="space-y-2 mb-4">
      {plans.map((m, i) => (
        <Card key={i} className="!p-3 flex items-center gap-3">
          <CreditCard size={20} className="text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{m.plan_name}</div>
            <div className="text-xs text-zinc-400">
              {m.center} · hasta el {new Date(m.end_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              {m.status === 'expira_pronto' && <b className="text-amber-300"> · caduca pronto</b>}
            </div>
          </div>
          {m.plan_type === 'creditos' && (
            <div className="text-right">
              <div className={`text-xl font-extrabold ${(m.credits_left ?? 0) <= 1 ? 'text-amber-300' : ''}`}>{m.credits_left ?? 0}</div>
              <div className="text-[10px] text-zinc-500 -mt-1">de {m.credits} clases</div>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

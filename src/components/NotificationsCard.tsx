import { useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { supabase } from '../supabase'
import { useApp } from '../App'
import type { Profile } from '../types'
import { Button, Card, ErrorText } from './ui'
import { errMsg } from '../lib/utils'
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from '../lib/push'

/** Ajustes de notificaciones: activar en este móvil + preferencias. Se guarda al momento. */
export default function NotificationsCard() {
  const { profile, setProfile } = useApp()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ready = 'tz' in profile // la base de datos ya tiene las columnas de avisos

  useEffect(() => { pushState().then(setState) }, [])

  async function savePref(patch: Partial<Profile>) {
    setError(null)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid'
    const { data, error } = await supabase.from('profiles').update({ ...patch, tz }).eq('id', profile.id).select().single()
    if (error) return setError(errMsg(error))
    setProfile(data as Profile)
  }

  async function toggle() {
    setBusy(true); setError(null); setMsg(null)
    try { setState(state === 'on' ? await disablePush() : await enablePush()) }
    catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }
  async function test() {
    setError(null)
    try { await sendTestPush(); setMsg('Enviada. Debería llegarte en unos segundos (prueba a bloquear el móvil).') }
    catch (e) { setError(errMsg(e)) }
  }

  if (!ready) {
    return <Card><p className="text-sm text-zinc-400">Las notificaciones aún no están activadas en el servidor.</p></Card>
  }

  return (
    <Card className="space-y-3">
      {state === 'ios-install' && (
        <p className="text-sm text-orange-300 bg-orange-500/10 rounded-xl px-3 py-2">
          En iPhone, primero añade GymLog a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio») y ábrela desde ese icono. Ahí podrás activar los avisos.
        </p>
      )}
      {state === 'unsupported' && <p className="text-sm text-zinc-400">Este navegador no permite notificaciones. Prueba con Chrome (Android) o con la app instalada en iPhone.</p>}
      {state === 'denied' && (
        <p className="text-sm text-orange-300 bg-orange-500/10 rounded-xl px-3 py-2">
          Has bloqueado las notificaciones. Actívalas en los ajustes del móvil (Ajustes → Notificaciones → GymLog, o en los permisos del sitio en Chrome).
        </p>
      )}
      {(state === 'on' || state === 'off') && (
        <div className="flex items-center gap-3">
          {state === 'on' ? <Bell className="text-accent" size={22} /> : <BellOff className="text-zinc-500" size={22} />}
          <div className="flex-1">
            <div className="font-semibold">{state === 'on' ? 'Activadas en este móvil' : 'Desactivadas en este móvil'}</div>
            <div className="text-xs text-zinc-500">Hay que activarlas en cada móvil que uses.</div>
          </div>
          <Button variant={state === 'on' ? 'secondary' : 'primary'} className="!min-h-10" onClick={toggle} disabled={busy}>
            {busy ? '…' : state === 'on' ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      )}

      <div className={`space-y-3 border-t border-zinc-800 pt-3 ${state === 'on' ? '' : 'opacity-50'}`}>
        <label className="flex items-center justify-between gap-3 min-h-12">
          <span>
            <span className="block font-semibold">Fin del descanso</span>
            <span className="block text-xs text-zinc-500">Aviso aunque tengas el móvil bloqueado o estés en otra app.</span>
          </span>
          <input type="checkbox" checked={profile.notify_rest !== false} onChange={(e) => savePref({ notify_rest: e.target.checked })} className="h-6 w-6 accent-lime-400 shrink-0" />
        </label>

        <label className="flex items-center justify-between gap-3 min-h-12">
          <span>
            <span className="block font-semibold">Recordar pesarme</span>
            <span className="block text-xs text-zinc-500">Cada día a esta hora, si aún no te has pesado.</span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <input
              type="time"
              value={profile.remind_weight_at?.slice(0, 5) || ''}
              onChange={(e) => savePref({ remind_weight_at: e.target.value || null })}
              className="h-10 rounded-xl bg-zinc-800 border border-zinc-700 px-2"
              aria-label="Hora del recordatorio de peso"
            />
            {profile.remind_weight_at && (
              <button className="text-xs text-zinc-400 underline" onClick={() => savePref({ remind_weight_at: null })}>Quitar</button>
            )}
          </span>
        </label>

        <label className="flex items-center justify-between gap-3 min-h-12">
          <span>
            <span className="block font-semibold">Recordar entrenar</span>
            <span className="block text-xs text-zinc-500">A las 18:00, si llevas estos días sin entrenar.</span>
          </span>
          <select
            value={profile.remind_train_days || 0}
            onChange={(e) => savePref({ remind_train_days: Number(e.target.value) })}
            className="h-10 rounded-xl bg-zinc-800 border border-zinc-700 px-2 shrink-0"
            aria-label="Días sin entrenar"
          >
            <option value={0}>No</option>
            {[2, 3, 4, 5, 7].map((d) => <option key={d} value={d}>{d} días</option>)}
          </select>
        </label>

        {state === 'on' && <Button variant="ghost" className="w-full" onClick={test}><Send size={16} /> Enviarme una notificación de prueba</Button>}
        {msg && <p className="text-sm text-accent">{msg}</p>}
      </div>
      <ErrorText error={error} />
    </Card>
  )
}

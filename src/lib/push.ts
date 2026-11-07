import { supabase } from '../supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* sin avisos */ })
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !VAPID) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Pide permiso y guarda este móvil para recibir avisos. */
export async function enablePush(): Promise<PushState> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('./sw.js'))
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID!) }))
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth })
  if (error) throw error
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'off'
}

export async function sendTestPush() {
  const { error } = await supabase.from('scheduled_pushes')
    .insert({ send_at: new Date().toISOString(), title: '🔔 Prueba de GymLog', body: '¡Las notificaciones funcionan! 💪', tag: 'test' })
  if (error) throw error
}

/** Programa (o quita) el aviso de "descanso terminado" en el servidor. */
export async function scheduleRestPush(endMs: number | null) {
  try {
    await supabase.from('scheduled_pushes').delete().eq('tag', 'rest').is('sent_at', null)
    if (endMs) {
      await supabase.from('scheduled_pushes').insert({
        send_at: new Date(endMs).toISOString(), title: '⏱️ ¡Descanso terminado!', body: 'A por la siguiente serie 💪', tag: 'rest',
      })
    }
  } catch { /* si falla, queda el pitido normal */ }
}

import { useEffect, useRef, useState } from 'react'
import { Timer } from 'lucide-react'
import { scheduleRestPush } from '../lib/push'

const KEY = 'rest-end'
export function readRestEnd(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v && v > Date.now() - 5000 ? v : null
  } catch { return null }
}
export function saveRestEnd(v: number | null) {
  try { if (v) localStorage.setItem(KEY, String(v)); else localStorage.removeItem(KEY) } catch { /* nada */ }
}

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

/**
 * Barra de descanso. Vive fuera de las pantallas, así que sigue contando
 * aunque cambies de pestaña. Calcula el tiempo con la hora real, así que al
 * volver a la app muestra lo que queda de verdad. Solo pita si estás mirando
 * la app justo cuando termina (no pita tarde al volver).
 */
export default function RestTimer({ end, onChange }: { end: number; onChange: (v: number | null) => void }) {
  const [left, setLeft] = useState(() => Math.ceil((end - Date.now()) / 1000))
  const fired = useRef(false)

  const pushCancelled = useRef(false)

  useEffect(() => {
    fired.current = false
    pushCancelled.current = false
    const tick = () => {
      const ms = end - Date.now()
      setLeft(Math.ceil(ms / 1000))
      // Si estás mirando la app al final, pita aquí y no hace falta la notificación
      if (ms > 0 && ms < 2500 && !pushCancelled.current && document.visibilityState === 'visible') {
        pushCancelled.current = true
        scheduleRestPush(null)
      }
      if (ms > 0 || fired.current) return
      fired.current = true
      const onTime = document.visibilityState === 'visible' && -ms < 2500
      if (onTime) {
        beep()
        setTimeout(() => onChange(null), 3000)
      } else {
        onChange(null) // terminó mientras estabas fuera: se quita sin pitar
      }
    }
    tick()
    const t = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [end, onChange])

  const s = Math.max(0, left)
  const m = Math.floor(s / 60), r = s % 60
  const doneNow = left <= 0
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-4 pb-2">
      <div className={`max-w-lg mx-auto rounded-2xl border px-4 py-2 flex items-center gap-3 shadow-xl ${doneNow ? 'bg-accent text-zinc-950 border-accent' : 'bg-zinc-900 border-zinc-700'}`}>
        <Timer size={22} />
        <div className="flex-1">
          <div className="text-xs opacity-70">{doneNow ? '¡A por la siguiente serie!' : 'Descanso'}</div>
          <div className="text-2xl font-bold tabular-nums">{m}:{String(r).padStart(2, '0')}</div>
        </div>
        {!doneNow && <button className="h-10 px-3 rounded-xl bg-zinc-800 font-semibold" onClick={() => onChange(end + 15000)}>+15 s</button>}
        <button className={`h-10 px-3 rounded-xl font-semibold ${doneNow ? 'bg-zinc-950/20' : 'bg-zinc-800'}`} onClick={() => onChange(null)}>{doneNow ? 'OK' : 'Saltar'}</button>
      </div>
    </div>
  )
}

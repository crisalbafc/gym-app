import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Trash2, Users, Lock } from 'lucide-react'
import { useApp } from '../App'
import type { Workout } from '../types'
import { Button, ErrorText, Sheet } from './ui'
import { errMsg } from '../lib/utils'
import { photoUrl, removeWorkoutPhoto, setPhotoShared, setWorkoutPhoto } from '../lib/photos'

/** Dos botones: hacer foto con la cámara o elegirla de la galería. */
export function PhotoButtons({ onFile, busy, compact }: { onFile: (f: File) => void; busy: boolean; compact?: boolean }) {
  const cam = useRef<HTMLInputElement>(null)
  const gal = useRef<HTMLInputElement>(null)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onFile(f)
  }
  return (
    <div className="flex gap-2">
      <input ref={cam} type="file" accept="image/*" capture="user" hidden onChange={pick} />
      <input ref={gal} type="file" accept="image/*" hidden onChange={pick} />
      <Button className={`flex-1 ${compact ? '' : 'h-14'}`} disabled={busy} onClick={() => cam.current?.click()}>
        <Camera size={20} /> {busy ? 'Subiendo…' : 'Hacer foto'}
      </Button>
      <Button variant="secondary" className={compact ? '' : 'h-14'} disabled={busy} onClick={() => gal.current?.click()} aria-label="Elegir de la galería">
        <ImagePlus size={20} /> Galería
      </Button>
    </div>
  )
}

export function ShareToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 min-h-12">
      <span className="flex items-center gap-2 text-sm">
        {value ? <Users size={18} className="text-accent" /> : <Lock size={18} className="text-zinc-400" />}
        {value ? 'La verá tu grupo' : 'Solo para ti'}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-lime-400" aria-label="Compartir con mi grupo" />
    </label>
  )
}

/** Foto dentro de un entreno del historial: ver, añadir, cambiar, quitar, compartir. */
export function HistoryPhoto({ workout, onChange }: { workout: Workout; onChange: () => void }) {
  const { session } = useApp()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shared = workout.photo_shared ?? true

  useEffect(() => {
    setUrl(null)
    if (workout.photo_path) photoUrl(workout.photo_path).then(setUrl)
  }, [workout.photo_path])

  async function upload(f: File) {
    setBusy(true); setError(null)
    try { await setWorkoutPhoto(session.user.id, workout.id, f, shared, workout.photo_path); onChange() }
    catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!workout.photo_path || !confirm('¿Quitar la foto de este entreno?')) return
    await removeWorkoutPhoto(workout.id, workout.photo_path)
    onChange()
  }
  async function toggle(v: boolean) {
    try { await setPhotoShared(workout.id, v); onChange() } catch (e) { setError(errMsg(e)) }
  }

  if (!workout.photo_path) {
    return (
      <div className="space-y-2">
        <PhotoButtons onFile={upload} busy={busy} compact />
        <ErrorText error={error} />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {url ? <img src={url} alt="Foto del entreno" className="w-full max-h-96 object-cover rounded-2xl" />
        : <div className="h-48 rounded-2xl bg-zinc-800 animate-pulse" />}
      <ShareToggle value={shared} onChange={toggle} />
      <div className="flex gap-2">
        <div className="flex-1"><PhotoButtons onFile={upload} busy={busy} compact /></div>
        <Button variant="danger" onClick={remove} aria-label="Quitar foto"><Trash2 size={18} /></Button>
      </div>
      <ErrorText error={error} />
    </div>
  )
}

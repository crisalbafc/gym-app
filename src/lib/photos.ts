import { supabase } from '../supabase'

const BUCKET = 'workout-photos'

/** Reduce la foto (máx. 1280 px, JPEG) para que suba rápido y ocupe poco. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((res) => canvas.toBlob((b) => res(b || file), 'image/jpeg', 0.82))
}

/** Sube la foto de un entreno y la enlaza con él. Devuelve la ruta guardada. */
export async function setWorkoutPhoto(userId: string, workoutId: string, file: File, shared: boolean, oldPath?: string | null) {
  const blob = await compress(file)
  const path = `${userId}/${workoutId}-${Date.now()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const { error } = await supabase.from('workouts').update({ photo_path: path, photo_shared: shared }).eq('id', workoutId)
  if (error) throw error
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath])
  return path
}

export async function removeWorkoutPhoto(workoutId: string, path: string) {
  await supabase.storage.from(BUCKET).remove([path])
  await supabase.from('workouts').update({ photo_path: null }).eq('id', workoutId)
}

export async function deletePhotoFile(path: string) {
  await supabase.storage.from(BUCKET).remove([path])
}

export async function setPhotoShared(workoutId: string, shared: boolean) {
  const { error } = await supabase.from('workouts').update({ photo_shared: shared }).eq('id', workoutId)
  if (error) throw error
}

/** Enlace temporal (1 hora) para ver una foto privada. */
export async function photoUrl(path: string) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

/** Varios enlaces temporales de una vez. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {}
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  return Object.fromEntries((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]))
}

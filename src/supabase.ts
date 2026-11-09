import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)
export const supabase = createClient(url || 'https://example.supabase.co', key || 'missing-key')

/**
 * Id del usuario que ha iniciado sesión. Las consultas de "mis datos" filtran
 * por él: si la cuenta es de entrenador, la base de datos también le deja leer
 * datos de sus clientes, y no queremos mezclarlos con los suyos.
 */
export let me = ''
export const setMe = (id: string) => { me = id }

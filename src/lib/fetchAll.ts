import { supabase } from '../supabase'

/** Descarga todas las filas (Supabase devuelve como mucho 1000 por petición). */
export async function fetchAll<T>(
  table: string,
  columns: string,
  build: (q: any) => any = (q) => q, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const out: T[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await build(supabase.from(table).select(columns)).range(from, from + size - 1)
    if (error) throw error
    out.push(...((data as T[]) || []))
    if (!data || data.length < size) break
  }
  return out
}

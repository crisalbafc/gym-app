/** Fecha local en formato AAAA-MM-DD (no UTC, para que "hoy" sea hoy en España). */
export function isoDay(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return isoDay(new Date(y, m - 1, d + n))
}
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseDay(day).toLocaleDateString('es-ES', opts)
}
export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(iso).toLocaleDateString('es-ES', opts)
}
/** Duración entre dos fechas: "45 min" o "1 h 20 min". */
export function fmtDuration(startIso: string, endIso: string) {
  const min = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000))
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
}
/** Acepta "82,5" o "82.5". */
export function num(v: string): number {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
export const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d
/** 1RM estimado (fórmula de Epley). */
export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30))
export const kg = (n: number) => `${round(n, 2).toLocaleString('es-ES')} kg`

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return false
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
  return true
}

export function errMsg(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e)
  if (m.includes('Invalid login credentials')) return 'Email o contraseña incorrectos'
  if (m.includes('User already registered')) return 'Ya existe una cuenta con ese email'
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres'
  if (m.includes('Email not confirmed')) return 'Confirma tu email (revisa tu correo) antes de entrar'
  if (m.includes('Failed to fetch')) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo'
  return m
}

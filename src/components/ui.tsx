import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { X, Minus, Plus } from 'lucide-react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-zinc-900 border border-zinc-800 p-4 ${className}`}>{children}</div>
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }
export function Button({ variant = 'primary', className = '', ...p }: BtnProps) {
  const styles = {
    primary: 'bg-accent text-zinc-950 active:bg-accent-dark',
    secondary: 'bg-zinc-800 text-zinc-100 active:bg-zinc-700',
    ghost: 'bg-transparent text-zinc-300 active:bg-zinc-800',
    danger: 'bg-red-500/15 text-red-400 active:bg-red-500/25',
  }[variant]
  return (
    <button
      {...p}
      className={`min-h-12 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors ${styles} ${className}`}
    />
  )
}

export function Input({ label, className = '', ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-sm text-zinc-400 mb-1">{label}</span>}
      <input
        {...p}
        className="w-full min-h-12 px-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
      />
    </label>
  )
}

/** Campo numérico grande con botones − y + (pensado para usar con el pulgar). */
export function Stepper({ label, value, onChange, step, unit }: {
  label: string; value: string; onChange: (v: string) => void; step: number; unit?: string
}) {
  const bump = (d: number) => {
    const n = parseFloat(value.replace(',', '.')) || 0
    const next = Math.max(0, Math.round((n + d) * 100) / 100)
    onChange(String(next))
  }
  return (
    <div className="flex-1">
      <div className="text-xs text-zinc-400 mb-1 text-center">{label}{unit ? ` (${unit})` : ''}</div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => bump(-step)} className="h-12 w-11 shrink-0 rounded-xl bg-zinc-800 active:bg-zinc-700 flex items-center justify-center" aria-label={`Restar ${label}`}>
          <Minus size={18} />
        </button>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="h-12 w-full min-w-0 rounded-xl bg-zinc-800 border border-zinc-700 text-center text-xl font-bold focus:outline-none focus:border-accent"
        />
        <button type="button" onClick={() => bump(step)} className="h-12 w-11 shrink-0 rounded-xl bg-zinc-800 active:bg-zinc-700 flex items-center justify-center" aria-label={`Sumar ${label}`}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-zinc-900 border border-zinc-800 pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

export function Bar({ value, max, color = 'bg-accent' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const over = max > 0 && value > max
  return (
    <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
      <div className={`h-full rounded-full ${over ? 'bg-orange-400' : color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-center text-zinc-500 py-6 text-sm">{children}</p>
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null
  return <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{error}</p>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mt-6 mb-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{children}</h2>
      {right}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-zinc-900 border border-zinc-800 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-h-10 rounded-lg text-sm font-semibold ${value === o.value ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

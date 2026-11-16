import { useCallback, useEffect, useState } from 'react'
import { Footprints, Bike, Trash2, Pencil, Mountain, Heart, Gauge, Zap, Timer } from 'lucide-react'
import { supabase, me } from '../supabase'
import { Button, Card, Empty, ErrorText, Input, Segmented, SectionTitle, Sheet } from './ui'
import { errMsg, fmtDay, isoDay, num, round } from '../lib/utils'

export type Sport = 'correr' | 'ciclismo'
export type CardioSession = {
  id: string; day: string; sport: Sport | 'eliptica' | 'escaleras' | 'remo' | 'otro'
  surface: 'exterior' | 'cinta' | 'indoor' | null
  kind: 'trote_suave' | 'calidad' | 'tirada_larga' | null
  quality_type: 'series' | 'progresiones' | 'fartlek' | 'cuestas' | 'otro' | null
  details: string | null; duration_s: number | null; distance_km: number | null; avg_pace_s: number | null
  hr_max: number | null; elevation_m: number | null; incline_pct: number | null; power_w: number | null; notes: string | null
}

export const KIND_LABEL = { trote_suave: 'Trote suave', calidad: 'Calidad', tirada_larga: 'Tirada larga' } as const
export const QUALITY_LABEL = { series: 'Series', progresiones: 'Progresiones', fartlek: 'Fartlek', cuestas: 'Cuestas', otro: 'Otro' } as const
export const SPORT_LABEL: Record<CardioSession['sport'], string> = { correr: 'Correr', ciclismo: 'Ciclismo', eliptica: 'Elíptica', escaleras: 'Escaleras', remo: 'Remo', otro: 'Cardio' }

/** "45" = 45 min · "45:30" = 45 min 30 s · "1:05:20" = 1 h 5 min 20 s */
export function parseDuration(s: string): number | null {
  const parts = s.trim().split(':').map((x) => parseInt(x, 10))
  if (!s.trim() || parts.some(isNaN)) return null
  if (parts.length === 1) return parts[0] * 60
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}
export function fmtDur(sec: number | null) {
  if (!sec) return ''
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
/** Ritmo "4:35" (min/km) -> segundos */
export function parsePace(s: string): number | null {
  const [m, sec] = s.trim().split(':').map((x) => parseInt(x, 10))
  if (isNaN(m)) return null
  return m * 60 + (isNaN(sec) ? 0 : sec)
}
export const fmtPace = (sec: number | null) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/km` : '')

type Form = {
  sport: Sport; day: string; surface: 'exterior' | 'cinta' | 'indoor'; kind: NonNullable<CardioSession['kind']>
  quality: NonNullable<CardioSession['quality_type']>; details: string; duration: string; km: string; pace: string
  hr: string; elevation: string; incline: string; power: string; notes: string
}
const empty = (sport: Sport = 'correr'): Form => ({
  sport, day: isoDay(), surface: 'exterior', kind: 'trote_suave', quality: 'series', details: '',
  duration: '', km: '', pace: '', hr: '', elevation: '', incline: '', power: '', notes: '',
})

function Chips<T extends string>({ value, options, onChange }: { value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={`h-10 px-4 rounded-full border text-sm font-semibold ${value === k ? 'bg-accent text-zinc-950 border-accent' : 'bg-zinc-900 border-zinc-700 text-zinc-300'}`}>
          {options[k]}
        </button>
      ))}
    </div>
  )
}

/** Formulario para apuntar (o editar) una sesión de cardio. */
export function CardioSheet({ open, session, onClose, onSaved }: { open: boolean; session?: CardioSession | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(empty())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (!session) return setF(empty())
    setF({
      sport: session.sport === 'ciclismo' ? 'ciclismo' : 'correr', day: session.day,
      surface: session.surface || 'exterior', kind: session.kind || 'trote_suave', quality: session.quality_type || 'series',
      details: session.details || '', duration: fmtDur(session.duration_s), km: session.distance_km ? String(+session.distance_km) : '',
      pace: session.avg_pace_s ? fmtPace(session.avg_pace_s).replace('/km', '') : '', hr: session.hr_max ? String(session.hr_max) : '',
      elevation: session.elevation_m != null ? String(session.elevation_m) : '', incline: session.incline_pct != null ? String(+session.incline_pct) : '',
      power: session.power_w ? String(session.power_w) : '', notes: session.notes || '',
    })
  }, [open, session])

  const run = f.sport === 'correr'
  const dur = parseDuration(f.duration)
  const km = num(f.km)
  // Ritmo calculado con la duración y los km (si no lo escribe a mano)
  const autoPace = run && dur && km > 0 ? Math.round(dur / km) : null
  const outdoor = f.surface === 'exterior'

  async function save() {
    if (!dur) return setError('Pon la duración (ej. 45 o 45:30)')
    setBusy(true); setError(null)
    const row = {
      day: f.day, sport: f.sport,
      surface: run ? (f.surface === 'indoor' ? 'exterior' : f.surface) : (f.surface === 'cinta' ? 'indoor' : f.surface),
      kind: run ? f.kind : null,
      quality_type: run && f.kind === 'calidad' ? f.quality : null,
      details: run && f.kind === 'calidad' && f.details.trim() ? f.details.trim() : null,
      duration_s: dur, distance_km: km > 0 ? km : null,
      avg_pace_s: run ? (parsePace(f.pace) || autoPace) : null,
      hr_max: f.hr.trim() ? Math.round(num(f.hr)) : null,
      elevation_m: outdoor && f.elevation.trim() ? Math.round(num(f.elevation)) : null,
      incline_pct: run && f.surface === 'cinta' && f.incline.trim() ? num(f.incline) : null,
      power_w: !run && f.power.trim() ? Math.round(num(f.power)) : null,
      notes: f.notes.trim() || null,
    }
    const { error } = session
      ? await supabase.from('cardio_sessions').update(row).eq('id', session.id)
      : await supabase.from('cardio_sessions').insert(row)
    setBusy(false)
    if (error) return setError(errMsg(error).includes('cardio_sessions') ? 'Falta activar el cardio en el servidor (018-cardio.sql).' : errMsg(error))
    onSaved(); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={session ? 'Editar cardio' : 'Apuntar cardio'}>
      <div className="space-y-4">
        <Segmented value={f.sport} onChange={(s) => setF({ ...f, sport: s, surface: s === 'correr' ? 'exterior' : 'indoor' })}
          options={[{ value: 'correr', label: '🏃 Correr' }, { value: 'ciclismo', label: '🚴 Ciclismo' }]} />

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <div className="text-sm text-zinc-400 mb-1">Dónde</div>
            {run
              ? <Chips value={f.surface === 'cinta' ? 'cinta' : 'exterior'} options={{ exterior: 'Exterior', cinta: 'Cinta' }} onChange={(v) => setF({ ...f, surface: v })} />
              : <Chips value={f.surface === 'exterior' ? 'exterior' : 'indoor'} options={{ indoor: 'Indoor', exterior: 'Exterior' }} onChange={(v) => setF({ ...f, surface: v })} />}
          </div>
          <input type="date" value={f.day} max={isoDay()} onChange={(e) => setF({ ...f, day: e.target.value || isoDay() })}
            className="h-10 rounded-xl bg-zinc-800 border border-zinc-700 px-2 text-sm" aria-label="Fecha" />
        </div>

        {run && (
          <div>
            <div className="text-sm text-zinc-400 mb-1">Tipo de entrenamiento</div>
            <Chips value={f.kind} options={KIND_LABEL} onChange={(v) => setF({ ...f, kind: v })} />
          </div>
        )}
        {run && f.kind === 'calidad' && (
          <div className="space-y-2 rounded-2xl bg-zinc-800/50 p-3">
            <Chips value={f.quality} options={QUALITY_LABEL} onChange={(v) => setF({ ...f, quality: v })} />
            <Input label="¿Qué has hecho?" placeholder={f.quality === 'series' ? 'Ej. 6×1000 m a 4:10, rec. 2 min' : f.quality === 'cuestas' ? 'Ej. 10×200 m en cuesta, bajada trotando' : f.quality === 'fartlek' ? 'Ej. 10×(1 min rápido + 1 min suave)' : 'Ej. 3 km a 5:00, 3 km a 4:40, 2 km a 4:20'}
              value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Input label="Duración (min o h:mm:ss)" placeholder="45:30" inputMode="text" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} />
          <Input label="Distancia (km)" placeholder="8,5" inputMode="decimal" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} />
          {run
            ? <Input label={`Ritmo medio (min/km)${autoPace ? ` · ${fmtPace(autoPace)}` : ''}`} placeholder={autoPace ? fmtPace(autoPace).replace('/km', '') : '5:20'} inputMode="text" value={f.pace} onChange={(e) => setF({ ...f, pace: e.target.value })} />
            : <Input label="Potencia media (W)" placeholder="180" inputMode="numeric" value={f.power} onChange={(e) => setF({ ...f, power: e.target.value })} />}
          <Input label="FC máx (ppm)" placeholder="178" inputMode="numeric" value={f.hr} onChange={(e) => setF({ ...f, hr: e.target.value })} />
          {outdoor && <Input label="Desnivel + (m)" placeholder="120" inputMode="numeric" value={f.elevation} onChange={(e) => setF({ ...f, elevation: e.target.value })} />}
          {run && f.surface === 'cinta' && <Input label="Inclinación (%)" placeholder="1,5" inputMode="decimal" value={f.incline} onChange={(e) => setF({ ...f, incline: e.target.value })} />}
        </div>
        {run && autoPace && !f.pace && <p className="text-xs text-zinc-500 -mt-2">El ritmo se calcula solo con la duración y los km. Escríbelo si quieres poner otro.</p>}
        <Input label="Notas (opcional)" placeholder="Sensaciones, zapatillas, tiempo…" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <ErrorText error={error} />
        <Button className="w-full" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Sheet>
  )
}

/** Resumen de una sesión en una línea de datos */
export function CardioStats({ s }: { s: CardioSession }) {
  const item = (icon: React.ReactNode, text: string) => <span className="flex items-center gap-1">{icon}{text}</span>
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
      {s.duration_s && item(<Timer size={12} />, fmtDur(s.duration_s))}
      {s.distance_km != null && item(<Footprints size={12} />, `${round(+s.distance_km, 2)} km`)}
      {s.avg_pace_s && item(<Gauge size={12} />, fmtPace(s.avg_pace_s))}
      {s.power_w && item(<Zap size={12} />, `${s.power_w} W`)}
      {s.hr_max && item(<Heart size={12} />, `${s.hr_max} ppm`)}
      {s.elevation_m != null && item(<Mountain size={12} />, `+${s.elevation_m} m`)}
      {s.incline_pct != null && item(<Mountain size={12} />, `${+s.incline_pct}%`)}
    </div>
  )
}

export function cardioTitle(s: CardioSession) {
  if (s.sport === 'correr') {
    const k = s.kind ? KIND_LABEL[s.kind] : 'Carrera'
    const q = s.kind === 'calidad' && s.quality_type ? ` · ${QUALITY_LABEL[s.quality_type]}` : ''
    return `${k}${q}${s.surface === 'cinta' ? ' (cinta)' : ''}`
  }
  if (s.sport === 'ciclismo') return `Ciclismo ${s.surface === 'exterior' ? 'exterior' : 'indoor'}`
  return SPORT_LABEL[s.sport]
}

/** Lista de sesiones de cardio recientes (pantalla Entreno) */
export function CardioList({ refresh = 0 }: { refresh?: number }) {
  const [items, setItems] = useState<CardioSession[] | null>(null)
  const [editing, setEditing] = useState<CardioSession | null>(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('cardio_sessions').select('*').eq('user_id', me).order('day', { ascending: false }).order('created_at', { ascending: false }).limit(15)
    setItems(error ? [] : ((data as CardioSession[]) || []))
  }, [])
  useEffect(() => { load() }, [load, refresh])

  async function remove(s: CardioSession) {
    if (!confirm('¿Borrar esta sesión de cardio?')) return
    await supabase.from('cardio_sessions').delete().eq('id', s.id); load()
  }

  if (!items || items.length === 0) return null
  return (
    <>
      <SectionTitle>Cardio</SectionTitle>
      <div className="space-y-2">
        {items.map((s) => (
          <Card key={s.id} className="!p-3 flex gap-3">
            <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 text-accent">
              {s.sport === 'ciclismo' ? <Bike size={20} /> : <Footprints size={20} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{cardioTitle(s)} <span className="text-zinc-500 font-normal text-sm">· {fmtDay(s.day)}</span></div>
              {s.details && <div className="text-sm text-zinc-300 truncate">{s.details}</div>}
              <CardioStats s={s} />
            </div>
            <div className="flex flex-col">
              <button onClick={() => setEditing(s)} className="h-8 w-8 text-zinc-500 flex items-center justify-center" aria-label="Editar"><Pencil size={15} /></button>
              <button onClick={() => remove(s)} className="h-8 w-8 text-zinc-600 flex items-center justify-center" aria-label="Borrar"><Trash2 size={15} /></button>
            </div>
          </Card>
        ))}
      </div>
      <CardioSheet open={!!editing} session={editing} onClose={() => setEditing(null)} onSaved={load} />
    </>
  )
}

export function NoCardio() { return <Empty>Aún no has apuntado cardio.</Empty> }

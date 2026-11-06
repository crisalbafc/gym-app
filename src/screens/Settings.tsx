import { useState } from 'react'
import { Download, LogOut, Check } from 'lucide-react'
import { supabase } from '../supabase'
import { useApp } from '../App'
import type { Profile } from '../types'
import { Button, Card, ErrorText, Input, SectionTitle } from '../components/ui'
import { downloadCsv, errMsg, isoDay, num } from '../lib/utils'
import { fetchAll } from '../lib/fetchAll'

export default function Settings() {
  const { profile, setProfile, session, exercises } = useApp()
  const [p, setP] = useState({
    display_name: profile.display_name,
    kcal_goal: String(profile.kcal_goal), protein_goal: String(profile.protein_goal),
    carbs_goal: String(profile.carbs_goal), fat_goal: String(profile.fat_goal),
    rest_seconds: String(profile.rest_seconds),
  })
  const [share, setShare] = useState(profile.share_records)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  async function save() {
    setError(null)
    const patch: Partial<Profile> = {
      display_name: p.display_name.trim() || profile.display_name,
      kcal_goal: Math.round(num(p.kcal_goal)), protein_goal: Math.round(num(p.protein_goal)),
      carbs_goal: Math.round(num(p.carbs_goal)), fat_goal: Math.round(num(p.fat_goal)),
      rest_seconds: Math.round(num(p.rest_seconds)), share_records: share,
    }
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', profile.id).select().single()
    if (error) return setError(errMsg(error))
    setProfile(data as Profile)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  async function exportAll() {
    setExporting(true); setError(null)
    try {
      const exName = Object.fromEntries(exercises.map((e) => [e.id, e.name]))
      const d = isoDay()
      const sets = await fetchAll<{ created_at: string; exercise_id: string; weight: number; reps: number }>(
        'workout_sets', 'created_at,exercise_id,weight,reps', (q) => q.order('created_at'))
      downloadCsv(`entrenos-${d}.csv`, sets.map((s) => ({
        fecha: s.created_at.slice(0, 16).replace('T', ' '), ejercicio: exName[s.exercise_id] || '', kilos: s.weight, reps: s.reps,
      })))
      const food = await fetchAll<Record<string, unknown>>('food_entries', 'day,meal,name,grams,kcal,protein,carbs,fat', (q) => q.order('day'))
      downloadCsv(`dieta-${d}.csv`, food.map((f) => ({
        fecha: f.day, comida: f.meal, alimento: f.name, gramos: f.grams, kcal: f.kcal, proteina: f.protein, hidratos: f.carbs, grasas: f.fat,
      })))
      const bw = await fetchAll<Record<string, unknown>>('body_weights', 'day,weight', (q) => q.order('day'))
      downloadCsv(`peso-${d}.csv`, bw.map((b) => ({ fecha: b.day, kilos: b.weight })))
      const ms = await fetchAll<Record<string, unknown>>('measurements', 'day,waist,chest,arm,leg', (q) => q.order('day'))
      downloadCsv(`medidas-${d}.csv`, ms.map((m) => ({ fecha: m.day, cintura: m.waist, pecho: m.chest, brazo: m.arm, pierna: m.leg })))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setExporting(false)
    }
  }

  const field = (k: keyof typeof p, label: string) => (
    <Input label={label} inputMode="numeric" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
  )

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-4">Ajustes</h1>
      <ErrorText error={error} />

      <Card className="space-y-3">
        <Input label="Tu nombre (lo ven tus amigos)" value={p.display_name} onChange={(e) => setP({ ...p, display_name: e.target.value })} />
        <p className="text-sm text-zinc-500">Cuenta: {session.user.email}</p>
      </Card>

      <SectionTitle>Objetivos diarios de dieta</SectionTitle>
      <Card className="grid grid-cols-2 gap-2">
        {field('kcal_goal', 'Kcal')}
        {field('protein_goal', 'Proteína (g)')}
        {field('carbs_goal', 'Hidratos (g)')}
        {field('fat_goal', 'Grasas (g)')}
      </Card>

      <SectionTitle>Entreno</SectionTitle>
      <Card className="space-y-3">
        {field('rest_seconds', 'Descanso entre series (segundos, 0 = sin temporizador)')}
        <label className="flex items-center justify-between gap-3 min-h-12">
          <span>
            <span className="block font-semibold">Compartir mis récords con mi grupo</span>
            <span className="block text-xs text-zinc-500">Solo récords por ejercicio. Nunca dieta ni peso.</span>
          </span>
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-6 w-6 accent-lime-400 shrink-0" />
        </label>
      </Card>

      <Button className="w-full mt-4" onClick={save}>{saved ? <><Check size={18} /> Guardado</> : 'Guardar cambios'}</Button>

      <SectionTitle>Copia de seguridad</SectionTitle>
      <Button variant="secondary" className="w-full" onClick={exportAll} disabled={exporting}>
        <Download size={18} /> {exporting ? 'Preparando…' : 'Descargar mis datos (CSV)'}
      </Button>
      <p className="text-xs text-zinc-500 mt-1">Se descargan archivos que puedes abrir con Excel.</p>

      <Button variant="danger" className="w-full mt-8" onClick={() => supabase.auth.signOut()}>
        <LogOut size={18} /> Cerrar sesión
      </Button>
    </div>
  )
}

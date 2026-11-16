import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Trash2, RefreshCw, Check, ChevronDown, Search, Clock, ShoppingCart } from 'lucide-react'
import { supabase, me } from '../supabase'
import { useApp } from '../App'
import type { Profile } from '../types'
import { Bar, Button, Card, Empty, ErrorText, Segmented, SectionTitle, Sheet } from '../components/ui'
import { addDays, errMsg, isoDay, round } from '../lib/utils'
import {
  CATS, DAYS, DL, MEAL_TO_DIARY, ML, dayTot, generate, gz, kz, norm, qty, shopping, steps,
  type Data, type Meal, type Plan, type Ration, type Recipe,
} from './engine'

type State = { plan: Plan; chk: Record<string, boolean>; z: Ration; src: '' | 'x' | 'm' }
const EMPTY: State = { plan: {}, chk: {}, z: 2000, src: '' }
const CACHE = 'diet-plan-cache'
const MEALS = Object.keys(ML) as Meal[]

/** Fecha (AAAA-MM-DD) del día L..D de la semana actual */
const dateOfWeekday = (d: number) => addDays(isoDay(), d - ((new Date().getDay() + 6) % 7))

/** Planificador semanal de dieta: plan con recetas, recetas con pasos y lista de la compra de Mercadona. */
export default function DietPlanner() {
  const { profile, setProfile } = useApp()
  const [D, setD] = useState<Data | null>(null)
  const [st, setSt] = useState<State | null>(null)
  const [tab, setTab] = useState<'w' | 'r' | 'c'>('w')
  const [day, setDay] = useState((new Date().getDay() + 6) % 7)
  const [error, setError] = useState<string | null>(null)
  const saveT = useRef<number | null>(null)

  // Recetas (se cargan aparte para no hacer pesada la app) y plan guardado en tu cuenta
  useEffect(() => {
    import('./data.json').then((m) => setD(m.default as unknown as Data))
    try { const c = localStorage.getItem(CACHE); if (c) setSt({ ...EMPTY, ...JSON.parse(c) }) } catch { /* nada */ }
    supabase.from('diet_plans').select('state').eq('user_id', me).maybeSingle().then(({ data, error }) => {
      if (error) return setError(error.message.includes('diet_plans') ? 'Falta activar el plan de dieta en el servidor (019-plan-dieta.sql). De momento se guarda solo en este móvil.' : errMsg(error))
      setSt((cur) => (data?.state ? { ...EMPTY, ...(data.state as State) } : cur || EMPTY))
    })
  }, [])

  const update = useCallback((fn: (s: State) => State) => {
    setSt((cur) => {
      const next = fn(cur || EMPTY)
      try { localStorage.setItem(CACHE, JSON.stringify(next)) } catch { /* nada */ }
      if (saveT.current) clearTimeout(saveT.current)
      saveT.current = window.setTimeout(() => {
        supabase.from('diet_plans').upsert({ user_id: me, state: next, updated_at: new Date().toISOString() }).then(() => {})
      }, 600)
      return next
    })
  }, [])

  const RM = useMemo(() => Object.fromEntries((D?.rec || []).map((r) => [r.i, r])) as Record<string, Recipe>, [D])
  const tg = [profile.kcal_goal, profile.protein_goal, profile.carbs_goal, profile.fat_goal]

  if (!D || !st) return <Empty>Cargando recetas…</Empty>

  return (
    <div>
      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'w', label: 'Semana' }, { value: 'r', label: 'Recetas' }, { value: 'c', label: 'Compra' }]} />
      </div>
      {error && <div className="mb-3"><ErrorText error={error} /></div>}
      {tab === 'w' && <WeekView D={D} RM={RM} st={st} update={update} day={day} setDay={setDay} tg={tg} profile={profile} setProfile={setProfile} />}
      {tab === 'r' && <RecipesView D={D} st={st} update={update} />}
      {tab === 'c' && <ShopView D={D} RM={RM} st={st} update={update} />}
    </div>
  )
}

/* ---------------- Semana ---------------- */

function WeekView({ D, RM, st, update, day, setDay, tg, profile, setProfile }: {
  D: Data; RM: Record<string, Recipe>; st: State; update: (fn: (s: State) => State) => void
  day: number; setDay: (d: number) => void; tg: number[]; profile: Profile; setProfile: (p: Profile) => void
}) {
  const [picker, setPicker] = useState<Meal | null>(null)
  const [arm, setArm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [logged, setLogged] = useState<Record<string, boolean>>({})
  const [goals, setGoals] = useState<string[]>(tg.map(String))
  const t = dayTot(st.plan, day, RM)
  const rem = tg[0] - t[0]
  const date = dateOfWeekday(day)
  const future = date > isoDay()
  const hasAny = Object.values(st.plan).some((p) => Object.keys(p).length)

  // ¿Qué comidas de este día ya están apuntadas en el diario?
  const loadLogged = useCallback(async () => {
    const { data } = await supabase.from('food_entries').select('name,meal').eq('user_id', me).eq('day', date)
    const rows = (data as { name: string; meal: string }[]) || []
    const p = st.plan[day] || {}
    setLogged(Object.fromEntries(MEALS.map((m) => [m, !!p[m] && rows.some((r) => r.meal === MEAL_TO_DIARY[m] && r.name === RM[p[m]!.i]?.n)])))
  }, [date, day, st.plan, RM])
  useEffect(() => { loadLogged() }, [loadLogged])

  async function gen(days: number[]) {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 30)) // deja pintar el "Generando…"
    update((s) => ({ ...s, plan: generate(s.plan, days, D.rec, tg, s.src) }))
    setBusy(false); setArm(false)
  }
  async function logMeal(m: Meal) {
    const s = st.plan[day]?.[m]; const r = s && RM[s.i]; if (!s || !r) return
    const k = kz(r, s.z), grams = r.g.reduce((sum, a) => sum + gz(a, s.z), 0)
    await supabase.from('food_entries').insert({
      day: date, meal: MEAL_TO_DIARY[m], name: r.n, grams: Math.round(grams),
      kcal: round(k[0], 1), protein: round(k[1], 1), carbs: round(k[2], 1), fat: round(k[3], 1),
    })
    loadLogged()
  }
  async function saveGoals() {
    const n = goals.map((g) => Math.round(Number(g.replace(',', '.')) || 0))
    const { data } = await supabase.from('profiles').update({ kcal_goal: n[0], protein_goal: n[1], carbs_goal: n[2], fat_goal: n[3] }).eq('id', profile.id).select().single()
    if (data) setProfile(data as Profile)
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-3">{DAYS[day]} <span className="text-sm text-zinc-500 font-normal">{new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></h1>
      <Card>
        <div className="flex items-baseline gap-1"><span className="text-4xl font-extrabold">{round(t[0])}</span><span className="text-zinc-400">de {tg[0]} kcal</span></div>
        <div className={`text-sm mb-2 ${rem < 0 ? 'text-orange-300' : 'text-zinc-400'}`}>{rem >= 0 ? `quedan ${round(rem)}` : `te pasas ${round(-rem)}`} kcal</div>
        <Bar value={t[0]} max={tg[0]} />
        <div className="grid grid-cols-3 gap-3 mt-3">
          {[['Proteína', 1, 'bg-sky-400'], ['Hidratos', 2, 'bg-amber-300'], ['Grasas', 3, 'bg-pink-400']].map(([n, i, c]) => (
            <div key={n as string}>
              <div className="text-xs text-zinc-400">{n}</div>
              <div className="text-sm font-semibold mb-1">{round(t[i as number])}<span className="text-zinc-500 font-normal">/{tg[i as number]} g</span></div>
              <Bar value={t[i as number]} max={tg[i as number]} color={c as string} />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-7 gap-1.5 my-4">
        {DL.map((l, i) => {
          const k = dayTot(st.plan, i, RM)[0]
          return (
            <button key={i} onClick={() => setDay(i)} className={`rounded-xl border px-0.5 py-2 text-center ${i === day ? 'border-accent bg-accent/10' : 'border-zinc-800 bg-zinc-900'}`}>
              <div className="font-bold text-sm">{l}</div>
              <div className="my-1 px-1"><Bar value={k} max={tg[0]} /></div>
              <div className="text-[10px] text-zinc-500">{round(k)}</div>
            </button>
          )
        })}
      </div>

      <Button className="w-full" disabled={busy} variant={arm ? 'danger' : 'primary'}
        onClick={() => { if (hasAny && !arm) return setArm(true); gen([0, 1, 2, 3, 4, 5, 6]) }}>
        <Sparkles size={18} /> {busy ? 'Generando…' : arm ? '¿Sustituir lo elegido? Pulsa otra vez' : 'Generar semana'}
      </Button>
      <div className="flex gap-2 mt-2">
        <Button variant="secondary" className="flex-1 text-sm" disabled={busy} onClick={() => gen([day])}><RefreshCw size={16} /> Generar este día</Button>
        <Button variant="ghost" className="text-sm" onClick={() => confirm('¿Vaciar toda la semana?') && update((s) => ({ ...s, plan: {}, chk: {} }))}><Trash2 size={16} /> Vaciar</Button>
      </div>

      {MEALS.map((m) => {
        const s = st.plan[day]?.[m], r = s && RM[s.i]
        if (!s || !r) return (
          <Card key={m} className="mt-3">
            <div className="font-bold">{ML[m]}</div>
            <Button variant="secondary" className="w-full mt-2" onClick={() => setPicker(m)}>+ Elegir receta</Button>
          </Card>
        )
        const k = kz(r, s.z)
        return (
          <Card key={m} className="mt-3 !border-accent/40">
            <div className="flex items-baseline justify-between"><span className="font-bold">{ML[m]}</span><b>{round(k[0])} kcal</b></div>
            <div className="font-semibold mt-1">{r.n}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs text-zinc-400">
              <span className="bg-zinc-800 rounded-lg px-2 py-0.5">P {round(k[1])} g</span>
              <span className="bg-zinc-800 rounded-lg px-2 py-0.5">H {round(k[2])} g</span>
              <span className="bg-zinc-800 rounded-lg px-2 py-0.5">G {round(k[3])} g</span>
              {r.x && <span className="bg-zinc-800 rounded-lg px-2 py-0.5">Ración {s.z}</span>}
            </div>
            <RecipeDetail r={r} z={s.z} />
            <div className="flex flex-wrap gap-2 mt-2">
              <Button variant="secondary" className="!min-h-10 text-sm" onClick={() => setPicker(m)}>Cambiar</Button>
              {r.x && <Button variant="secondary" className="!min-h-10 text-sm" onClick={() => update((x) => {
                const p = JSON.parse(JSON.stringify(x.plan)) as Plan; const sl = p[day]![m]!; sl.z = sl.z == 1600 ? 2000 : sl.z == 2000 ? 2400 : 1600; return { ...x, plan: p }
              })}>Ración {s.z == 1600 ? 2000 : s.z == 2000 ? 2400 : 1600}</Button>}
              <Button variant="ghost" className="!min-h-10 text-sm" onClick={() => update((x) => { const p = JSON.parse(JSON.stringify(x.plan)) as Plan; delete p[day]![m]; return { ...x, plan: p } })}>Quitar</Button>
            </div>
            {logged[m]
              ? <div className="mt-2 text-sm font-semibold text-accent flex items-center gap-1"><Check size={16} /> Apuntado en tu diario</div>
              : <Button className="w-full mt-2 !min-h-10 text-sm" disabled={future} onClick={() => logMeal(m)}>
                  <Check size={16} /> {future ? 'Podrás apuntarlo ese día' : 'Me lo he comido: apuntar en el diario'}
                </Button>}
          </Card>
        )
      })}

      <details className="mt-4 rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        <summary className="font-semibold cursor-pointer">Objetivos diarios</summary>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {['Calorías', 'Proteína (g)', 'Hidratos (g)', 'Grasas (g)'].map((n, i) => (
            <label key={n} className="text-sm text-zinc-400">{n}
              <input inputMode="numeric" value={goals[i]} onChange={(e) => setGoals((g) => g.map((x, j) => (j === i ? e.target.value : x)))}
                className="w-full mt-1 min-h-11 px-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100" />
            </label>
          ))}
        </div>
        <Button variant="secondary" className="w-full mt-3" onClick={saveGoals}>Guardar objetivos</Button>
        <p className="text-xs text-zinc-500 mt-2">Son los mismos objetivos que usa el diario de GymLog.</p>
      </details>

      <RecipePicker open={!!picker} meal={picker} D={D} st={st} title={picker ? `${ML[picker]} · ${DAYS[day]}` : ''}
        onClose={() => setPicker(null)}
        onPick={(r) => { update((x) => { const p = JSON.parse(JSON.stringify(x.plan)) as Plan; (p[day] = p[day] || {})[picker!] = { i: r.i, z: r.x ? x.z : 2000 }; return { ...x, plan: p } }); setPicker(null) }} />
    </div>
  )
}

/* ---------------- Receta: ingredientes y pasos ---------------- */

function RecipeDetail({ r, z }: { r: Recipe; z: number }) {
  const [open, setOpen] = useState(false)
  const st = open ? steps(r, z) : null
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="text-sm text-zinc-400 flex items-center gap-1">
        <ChevronDown size={16} className={open ? 'rotate-180' : ''} /> {open ? 'Ocultar receta' : 'Ver receta y modo de preparación'}
      </button>
      {st && (
        <div className="mt-2">
          <div className="text-xs uppercase tracking-wide text-zinc-400 font-semibold mb-1.5">Ingredientes</div>
          <div className="flex flex-wrap gap-1.5">
            {r.g.map((a, i) => <span key={i} className="text-sm bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1"><b>{qty(a, z)}</b> {a[3]}</span>)}
          </div>
          <div className="text-xs uppercase tracking-wide text-zinc-400 font-semibold mt-3 mb-1 flex items-center gap-1">Modo de preparación <Clock size={12} className="ml-1" /> ~{st.tm} min</div>
          <ol>
            {st.list.map(([e, t], i) => (
              <li key={i} className="flex gap-2.5 py-2 border-b border-zinc-800 last:border-0 text-[15px]">
                <span className="h-6 w-6 shrink-0 rounded-full bg-accent text-zinc-950 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span className="text-lg leading-none shrink-0">{e}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function Filters({ st, update }: { st: State; update: (fn: (s: State) => State) => void }) {
  const chip = (on: boolean) => `h-9 px-3 rounded-full border text-sm font-semibold ${on ? 'bg-accent text-zinc-950 border-accent' : 'bg-zinc-900 border-zinc-700 text-zinc-300'}`
  return (
    <div className="flex flex-wrap gap-1.5">
      {([1600, 2000, 2400] as Ration[]).map((z) => <button key={z} className={chip(st.z === z)} onClick={() => update((s) => ({ ...s, z }))}>Ración {z}</button>)}
      {([['', 'Todas'], ['x', 'Excel'], ['m', 'Mías']] as const).map(([v, n]) => <button key={v} className={chip(st.src === v)} onClick={() => update((s) => ({ ...s, src: v }))}>{n}</button>)}
    </div>
  )
}

function useRecipeList(D: Data, st: State, meal: Meal, q: string) {
  return useMemo(() => D.rec.filter((r) => r.m === meal && (!st.src || (st.src === 'x') === !!r.x) && norm(r.n).includes(norm(q)))
    .sort((a, b) => a.n.localeCompare(b.n, 'es')), [D, st.src, meal, q])
}
const macroLine = (r: Recipe, z: number) => { const k = kz(r, z); return `${round(k[0])} kcal · P ${round(k[1])} · H ${round(k[2])} · G ${round(k[3])}` }

function RecipePicker({ open, meal, D, st, title, onClose, onPick }: {
  open: boolean; meal: Meal | null; D: Data; st: State; title: string; onClose: () => void; onPick: (r: Recipe) => void
}) {
  const [q, setQ] = useState('')
  useEffect(() => { if (open) setQ('') }, [open])
  const list = useRecipeList(D, st, meal || 'D', q)
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <SearchBox q={q} setQ={setQ} />
      <ul className="mt-2">
        {list.map((r) => {
          const z = r.x ? st.z : 2000
          return (
            <li key={r.i}>
              <button onClick={() => onPick(r)} className="w-full text-left py-3 px-1 border-b border-zinc-800 active:bg-zinc-800">
                <div className="font-medium">{r.n}</div>
                <div className="text-xs text-zinc-500">{macroLine(r, z)}{r.x ? ` · ración ${z}` : ''}</div>
              </button>
            </li>
          )
        })}
        {list.length === 0 && <Empty>Sin resultados.</Empty>}
      </ul>
    </Sheet>
  )
}

function SearchBox({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  return (
    <div className="relative">
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar receta…"
        className="w-full min-h-12 pl-10 pr-3 rounded-xl bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-accent" />
    </div>
  )
}

/* ---------------- Recetas ---------------- */

function RecipesView({ D, st, update }: { D: Data; st: State; update: (fn: (s: State) => State) => void }) {
  const [meal, setMeal] = useState<Meal>('D')
  const [q, setQ] = useState('')
  const list = useRecipeList(D, st, meal, q)
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-3">Recetas <span className="text-sm text-zinc-500 font-normal">{D.rec.length}</span></h1>
      <Segmented value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m, label: ML[m] }))} />
      <div className="my-3"><Filters st={st} update={update} /></div>
      <SearchBox q={q} setQ={setQ} />
      <div className="space-y-2 mt-3">
        {list.map((r) => {
          const z = r.x ? st.z : 2000
          return (
            <Card key={r.i} className="!p-3">
              <div className="font-semibold">{r.n}</div>
              <div className="text-xs text-zinc-500">{macroLine(r, z)}{r.x ? '' : ' · mía'}</div>
              <RecipeDetail r={r} z={z} />
            </Card>
          )
        })}
        {list.length === 0 && <Empty>Sin resultados.</Empty>}
      </div>
    </div>
  )
}

/* ---------------- Compra ---------------- */

function ShopView({ D, RM, st, update }: { D: Data; RM: Record<string, Recipe>; st: State; update: (fn: (s: State) => State) => void }) {
  const { items, meals } = useMemo(() => shopping(st.plan, D, RM), [st.plan, D, RM])
  const done = items.filter((i) => st.chk[i.id]).length
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1 flex items-center gap-2"><ShoppingCart size={22} /> Lista de la compra</h1>
      <p className="text-sm text-zinc-400 mb-2">{meals} comidas planificadas · {done}/{items.length} productos cogidos. Envases aproximados de Mercadona.</p>
      {!meals && <Empty>Elige recetas en «Semana» para ver la lista.</Empty>}
      {(Object.keys(CATS) as (keyof typeof CATS)[]).map((c) => {
        const list = items.filter((i) => i.cat === c)
        if (!list.length) return null
        return (
          <div key={c}>
            <SectionTitle>{CATS[c]}</SectionTitle>
            <Card className="!p-0 divide-y divide-zinc-800">
              {list.map((i) => (
                <label key={i.id} className={`flex items-center gap-3 px-4 py-3 ${st.chk[i.id] ? 'opacity-50' : ''}`}>
                  <input type="checkbox" checked={!!st.chk[i.id]} onChange={(e) => update((s) => ({ ...s, chk: { ...s.chk, [i.id]: e.target.checked } }))} className="h-6 w-6 accent-lime-400 shrink-0" />
                  <span className="flex-1">
                    <span className={`block font-semibold ${st.chk[i.id] ? 'line-through' : ''}`}>{i.label}</span>
                    <span className="block text-xs text-zinc-500">Necesitas {i.need}</span>
                  </span>
                </label>
              ))}
            </Card>
          </div>
        )
      })}
      {meals > 0 && (
        <div className="flex gap-2 mt-4">
          <Button variant="secondary" className="flex-1 text-sm" onClick={() => update((s) => ({ ...s, chk: {} }))}>Desmarcar todo</Button>
          <Button variant="ghost" className="text-sm" onClick={() => confirm('¿Vaciar toda la semana?') && update((s) => ({ ...s, plan: {}, chk: {} }))}><Trash2 size={16} /> Vaciar semana</Button>
        </div>
      )}
    </div>
  )
}

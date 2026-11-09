import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Heart, Pin, Trophy, Plus } from 'lucide-react'
import { supabase, me } from '../supabase'
import { Button, Card, Empty, ErrorText, Input, Segmented, SectionTitle } from '../components/ui'
import { errMsg, isoDay, addDays, fmtDay } from '../lib/utils'
import Classes from './Classes'

type Center = { coach_id: string; center: string; center_type: string; modules: string[] }
type Section = 'clases' | 'wod' | 'marcas' | 'feed'
const LABEL: Record<Section, string> = { clases: 'Clases', wod: 'WOD', marcas: 'Marcas', feed: 'Novedades' }
const MODULE: Record<Section, string> = { clases: 'clases', wod: 'wods', marcas: 'prs', feed: 'feed' }

/** Mi centro: clases, WOD, marcas y novedades del centro al que pertenezco. */
export default function Center() {
  const [centers, setCenters] = useState<Center[] | null>(null)
  const [tab, setTab] = useState<Section>('clases')

  useEffect(() => {
    supabase.rpc('my_centers').then(({ data, error }) => setCenters(error ? [] : ((data as Center[]) || [])))
  }, [])

  const sections = useMemo(() => {
    const mods = new Set((centers || []).flatMap((c) => c.modules || []))
    return (Object.keys(LABEL) as Section[]).filter((s) => mods.has(MODULE[s]))
  }, [centers])
  useEffect(() => { if (sections.length && !sections.includes(tab)) setTab(sections[0]) }, [sections, tab])

  if (!centers) return <Empty>Cargando…</Empty>
  if (!centers.length) return (
    <div>
      <h1 className="text-2xl font-extrabold mb-4">Mi centro</h1>
      <Card><p className="text-sm text-zinc-400">Aún no estás conectado a ningún centro. Pide el código a tu gimnasio y mételo en <b>Ajustes → Mi entrenador</b>.</p></Card>
    </div>
  )

  return (
    <div>
      {sections.length > 1 && (
        <div className="mb-4"><Segmented value={tab} onChange={setTab} options={sections.map((s) => ({ value: s, label: LABEL[s] }))} /></div>
      )}
      {tab === 'clases' && sections.includes('clases') && <Classes />}
      {tab === 'wod' && <WodView />}
      {tab === 'marcas' && <MarksView />}
      {tab === 'feed' && <FeedView />}
      {sections.length === 0 && <Empty>Tu centro todavía no ha activado clases, WOD, marcas ni novedades.</Empty>}
    </div>
  )
}

/* ---------------- WOD ---------------- */

type WodBlock = { type: 'calentamiento' | 'fuerza' | 'metcon' | 'accesorio'; content: string }
const BLOCK: Record<WodBlock['type'], string> = { calentamiento: 'Calentamiento', fuerza: 'Fuerza', metcon: 'MetCon', accesorio: 'Accesorio' }

function WodView() {
  const [day, setDay] = useState(isoDay())
  const [wods, setWods] = useState<{ id: string; title: string; blocks: WodBlock[] }[] | null>(null)
  useEffect(() => {
    setWods(null)
    supabase.from('wods').select('id,title,blocks').eq('day', day).then(({ data }) => setWods((data as never) || []))
  }, [day])
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setDay(addDays(day, -1))} className="h-11 w-11 rounded-full bg-zinc-900 flex items-center justify-center" aria-label="Día anterior"><ChevronLeft /></button>
        <div className="text-center">
          <h1 className="text-xl font-extrabold">{day === isoDay() ? 'WOD de hoy' : 'WOD'}</h1>
          <p className="text-xs text-zinc-500">{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={() => setDay(addDays(day, 1))} className="h-11 w-11 rounded-full bg-zinc-900 flex items-center justify-center" aria-label="Día siguiente"><ChevronRight /></button>
      </div>
      {!wods ? <Empty>Cargando…</Empty> : wods.length === 0 ? <Empty>No hay WOD publicado para este día.</Empty> : wods.map((w) => (
        <Card key={w.id} className="space-y-4">
          <h2 className="text-xl font-extrabold text-accent">{w.title}</h2>
          {w.blocks.map((b, i) => (
            <div key={i}>
              <div className="text-xs uppercase tracking-wide text-zinc-400 font-semibold mb-1">{BLOCK[b.type]}</div>
              <p className="whitespace-pre-wrap leading-relaxed">{b.content}</p>
            </div>
          ))}
        </Card>
      ))}
    </div>
  )
}

/* ---------------- Marcas (PRs) ---------------- */

type Movement = { id: string; name: string; category: string; unit: 'kg' | 'tiempo' | 'reps' | 'metros' }
type Result = { id: string; value: number; rx: boolean; done_on: string }
type LB = { user_id: string; display_name: string; value: number; rx: boolean; done_on: string; is_me: boolean }
const CAT: Record<string, string> = { fuerza: 'Fuerza', olimpico: 'Olímpicos', benchmark_wod: 'Benchmarks', gimnastico: 'Gimnásticos', cardio: 'Cardio' }

function fmtMark(v: number, unit: Movement['unit']) {
  if (unit === 'tiempo') { const s = Math.round(v); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  return `${Number(v).toLocaleString('es-ES')} ${unit === 'kg' ? 'kg' : unit === 'metros' ? 'm' : 'reps'}`
}
function parseMark(s: string, unit: Movement['unit']) {
  if (unit === 'tiempo') {
    const [m, sec] = s.split(':')
    return sec === undefined ? Number(m.replace(',', '.')) * 60 : (parseInt(m) || 0) * 60 + (parseInt(sec) || 0)
  }
  return Number(s.replace(',', '.'))
}

function MarksView() {
  const [movs, setMovs] = useState<Movement[] | null>(null)
  const [sel, setSel] = useState<Movement | null>(null)
  const [mine, setMine] = useState<Result[]>([])
  const [board, setBoard] = useState<LB[]>([])
  const [value, setValue] = useState('')
  const [rx, setRx] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('pr_movements').select('id,name,category,unit').order('category').order('name').then(({ data }) => setMovs((data as Movement[]) || []))
  }, [])
  const load = useCallback(async (m: Movement) => {
    const [a, b] = await Promise.all([
      supabase.from('pr_results').select('id,value,rx,done_on').eq('user_id', me).eq('movement_id', m.id).order('done_on', { ascending: false }),
      supabase.rpc('center_leaderboard', { p_movement: m.id }),
    ])
    setMine((a.data as Result[]) || [])
    setBoard(((b.data as LB[]) || []).sort((x, y) => Number(y.rx) - Number(x.rx) || (m.unit === 'tiempo' ? x.value - y.value : y.value - x.value)))
  }, [])
  useEffect(() => { if (sel) { setValue(''); setError(null); load(sel) } }, [sel, load])

  async function add() {
    if (!sel) return
    const v = parseMark(value, sel.unit)
    if (!(v > 0)) return setError(sel.unit === 'tiempo' ? 'Escribe el tiempo como 4:35' : 'Escribe un número')
    const { error } = await supabase.from('pr_results').insert({ movement_id: sel.id, value: v, rx })
    if (error) return setError(errMsg(error))
    setValue(''); setError(null); load(sel)
  }

  if (!movs) return <Empty>Cargando…</Empty>
  if (!sel) return (
    <div>
      <h1 className="text-2xl font-extrabold mb-4">Marcas</h1>
      {movs.length === 0 && <Empty>Tu centro aún no ha creado movimientos.</Empty>}
      {Object.keys(CAT).map((c) => {
        const list = movs.filter((m) => m.category === c)
        if (!list.length) return null
        return (
          <div key={c}>
            <SectionTitle>{CAT[c]}</SectionTitle>
            <Card className="!p-0 divide-y divide-zinc-800">
              {list.map((m) => (
                <button key={m.id} onClick={() => setSel(m)} className="w-full flex items-center justify-between px-4 h-12 text-left">
                  <span className="font-medium">{m.name}</span><ChevronRight size={18} className="text-zinc-500" />
                </button>
              ))}
            </Card>
          </div>
        )
      })}
    </div>
  )

  const best = mine.length ? mine.reduce((b, r) => (sel.unit === 'tiempo' ? (r.value < b.value ? r : b) : (r.value > b.value ? r : b))) : null
  return (
    <div>
      <button onClick={() => setSel(null)} className="text-sm text-zinc-400 flex items-center gap-1 mb-2"><ChevronLeft size={16} /> Marcas</button>
      <h1 className="text-2xl font-extrabold">{sel.name}</h1>
      <p className="text-sm text-zinc-400 mb-4">{best ? <>Tu mejor marca: <b className="text-accent">{fmtMark(best.value, sel.unit)}</b>{best.rx ? ' RX' : ''}</> : 'Aún no has apuntado esta marca'}</p>

      <Card className="space-y-3">
        <Input label={sel.unit === 'tiempo' ? 'Tiempo (min:seg)' : sel.unit === 'kg' ? 'Kilos' : sel.unit === 'metros' ? 'Metros' : 'Repeticiones'}
          inputMode={sel.unit === 'tiempo' ? 'text' : 'decimal'} placeholder={sel.unit === 'tiempo' ? '4:35' : ''} value={value} onChange={(e) => setValue(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rx} onChange={(e) => setRx(e.target.checked)} className="h-5 w-5 accent-lime-400" /> RX (sin adaptar)</label>
        <ErrorText error={error} />
        <Button className="w-full" onClick={add} disabled={!value.trim()}><Plus size={18} /> Apuntar marca</Button>
      </Card>

      <SectionTitle>Ranking del centro</SectionTitle>
      <Card className="!p-0 divide-y divide-zinc-800">
        {board.map((r, i) => (
          <div key={r.user_id} className={`flex items-center gap-3 px-4 h-12 ${r.is_me ? 'bg-accent/10' : ''}`}>
            <span className="w-6 text-center font-bold">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <span className="flex-1 truncate">{r.display_name}{r.is_me ? ' (tú)' : ''}</span>
            <span className="font-semibold">{fmtMark(r.value, sel.unit)}</span>
            <span className={`text-[10px] font-bold ${r.rx ? 'text-accent' : 'text-zinc-500'}`}>{r.rx ? 'RX' : 'SC'}</span>
          </div>
        ))}
        {board.length === 0 && <p className="p-4 text-sm text-zinc-500 flex items-center gap-2"><Trophy size={16} /> Sé el primero en apuntar esta marca.</p>}
      </Card>

      {mine.length > 0 && (
        <>
          <SectionTitle>Tu historial</SectionTitle>
          <Card className="!p-0 divide-y divide-zinc-800">
            {mine.map((r) => (
              <div key={r.id} className="flex items-center px-4 h-11 text-sm">
                <span className="flex-1 text-zinc-400">{fmtDay(r.done_on)}</span>
                <span className="font-semibold">{fmtMark(r.value, sel.unit)}{r.rx ? ' RX' : ''}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}

/* ---------------- Novedades ---------------- */

type Post = { id: string; type: string; title: string; content: string; image_path: string | null; pinned: boolean; created_at: string; post_likes: { user_id: string }[] }
const TYPE: Record<string, string> = { aviso: '📣 Aviso', consejo: '💡 Consejo', receta: '🥗 Receta', wod: '🔥 WOD' }

function FeedView() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    const { data } = await supabase.from('posts').select('*, post_likes(user_id)').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(40)
    const list = (data as Post[]) || []
    setPosts(list)
    const paths = list.map((p) => p.image_path).filter(Boolean) as string[]
    if (paths.length) {
      const { data: s } = await supabase.storage.from('center-posts').createSignedUrls(paths, 3600)
      setUrls(Object.fromEntries((s || []).filter((x) => x.signedUrl && x.path).map((x) => [x.path!, x.signedUrl as string])))
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function like(p: Post) {
    const liked = p.post_likes.some((l) => l.user_id === me)
    setPosts((l) => l?.map((x) => x.id !== p.id ? x : { ...x, post_likes: liked ? x.post_likes.filter((y) => y.user_id !== me) : [...x.post_likes, { user_id: me }] }) || null)
    if (liked) await supabase.from('post_likes').delete().eq('post_id', p.id).eq('user_id', me)
    else await supabase.from('post_likes').insert({ post_id: p.id })
  }

  if (!posts) return <Empty>Cargando…</Empty>
  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-4">Novedades</h1>
      {posts.length === 0 && <Empty>Tu centro aún no ha publicado nada.</Empty>}
      <div className="space-y-4">
        {posts.map((p) => {
          const liked = p.post_likes.some((l) => l.user_id === me)
          return (
            <Card key={p.id} className="!p-0 overflow-hidden">
              {p.image_path && urls[p.image_path] && <img src={urls[p.image_path]} alt="" className="w-full max-h-80 object-cover" />}
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>{TYPE[p.type] || p.type}</span>
                  {p.pinned && <span className="flex items-center gap-1 text-accent"><Pin size={12} /> Fijado</span>}
                  <span className="ml-auto">{fmtDay(p.created_at.slice(0, 10))}</span>
                </div>
                <h2 className="mt-1 text-lg font-bold">{p.title}</h2>
                {p.content && <p className="mt-1 text-sm text-zinc-300 whitespace-pre-wrap">{p.content}</p>}
                <button onClick={() => like(p)} className={`mt-3 flex items-center gap-1.5 text-sm ${liked ? 'text-pink-400' : 'text-zinc-400'}`}>
                  <Heart size={18} fill={liked ? 'currentColor' : 'none'} /> {p.post_likes.length}
                </button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

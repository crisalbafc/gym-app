import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Home, Dumbbell, Apple, Scale, LineChart, Users, Settings as SettingsIcon } from 'lucide-react'
import { supabase, isConfigured } from './supabase'
import type { Exercise, Profile, Tab } from './types'
import Auth, { NewPassword } from './screens/Auth'
import Today from './screens/Today'
import WorkoutScreen from './screens/Workout'
import Diet from './screens/Diet'
import Body from './screens/Body'
import Progress from './screens/Progress'
import Group from './screens/Group'
import Settings from './screens/Settings'
import Privacy from './screens/Privacy'
import Admin from './screens/Admin'

type Ctx = {
  session: Session
  profile: Profile
  setProfile: (p: Profile) => void
  exercises: Exercise[]
  reloadExercises: () => Promise<void>
  go: (t: Tab) => void
  isAdmin: boolean
}
const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => useContext(AppCtx)!

const NAV: { tab: Tab; label: string; icon: typeof Home }[] = [
  { tab: 'hoy', label: 'Hoy', icon: Home },
  { tab: 'entreno', label: 'Entreno', icon: Dumbbell },
  { tab: 'dieta', label: 'Dieta', icon: Apple },
  { tab: 'cuerpo', label: 'Cuerpo', icon: Scale },
  { tab: 'progreso', label: 'Progreso', icon: LineChart },
]

function readTab(): Tab {
  try { return (localStorage.getItem('tab') as Tab) || 'hoy' } catch { return 'hoy' }
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-2">Falta conectar la base de datos</h1>
        <p className="text-zinc-400">Añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.local.</p>
      </div>
    )
  }
  if (session === undefined) return <Splash />
  if (recovery && session) return <NewPassword onDone={() => setRecovery(false)} />
  if (!session) return <Auth />
  return <LoggedIn session={session} />
}

function Splash() {
  return (
    <div className="h-full flex items-center justify-center">
      <Dumbbell className="text-accent animate-pulse" size={48} />
    </div>
  )
}

function LoggedIn({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [tab, setTab] = useState<Tab>(readTab)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(data === true))
  }, [session.user.id])

  const reloadExercises = useCallback(async () => {
    const { data } = await supabase.from('exercises').select('id,user_id,name,muscle').order('name')
    setExercises((data as Exercise[]) || [])
  }, [])

  useEffect(() => {
    (async () => {
      let { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      if (!data && !error) {
        // Por si el perfil no se creó al registrarse
        const name = (session.user.user_metadata?.display_name as string) || session.user.email?.split('@')[0] || 'Atleta'
        const res = await supabase.from('profiles').insert({ id: session.user.id, display_name: name }).select().single()
        data = res.data; error = res.error
      }
      if (error) setError(error.message)
      else setProfile(data as Profile)
    })()
    reloadExercises()
  }, [session.user.id, reloadExercises])

  const go = useCallback((t: Tab) => {
    setTab(t)
    try { localStorage.setItem('tab', t) } catch { /* sin almacenamiento */ }
    window.scrollTo(0, 0)
  }, [])

  if (error) return <div className="p-6 text-red-400">Error cargando tu perfil: {error}. ¿Has ejecutado el archivo schema.sql en Supabase?</div>
  if (!profile) return <Splash />

  return (
    <AppCtx.Provider value={{ session, profile, setProfile, exercises, reloadExercises, go, isAdmin }}>
      <div className="min-h-full flex flex-col">
        <header className="pt-safe sticky top-0 z-30 bg-zinc-950/90 backdrop-blur border-b border-zinc-900">
          <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
            <button onClick={() => go('hoy')} className="flex items-center gap-2 font-extrabold text-lg">
              <Dumbbell className="text-accent" size={22} /> GymLog
            </button>
            <div className="flex gap-1">
              <IconBtn active={tab === 'grupo'} onClick={() => go('grupo')} label="Grupo de amigos"><Users size={20} /></IconBtn>
              <IconBtn active={tab === 'ajustes' || tab === 'privacidad' || tab === 'admin'} onClick={() => go('ajustes')} label="Ajustes"><SettingsIcon size={20} /></IconBtn>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-lg mx-auto px-4 pt-4 pb-28">
          {tab === 'hoy' && <Today />}
          {tab === 'entreno' && <WorkoutScreen />}
          {tab === 'dieta' && <Diet />}
          {tab === 'cuerpo' && <Body />}
          {tab === 'progreso' && <Progress />}
          {tab === 'grupo' && <Group />}
          {tab === 'ajustes' && <Settings />}
          {tab === 'privacidad' && <Privacy />}
          {tab === 'admin' && isAdmin && <Admin />}
        </main>

        <nav className="fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 pb-safe">
          <div className="max-w-lg mx-auto grid grid-cols-5">
            {NAV.map(({ tab: t, label, icon: Icon }) => (
              <button
                key={t}
                onClick={() => go(t)}
                className={`h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${tab === t ? 'text-accent' : 'text-zinc-500'}`}
              >
                <Icon size={22} strokeWidth={tab === t ? 2.5 : 2} />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </AppCtx.Provider>
  )
}

function IconBtn({ children, onClick, active, label }: { children: React.ReactNode; onClick: () => void; active: boolean; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className={`h-10 w-10 rounded-full flex items-center justify-center ${active ? 'bg-zinc-800 text-accent' : 'text-zinc-300 active:bg-zinc-800'}`}>
      {children}
    </button>
  )
}

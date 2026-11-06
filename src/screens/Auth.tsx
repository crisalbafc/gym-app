import { useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { supabase } from '../supabase'
import { Button, Input, ErrorText, Segmented } from '../components/ui'
import { errMsg } from '../lib/utils'

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: location.origin + location.pathname },
        })
        if (error) throw error
        if (!data.session) setInfo('¡Cuenta creada! Te hemos enviado un email: pulsa el enlace para confirmarla y luego entra aquí.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname })
        if (error) throw error
        setInfo('Te hemos enviado un email con un enlace para cambiar la contraseña.')
      }
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-10 max-w-sm mx-auto">
      <div className="flex flex-col items-center mb-8">
        <div className="h-20 w-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
          <Dumbbell className="text-accent" size={40} />
        </div>
        <h1 className="text-3xl font-extrabold">GymLog</h1>
        <p className="text-zinc-400 mt-1">Entrenos, dieta y progreso</p>
      </div>

      {mode !== 'reset' && (
        <Segmented
          value={mode}
          onChange={(m) => { setMode(m); setError(null); setInfo(null) }}
          options={[{ value: 'login', label: 'Entrar' }, { value: 'signup', label: 'Crear cuenta' }]}
        />
      )}

      <form onSubmit={submit} className="space-y-3 mt-4">
        {mode === 'signup' && (
          <Input label="Tu nombre (lo verán tus amigos)" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="nickname" />
        )}
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        {mode !== 'reset' && (
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        )}
        <ErrorText error={error} />
        {info && <p className="text-sm text-accent bg-accent/10 rounded-xl px-3 py-2">{info}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
        </Button>
      </form>

      <button
        className="mt-6 text-sm text-zinc-400 underline"
        onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setError(null); setInfo(null) }}
      >
        {mode === 'reset' ? 'Volver a entrar' : '¿Has olvidado la contraseña?'}
      </button>
    </div>
  )
}

export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(errMsg(error))
    else onDone()
  }
  return (
    <form onSubmit={submit} className="min-h-full flex flex-col justify-center px-6 max-w-sm mx-auto space-y-3">
      <h1 className="text-2xl font-bold">Nueva contraseña</h1>
      <Input label="Escribe tu nueva contraseña" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <ErrorText error={error} />
      <Button type="submit" disabled={busy}>Guardar</Button>
    </form>
  )
}

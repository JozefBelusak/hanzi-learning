import { useState, type FormEvent } from 'react'
import type { Auth } from '../lib/useAuth'
import { accountError } from '../lib/supabase'
import './AuthPage.css'

type Props = { mode: 'login' | 'register'; auth: Auth; onSwitch: () => void; onBack: () => void }

export default function AuthPage({ mode, auth, onSwitch, onBack }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState(false)
  const registration = mode === 'register'
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      if (registration) setConfirmation(await auth.register(email, password, name))
      else await auth.signIn(email, password)
      setPassword('')
    } catch (failure) { setError(accountError(failure)) }
    finally { setBusy(false) }
  }
  return <main className="auth-page">
    <button type="button" className="back-button" onClick={onBack}>Back to Hanzi</button>
    <section className="card-surface auth-card">
      <span className="auth-brand" lang="zh-CN" aria-hidden="true">学</span>
      <h1>{registration ? 'Create your account' : 'Sign in'}</h1>
      <p>{registration ? 'Start as a student. Your learning progress stays separate for your account on this device.' : 'Welcome back. Continue your Chinese journey.'}</p>
      {!auth.configured && <p role="alert" className="error-message">Sign-in is currently unavailable. Please contact the platform administrator.</p>}
      {confirmation ? <div role="status"><h2>Check your email</h2><p>If registration is available for this address, you will receive a confirmation link. Confirm your email, then sign in.</p><button type="button" onClick={onSwitch}>Go to sign in</button></div> :
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {registration && <><label htmlFor="account-name">Your name</label><input id="account-name" autoComplete="name" required minLength={1} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></>}
          <label htmlFor="account-email">Email</label><input id="account-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
          <label htmlFor="account-password">Password</label><input id="account-password" type="password" autoComplete={registration ? 'new-password' : 'current-password'} required minLength={registration ? 12 : 1} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
          {registration && <small>Use at least 12 characters. New accounts have the Student role.</small>}
          {(error || auth.error) && <p role="alert" className="error-message">{error ?? auth.error}</p>}
          <button type="submit" disabled={busy || !auth.configured}>{busy ? 'Please wait…' : registration ? 'Create account' : 'Sign in'}</button>
        </form>}
      {!confirmation && <p className="auth-switch">{registration ? 'Already have an account?' : 'New to Hanzi?'} <button type="button" className="text-btn" disabled={busy} onClick={onSwitch}>{registration ? 'Sign in' : 'Create an account'}</button></p>}
    </section>
  </main>
}

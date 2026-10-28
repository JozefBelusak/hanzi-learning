import { createClient } from '@supabase/supabase-js'
import { readStoredString, removeStoredString, writeStoredString } from './storage'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

function validConfiguration(): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return false
    if (key.startsWith('sb_publishable_')) return true
    const payload = JSON.parse(atob(key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')))
    return payload.role === 'anon'
  } catch { return false }
}

export const supabase = validConfiguration() ? createClient(url, key, {
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }) },
  auth: {
    storageKey: 'hanzi-auth-session-v1',
    flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    storage: { getItem: readStoredString, setItem: writeStoredString, removeItem: removeStoredString },
  },
}) : null

export function requireSupabase() {
  if (!supabase) throw new Error('Sign-in is not configured. Please contact the platform administrator.')
  return supabase
}

export function accountError(error: unknown): string {
  const failure = error as { code?: string; message?: string }
  if (failure.code === 'invalid_credentials' || /invalid login credentials/i.test(failure.message ?? '')) return 'Email or password is incorrect.'
  if (failure.code === 'email_not_confirmed') return 'Confirm your email address before signing in.'
  if (['flow_state_not_found', 'flow_state_expired', 'bad_code_verifier'].includes(failure.code ?? '')) return 'The email link could not restore a session. Try signing in with your email and password.'
  if (failure.code === 'weak_password') return 'Use a password with at least 12 characters.'
  if (/rate_limit|over_.*rate/.test(failure.code ?? '')) return 'Too many attempts. Please wait before trying again.'
  if (/fetch|network/i.test(failure.message ?? '')) return 'Could not connect. Check your connection and try again.'
  return 'The request could not be completed. Please try again.'
}

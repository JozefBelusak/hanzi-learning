import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import type { UserProfile } from '../types/auth'
import { isUserRole } from './access'
import { accountError, requireSupabase, supabase } from './supabase'
import { hasCompletedOnboarding, profileColumns, validLearningProfile, type LearningProfileInput } from './profile'

type AuthState = { ready: boolean; session: Session | null; profile: UserProfile | null; error: string | null }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ ready: !supabase, session: null, profile: null, error: null })
  const [revision, setRevision] = useState(0)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    let sequence = 0
    async function hydrate(session: Session | null) {
      if (!active) return
      const request = ++sequence
      setState((previous) => ({
        ready: !session || previous.profile?.id === session.user.id,
        session, profile: session && previous.profile?.id === session.user.id ? previous.profile : null, error: null,
      }))
      if (!session) return
      // A session in local storage is not proof of identity. Verify its token
      // with Auth, then load the database-owned role under that user's JWT.
      const verified = await client!.auth.getUser(session.access_token)
      if (!active || request !== sequence) return
      if (verified.error || !verified.data.user) {
        setState({ ready: true, session: null, profile: null, error: 'Your session could not be verified. Please sign in again.' })
        return
      }
      const result = await client!.from('profiles').select(profileColumns).eq('id', verified.data.user.id).abortSignal(AbortSignal.timeout(8000)).single()
      if (!active || request !== sequence) return
      if (result.error || !result.data || !isUserRole(result.data.role) || result.data.id !== verified.data.user.id) {
        const missingMigration = result.error?.code === '42703' || result.error?.code === 'PGRST204'
        setState({ ready: true, session, profile: null, error: missingMigration ? 'The account database needs an update. Please ask the platform administrator to apply the learning profile migration.' : 'Your account permissions could not be loaded. Try again or contact the platform administrator.' })
      } else setState({ ready: true, session, profile: result.data as UserProfile, error: null })
    }
    const refresh = () => {
      const request = ++sequence
      void client.auth.getSession().then(({ data, error }) => {
        if (!active || request !== sequence) return
        if (error) { ++sequence; setState({ ready: true, session: null, profile: null, error: accountError(error) }); return }
        void hydrate(data.session)
      }).catch(() => { if (active && request === sequence) setState({ ready: true, session: null, profile: null, error: 'Could not restore your session. Please sign in again.' }) })
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      const request = ++sequence
      // Keep Auth calls outside the callback's internal SDK lock.
      if (event === 'SIGNED_OUT') { if (active) setState({ ready: true, session: null, profile: null, error: null }) }
      else setTimeout(() => { if (active && request === sequence) void hydrate(session) }, 0)
    })
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; ++sequence; data.subscription.unsubscribe(); window.removeEventListener('focus', refresh) }
  }, [revision])

  async function signIn(email: string, password: string) {
    const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }
  async function register(email: string, password: string, name: string): Promise<boolean> {
    const { data, error } = await requireSupabase().auth.signUp({
      email: email.trim(), password,
      options: { data: { display_name: name.trim() }, ...(Capacitor.isNativePlatform() ? {} : { emailRedirectTo: `${window.location.origin}/` }) },
    })
    if (error) throw error
    return data.session === null
  }
  async function signOut() {
    setSigningOut(true)
    try {
      const { error } = await requireSupabase().auth.signOut({ scope: 'local' })
      if (error) throw error
    } finally { setSigningOut(false) }
  }
  async function saveProfile(input: LearningProfileInput): Promise<void> {
    if (!validLearningProfile(input)) throw new Error('Choose at least one practice mode and learning goal, and complete all profile fields.')
    const { data, error } = await requireSupabase().rpc('save_learning_profile', {
      profile_name: input.displayName.trim(), profile_level: input.languageLevel, profile_difficulty: input.difficulty,
      profile_modes: input.preferredModes, profile_goals: input.learningGoals, profile_daily_goal: input.dailyGoal,
    }).abortSignal(AbortSignal.timeout(15_000))
    if (error) throw error
    if (!data || data.id !== state.profile?.id || !isUserRole(data.role) || !hasCompletedOnboarding(data as UserProfile)) throw new Error('Your profile could not be saved. Please sign in again.')
    setState((previous) => previous.session?.user.id === data.id ? { ...previous, profile: data as UserProfile } : previous)
    // Invalidate any earlier profile request so it cannot restore stale preferences.
    setRevision((value) => value + 1)
  }
  return { ...state, configured: Boolean(supabase), signingOut, signIn, register, signOut, saveProfile, retry: () => setRevision((value) => value + 1) }
}

export type Auth = ReturnType<typeof useAuth>

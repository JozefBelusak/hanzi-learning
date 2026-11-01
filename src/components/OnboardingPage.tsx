import { useEffect, useRef } from 'react'
import type { UserProfile } from '../types/auth'
import type { LearningProfileInput } from '../lib/profile'
import LearningProfileForm from './LearningProfileForm'

export default function OnboardingPage({ profile, onSave, onLogout, logoutError }: {
  profile: UserProfile; onSave: (input: LearningProfileInput) => Promise<void>; onLogout: () => void; logoutError: string | null
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0) }, [])
  return (
    <main className="onboarding-page">
      <div className="onboarding-heading"><span className="auth-brand" lang="zh-CN" aria-hidden="true">汉</span><h1 ref={heading} tabIndex={-1}>Make Hanzi your own</h1><p>Before you start, tell us about your Chinese and what you want to achieve. You can change everything later in Settings.</p><p className="profile-account">Setting up {profile.email}</p></div>
      <LearningProfileForm profile={profile} onboarding onSave={onSave} />
      {logoutError && <p role="alert" className="error-message">{logoutError}</p>}
      <button type="button" className="text-btn" onClick={onLogout}>Sign out</button>
    </main>
  )
}

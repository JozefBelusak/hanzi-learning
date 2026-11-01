import { useState, type FormEvent } from 'react'
import type { UserProfile } from '../types/auth'
import { difficulties, languageLevels, learningGoals, practicePreferences, profileInput, validLearningProfile, type LearningProfileInput } from '../lib/profile'
import './LearningProfile.css'

type Props = { profile: UserProfile; onboarding?: boolean; onSave: (input: LearningProfileInput) => Promise<void> }

export default function LearningProfileForm({ profile, onboarding = false, onSave }: Props) {
  const initial = JSON.stringify(profileInput(profile))
  const [draft, setDraft] = useState(() => ({ source: initial, values: profileInput(profile) }))
  // Keep unsaved edits through equivalent focus refreshes. A genuinely changed
  // server profile replaces the draft without an effect or an extra render.
  const values = draft.source === initial ? draft.values : profileInput(profile)
  const setValues = (next: LearningProfileInput) => setDraft({ source: initial, values: next })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function toggle<T extends string>(items: T[], id: T): T[] {
    return items.includes(id) ? items.filter((value) => value !== id) : [...items, id]
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setMessage(null)
    if (!validLearningProfile(values)) { setError('Choose at least one practice mode and learning goal, and complete all profile fields.'); return }
    setBusy(true); setError(null)
    try { await onSave(values); setMessage('Preferences saved to your account.') }
    catch (failure) {
      const code = (failure as { code?: string }).code
      setError(code === 'PGRST202' ? 'The account database needs an update. Ask the administrator to apply the learning profile migration.' : 'Your preferences could not be saved. Check your connection and try again. Your existing profile has not been changed in this screen.')
    } finally { setBusy(false) }
  }
  return (
    <form className="card-surface learning-profile-form" onSubmit={(event) => void submit(event)} aria-label={onboarding ? 'Set up your learning profile' : 'Edit your learning profile'} aria-busy={busy}>
      {!onboarding && <h2>Profile and learning preferences</h2>}
      <fieldset className="profile-fields" disabled={busy}>
        <legend className="sr-only">Your learning profile</legend>
        <label htmlFor="profile-name">What should we call you?</label>
        <input id="profile-name" autoComplete="nickname" required maxLength={80} value={values.displayName} onChange={(event) => setValues({ ...values, displayName: event.target.value })} />
        <div className="profile-selects">
          <div><label htmlFor="language-level">Chinese language level</label><select id="language-level" value={values.languageLevel} onChange={(event) => setValues({ ...values, languageLevel: event.target.value as LearningProfileInput['languageLevel'] })}>{languageLevels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}</select><small>{languageLevels.find(({ id }) => id === values.languageLevel)?.description}</small></div>
          <div><label htmlFor="profile-difficulty">Preferred difficulty</label><select id="profile-difficulty" value={values.difficulty} onChange={(event) => setValues({ ...values, difficulty: event.target.value as LearningProfileInput['difficulty'] })}>{difficulties.map((difficulty) => <option key={difficulty.id} value={difficulty.id}>{difficulty.label}</option>)}</select><small>{difficulties.find(({ id }) => id === values.difficulty)?.description}</small></div>
        </div>
        <fieldset className="profile-options"><legend>How do you like to practise?</legend><p>Choose at least one. You can still use every practice mode.</p><div>{practicePreferences.map((mode) => <label key={mode.id}><input type="checkbox" checked={values.preferredModes.includes(mode.id)} onChange={() => setValues({ ...values, preferredModes: toggle(values.preferredModes, mode.id) })} /><span>{mode.label}</span></label>)}</div></fieldset>
        <fieldset className="profile-options"><legend>What are your learning goals?</legend><p>Choose at least one reason for learning Chinese.</p><div>{learningGoals.map((goal) => <label key={goal.id}><input type="checkbox" checked={values.learningGoals.includes(goal.id)} onChange={() => setValues({ ...values, learningGoals: toggle(values.learningGoals, goal.id) })} /><span>{goal.label}</span></label>)}</div></fieldset>
        <label htmlFor="daily-goal">Daily goal · attempts</label>
        <input id="daily-goal" type="number" min={1} max={100} required value={Number.isNaN(values.dailyGoal) ? '' : values.dailyGoal} onChange={(event) => setValues({ ...values, dailyGoal: event.target.valueAsNumber })} />
        <small>This target is used in your daily progress and counts free practice attempts. Course and exercise completion is tracked separately.</small>
        <p className="profile-content-note">The current course and vocabulary cover beginner Chinese (HSK 1). Level and difficulty record your preferences; they do not unlock advanced content or change assessment scores.</p>
        <button type="submit">{busy ? 'Saving…' : onboarding ? 'Finish setup' : 'Save preferences'}</button>
      </fieldset>
      {error && <p role="alert" className="error-message">{error}</p>}
      {message && <p role="status" className="status-message">{message}</p>}
    </form>
  )
}

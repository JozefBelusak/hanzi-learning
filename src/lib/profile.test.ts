import { describe, expect, it } from 'vitest'
import { applyAccountProfile, hasCompletedOnboarding, profileInput, validLearningProfile, type LearningProfileInput } from './profile'
import { emptyStudy, mergeStudy } from './study'
import type { UserProfile } from '../types/auth'

const profile: UserProfile = {
  id: 'account-id', email: 'learner@example.test', display_name: 'Learner', role: 'student', created_at: '2026-11-01T00:00:00Z',
  language_level: 'beginner', difficulty: 'balanced', preferred_modes: ['speech'], learning_goals: ['travel'], daily_goal: 15, onboarding_completed_at: '2026-11-01T00:00:00Z',
}
describe('learning profile and progress integration', () => {
  it('requires valid saved preferences and server completion, regardless of account role', () => {
    expect(hasCompletedOnboarding(profile)).toBe(true)
    expect(hasCompletedOnboarding({ ...profile, onboarding_completed_at: null, role: 'admin' })).toBe(false)
    expect(hasCompletedOnboarding({ ...profile, preferred_modes: [] })).toBe(false)
    expect(hasCompletedOnboarding({ ...profile, learning_goals: [] })).toBe(false)
    expect(hasCompletedOnboarding({ ...profile, language_level: null })).toBe(false)
    expect(hasCompletedOnboarding({ ...profile, onboarding_completed_at: 'bad-date' })).toBe(false)
  })
  it('validates selectable preferences and a whole daily goal between 1 and 100', () => {
    const input = profileInput(profile)
    expect(validLearningProfile(input)).toBe(true)
    for (const dailyGoal of [0, 101, NaN, Infinity, 1.5]) expect(validLearningProfile({ ...input, dailyGoal })).toBe(false)
    expect(validLearningProfile({ ...input, languageLevel: 'unknown' } as unknown as LearningProfileInput)).toBe(false)
    expect(validLearningProfile({ ...input, preferredModes: ['admin'] } as unknown as LearningProfileInput)).toBe(false)
    expect(validLearningProfile({ ...input, displayName: '   ' })).toBe(false)
  })
  it('uses the account goal after a conflicting backup without losing study history', () => {
    const imported = { ...emptyStudy(), displayName: 'Different name', dailyGoal: 99, attempts: [{ id: 'attempt-1', cardId: 'wo', createdAt: '2026-11-01T00:00:00Z', mode: 'speech' as const, input: 'manual' as const, correct: true }] }
    const next = applyAccountProfile(mergeStudy(emptyStudy(), imported), profile)
    expect(next).toMatchObject({ displayName: 'Learner', dailyGoal: 15 })
    expect(next.attempts).toHaveLength(1)
    expect(imported.dailyGoal).toBe(99)
  })
})

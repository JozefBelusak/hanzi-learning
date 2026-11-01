import type { UserProfile } from '../types/auth'
import type { PracticeMode, StudyData } from '../types/study'

export const languageLevels = [
  { id: 'beginner', label: 'Beginner', description: 'I am starting from the basics.' },
  { id: 'elementary', label: 'Elementary', description: 'I know some words and simple phrases.' },
  { id: 'intermediate', label: 'Intermediate', description: 'I can handle familiar everyday situations.' },
  { id: 'advanced', label: 'Advanced', description: 'I can use Chinese in a wide range of situations.' },
] as const
export const difficulties = [
  { id: 'gentle', label: 'Gentle', description: 'Build confidence with a comfortable pace.' },
  { id: 'balanced', label: 'Balanced', description: 'A steady mix of review and new practice.' },
  { id: 'challenging', label: 'Challenging', description: 'I enjoy stretching my knowledge.' },
] as const
export const practicePreferences: { id: PracticeMode; label: string }[] = [
  { id: 'flashcards', label: 'Flashcards' }, { id: 'speech', label: 'Speaking' },
  { id: 'writing', label: 'Writing characters' }, { id: 'sentences', label: 'Sentence building' },
]
export const learningGoals = [
  { id: 'conversation', label: 'Everyday conversation' }, { id: 'travel', label: 'Travel' },
  { id: 'work', label: 'Work' }, { id: 'study', label: 'Study and exams' }, { id: 'culture', label: 'Culture and personal interest' },
] as const
export type LanguageLevel = typeof languageLevels[number]['id']
export type Difficulty = typeof difficulties[number]['id']
export type LearningGoal = typeof learningGoals[number]['id']
export type LearningProfileInput = {
  displayName: string; languageLevel: LanguageLevel; difficulty: Difficulty
  preferredModes: PracticeMode[]; learningGoals: LearningGoal[]; dailyGoal: number
}
export const profileColumns = 'id,email,display_name,role,created_at,language_level,difficulty,preferred_modes,learning_goals,daily_goal,onboarding_completed_at'

export function validLearningProfile(input: LearningProfileInput): boolean {
  return Boolean(input.displayName.trim()) && input.displayName.trim().length <= 80
    && languageLevels.some(({ id }) => id === input.languageLevel)
    && difficulties.some(({ id }) => id === input.difficulty)
    && input.preferredModes.length > 0 && input.preferredModes.length <= 4
    && input.preferredModes.every((mode) => practicePreferences.some(({ id }) => id === mode))
    && input.learningGoals.length > 0 && input.learningGoals.length <= 5
    && input.learningGoals.every((goal) => learningGoals.some(({ id }) => id === goal))
    && Number.isInteger(input.dailyGoal) && input.dailyGoal >= 1 && input.dailyGoal <= 100
}
export function profileInput(profile: UserProfile): LearningProfileInput {
  return {
    displayName: profile.display_name, languageLevel: profile.language_level ?? 'beginner',
    difficulty: profile.difficulty ?? 'balanced', preferredModes: [...(profile.preferred_modes ?? [])],
    learningGoals: [...(profile.learning_goals ?? [])], dailyGoal: profile.daily_goal ?? 10,
  }
}
export function hasCompletedOnboarding(profile: UserProfile): boolean {
  return Boolean(profile.onboarding_completed_at && Number.isFinite(Date.parse(profile.onboarding_completed_at))
    && profile.language_level && profile.difficulty && validLearningProfile(profileInput(profile)))
}
// Account settings are authoritative. Backups may merge history, never overwrite them.
export function applyAccountProfile(study: StudyData, profile: Pick<UserProfile, 'display_name' | 'daily_goal'>): StudyData {
  return { ...study, displayName: profile.display_name, dailyGoal: profile.daily_goal }
}

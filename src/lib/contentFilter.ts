import type { Difficulty, EducationalMetadata, LanguageLevel } from '../types/content'
import type { UserProfile } from '../types/auth'
export type ContentFilter = { languageLevel: LanguageLevel | 'all'; difficulty: Difficulty | 'all' }
export const allContent: ContentFilter = { languageLevel: 'all', difficulty: 'all' }
export function profileContentFilter(profile: Pick<UserProfile, 'language_level' | 'difficulty'>): ContentFilter {
  return { languageLevel: profile.language_level ?? 'beginner', difficulty: profile.difficulty ?? 'balanced' }
}
// An explicit "all" is a user override, not a missing preference.
export function resolveContentFilter(defaults: ContentFilter, overrides: { level?: ContentFilter['languageLevel']; difficulty?: ContentFilter['difficulty'] }): ContentFilter {
  return { languageLevel: overrides.level ?? defaults.languageLevel, difficulty: overrides.difficulty ?? defaults.difficulty }
}
export function matchesContent(content: EducationalMetadata, filter: ContentFilter): boolean {
  return (filter.languageLevel === 'all' || filter.languageLevel === content.languageLevel) && (filter.difficulty === 'all' || filter.difficulty === content.difficulty)
}

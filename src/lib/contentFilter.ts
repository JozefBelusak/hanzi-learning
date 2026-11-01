import type { Difficulty, EducationalMetadata, LanguageLevel } from '../types/content'
export type ContentFilter = { languageLevel: LanguageLevel | 'all'; difficulty: Difficulty | 'all' }
export const allContent: ContentFilter = { languageLevel: 'all', difficulty: 'all' }
export function matchesContent(content: EducationalMetadata, filter: ContentFilter): boolean {
  return (filter.languageLevel === 'all' || filter.languageLevel === content.languageLevel) && (filter.difficulty === 'all' || filter.difficulty === content.difficulty)
}

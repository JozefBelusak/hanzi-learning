import type { ContentTaxonomy, VocabularyEntry, WordCategoryId } from '../types/content'

// Stable identifiers already used by saved flashcard and speech attempts.
const legacyIds: Record<string, string> = { 我: 'wo', 好: 'hao', 水: 'shui' }
type HskWord = { id: string; simplified: string; pinyin: string; gloss_en: string; hsk2_level: number; traditional?: string; pos_en?: string }
export function isHskWord(value: unknown): value is HskWord {
  if (!value || typeof value !== 'object') return false
  const word = value as Record<string, unknown>
  return [word.id, word.simplified, word.pinyin, word.gloss_en].every((field) => typeof field === 'string' && field.trim().length > 0)
    && Number.isInteger(word.hsk2_level) && (word.hsk2_level as number) >= 1 && (word.hsk2_level as number) <= 6
}
export function wordCategory(hanzi: string, taxonomy: ContentTaxonomy): WordCategoryId {
  return taxonomy.categories.find((category) => category.id !== 'all' && category.words?.includes(hanzi))?.id as WordCategoryId ?? 'other'
}
export function normalizeVocabulary(data: unknown, taxonomy: ContentTaxonomy): VocabularyEntry[] {
  if (!data || typeof data !== 'object' || !('words' in data) || !Array.isArray(data.words)) throw new Error('The vocabulary dataset has an unexpected format.')
  const ids = new Set<string>()
  const cards = data.words.filter(isHskWord).filter((word) => taxonomy.vocabularySelection.hsk2Levels.includes(word.hsk2_level)).map((word) => {
    const hanzi = word.simplified.trim()
    const id = Object.hasOwn(legacyIds, hanzi) ? legacyIds[hanzi] : `hearmandarin:${word.id}`
    if (ids.has(id)) throw new Error('The vocabulary dataset contains duplicate identifiers.')
    ids.add(id)
    const languageLevel = taxonomy.vocabularySelection.levelMapping[String(word.hsk2_level)]
    if (!languageLevel) throw new Error(`No language level is configured for HSK 2.0 level ${word.hsk2_level}.`)
    return {
      id, hanzi, pinyin: word.pinyin.trim(), meaning: word.gloss_en.trim(), categoryId: wordCategory(hanzi, taxonomy),
      level: word.hsk2_level, languageLevel, difficulty: 'balanced' as const, sourceId: 'hearmandarin', sourceEntryId: word.id,
      ...(word.traditional ? { traditional: word.traditional } : {}), ...(word.pos_en ? { partOfSpeech: word.pos_en } : {}),
    }
  })
  if (!cards.length) throw new Error('The vocabulary dataset contains no words for the configured levels.')
  return cards
}

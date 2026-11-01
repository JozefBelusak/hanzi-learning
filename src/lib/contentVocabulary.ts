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
export function wordCategory(hanzi: string, taxonomy: ContentTaxonomy, meaning = '', partOfSpeech = ''): WordCategoryId {
  const curated = taxonomy.categories.find((category) => category.id !== 'all' && category.words?.includes(hanzi))
  if (curated) return curated.id as WordCategoryId
  // Editorial topic hints for the larger dictionary. Explicit assignments win;
  // ambiguous words remain in More words and expressions for later review.
  const topics: [WordCategoryId, RegExp][] = [
    ['people', /\b(family|mother|father|sister|brother|cousin|parent|grandmother|grandfather|husband|wife|colleague|teacher|student|doctor|nurse|manager|friend|neighbour|neighbor|employee|customer)\b/i],
    ['food', /\b(food|meal|rice|noodle|fruit|vegetable|tea|coffee|juice|bread|breakfast|lunch|dinner|restaurant|cook|cuisine|meat|fish|chicken|beef|pork|milk|sugar|salt)\b/i],
    ['numbers', /\b(number|numeral|quantity|percent|percentage|fraction|price|amount|count|multiply|divide|dozen)\b/i],
    ['time', /\b(weather|rain|snow|temperature|season|spring|summer|autumn|winter|yesterday|tomorrow|calendar|hour|minute|morning|afternoon|evening|week|month|year|duration|deadline)\b/i],
    ['places', /\b(travel|journey|transport|airport|station|train|bus|subway|metro|flight|airplane|road|street|avenue|hotel|city|village|country|province|border|district|hospital|school|university|library)\b/i],
    ['objects', /\b(animal|cat|dog|horse|bird|tiger|elephant|computer|phone|television|screen|keyboard|device|furniture|table|chair|clothing|shirt|trousers|shoe|jacket|tool|machine|battery|camera)\b/i],
  ]
  for (const [category, expression] of topics) if (expression.test(meaning)) return category
  if (/(^|;)\s*to\s/i.test(meaning) || /\bverb\b/i.test(partOfSpeech)) return 'actions'
  return 'other'
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
      id, hanzi, pinyin: word.pinyin.trim(), meaning: word.gloss_en.trim(), categoryId: wordCategory(hanzi, taxonomy, word.hsk2_level === 1 ? '' : word.gloss_en, word.hsk2_level === 1 ? '' : word.pos_en),
      level: word.hsk2_level, languageLevel, difficulty: 'balanced' as const, sourceId: 'hearmandarin', sourceEntryId: word.id,
      ...(word.traditional ? { traditional: word.traditional } : {}), ...(word.pos_en ? { partOfSpeech: word.pos_en } : {}),
    }
  })
  if (!cards.length) throw new Error('The vocabulary dataset contains no words for the configured levels.')
  return cards
}

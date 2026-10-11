import snapshot from '../data/vocabulary-hsk1.json'
import { categorizeWord } from '../data/categories'
import type { Card } from '../types/study'
import { readStoredString, writeStoredString } from './storage'

export const DATASET_URL = 'https://hearmandarin.com/datasets/hsk-3-0-words.json'
export const VOCABULARY_KEY = 'hanzi-learning-vocabulary-v2'
export const vocabularyInfo = {
  name: 'HearMandarin', url: 'https://hearmandarin.com/datasets/',
  license: 'CC BY 4.0', version: snapshot.version, selection: 'HSK 2.0 · Level 1',
}
const legacyIds: Record<string, string> = { 我: 'wo', 好: 'hao', 水: 'shui' }
type HskWord = { id: string; simplified: string; pinyin: string; gloss_en: string; hsk2_level: number }

function isHskWord(value: unknown): value is HskWord {
  if (!value || typeof value !== 'object') return false
  const word = value as Record<string, unknown>
  return [word.id, word.simplified, word.pinyin, word.gloss_en].every(
    (field) => typeof field === 'string' && field.trim().length > 0,
  ) && typeof word.hsk2_level === 'number'
}
export function parseVocabulary(data: unknown): Card[] {
  if (!data || typeof data !== 'object' || !('words' in data) || !Array.isArray(data.words)) {
    throw new Error('The vocabulary dataset has an unexpected format.')
  }
  const ids = new Set<string>()
  const cards = data.words.filter(isHskWord).filter((word) => word.hsk2_level === 1).map((word) => {
    const id = Object.hasOwn(legacyIds, word.simplified) ? legacyIds[word.simplified] : `hearmandarin:${word.id}`
    if (ids.has(id)) throw new Error('The vocabulary dataset contains duplicate identifiers.')
    ids.add(id)
    return { id, hanzi: word.simplified.trim(), pinyin: word.pinyin.trim(), meaning: word.gloss_en.trim(), categoryId: categorizeWord(word.simplified), level: 1 }
  })
  if (!cards.length) throw new Error('The vocabulary dataset contains no beginner words.')
  return cards
}
export const bundledVocabulary = parseVocabulary(snapshot)
function isCompatible(cards: Card[]): boolean {
  return cards.length === bundledVocabulary.length && cards.every((card) =>
    bundledVocabulary.some((original) => original.id === card.id && original.hanzi === card.hanzi),
  )
}
export async function loadVocabulary(signal?: AbortSignal): Promise<Card[]> {
  signal?.throwIfAborted()
  let saved: string | null = null
  try { saved = await readStoredString(VOCABULARY_KEY) } catch { /* Vocabulary can run from the bundled public snapshot. */ }
  signal?.throwIfAborted()
  if (saved) {
    try {
      const cached = parseVocabulary(JSON.parse(saved))
      if (isCompatible(cached)) return cached
    } catch { /* Recover from a damaged cache. */ }
  }
  return bundledVocabulary
}
export async function refreshVocabulary(signal?: AbortSignal): Promise<Card[]> {
  const response = await fetch(DATASET_URL, { signal })
  if (!response.ok) throw new Error('The vocabulary dataset could not be downloaded. Try again later.')
  const data: unknown = await response.json()
  const cards = parseVocabulary(data)
  if (!isCompatible(cards)) {
    throw new Error('The source word list has changed. Update the app to include the matching stroke data.')
  }
  signal?.throwIfAborted()
  const source = data as Record<string, unknown> & { words: unknown[] }
  const selected = { ...source, words: source.words.filter(isHskWord).filter((word) => word.hsk2_level === 1) }
  await writeStoredString(VOCABULARY_KEY, JSON.stringify(selected))
  return cards
}

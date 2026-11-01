import snapshot from '../data/vocabulary-hsk1.json'
import { catalog, getActiveCatalog, getServerRevision, installCatalog } from '../data/catalog'
import { taxonomy } from '../data/taxonomy'
import { isHskWord, normalizeVocabulary } from './contentVocabulary'
import type { Card } from '../types/study'
import { readStoredString, writeStoredString } from './storage'

export const DATASET_URL = 'https://hearmandarin.com/datasets/hsk-3-0-words.json'
export const VOCABULARY_KEY = 'hanzi-learning-vocabulary-v2'
export const vocabularyInfo = {
  name: 'HearMandarin', url: 'https://hearmandarin.com/datasets/',
  license: 'CC BY 4.0', version: snapshot.version, selection: `HSK 2.0 · Level ${taxonomy.vocabularySelection.hsk2Levels.join(', ')}`, wordCount: catalog.vocabulary.length,
}
export function parseVocabulary(data: unknown): Card[] { return normalizeVocabulary(data, taxonomy) }
const sourceVocabulary = parseVocabulary(snapshot)
const authoredVocabulary = catalog.vocabulary.filter((word) => !sourceVocabulary.some((original) => original.id === word.id))
export const bundledVocabulary = catalog.vocabulary
function isCompatible(cards: Card[]): boolean {
  return cards.length === sourceVocabulary.length && cards.every((card) =>
    sourceVocabulary.some((original) => original.id === card.id && original.hanzi === card.hanzi),
  )
}
export async function loadVocabulary(signal?: AbortSignal): Promise<Card[]> {
  signal?.throwIfAborted()
  if (getServerRevision() !== null) return getActiveCatalog().vocabulary.filter((word) => !word.archived)
  let saved: string | null = null
  try { saved = await readStoredString(VOCABULARY_KEY) } catch { /* Vocabulary can run from the bundled public snapshot. */ }
  signal?.throwIfAborted()
  if (saved) {
    try {
      const cached = parseVocabulary(JSON.parse(saved))
      if (isCompatible(cached)) return [...cached, ...authoredVocabulary]
    } catch { /* Recover from a damaged cache. */ }
  }
  return bundledVocabulary
}
export async function refreshVocabulary(signal?: AbortSignal): Promise<Card[]> {
  if (getServerRevision() !== null) {
    const { fetchPlatformCatalog } = await import('./contentApi')
    const result = await fetchPlatformCatalog(signal)
    if (!result) throw new Error('The published catalog is unavailable.')
    signal?.throwIfAborted()
    installCatalog(result.data, result.revision)
    return result.data.vocabulary.filter((word) => !word.archived)
  }
  const response = await fetch(DATASET_URL, { signal })
  if (!response.ok) throw new Error('The vocabulary dataset could not be downloaded. Try again later.')
  const data: unknown = await response.json()
  const cards = parseVocabulary(data)
  if (!isCompatible(cards)) {
    throw new Error('The source word list has changed. Update the app to include the matching stroke data.')
  }
  signal?.throwIfAborted()
  const source = data as Record<string, unknown> & { words: unknown[] }
  const selected = { ...source, words: source.words.filter(isHskWord).filter((word) => taxonomy.vocabularySelection.hsk2Levels.includes(word.hsk2_level)) }
  await writeStoredString(VOCABULARY_KEY, JSON.stringify(selected))
  return [...cards, ...authoredVocabulary]
}

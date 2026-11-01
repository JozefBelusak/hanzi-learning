import manifest from './content/manifest.json' with { type: 'json' }
import bundledActivities from './content/activities.json' with { type: 'json' }
import grammarTopics from './content/grammar.json' with { type: 'json' }
import sentences from './content/sentences.json' with { type: 'json' }
import extraWords from './content/vocabulary-extra.json' with { type: 'json' }
import sourceWords from './vocabulary-hsk1.json' with { type: 'json' }
import { taxonomy } from './taxonomy'
import { normalizeVocabulary } from '../lib/contentVocabulary'
import { parseContentCatalog } from '../lib/contentValidation'
import type { ContentCatalog, LearningActivity, PlatformActivity, SentenceExercise } from '../types/content'

export const catalog = parseContentCatalog({ ...manifest, taxonomy, activities: bundledActivities, grammarTopics, sentences, vocabulary: [...normalizeVocabulary(sourceWords, taxonomy), ...extraWords] })

export function createCatalogRepository(pack: ContentCatalog) {
  const vocabulary = new Map(pack.vocabulary.map((word) => [word.id, word]))
  const revisions = new Map(pack.activities.map((activity) => [`${activity.id}:${activity.revision}`, activity]))
  const latest = new Map<string, PlatformActivity>()
  for (const activity of pack.activities) if (!latest.has(activity.id) || latest.get(activity.id)!.revision < activity.revision) latest.set(activity.id, activity)
  const present = (activity: PlatformActivity): LearningActivity => ({ ...activity, practiceWords: activity.vocabularyIds.map((id) => vocabulary.get(id)!.hanzi) })
  const current = [...latest.values()].filter((activity) => activity.publication === 'published').map(present)
  return {
    activities: current,
    lessons: current.filter((activity) => activity.kind === 'lesson'),
    exercises: current.filter((activity) => activity.kind === 'exercise'),
    getActivity(id: string, revision?: number): LearningActivity | undefined {
      const activity = revision === undefined ? latest.get(id) : revisions.get(`${id}:${revision}`)
      return activity ? present(activity) : undefined
    },
    getGrammarTopic: (id: string) => pack.grammarTopics.find((topic) => topic.id === id),
    getVocabulary: (id: string) => vocabulary.get(id),
  }
}
let activeCatalog = catalog
let serverRevision: number | null = null
const listeners = new Set<() => void>()
export let contentRepository = createCatalogRepository(catalog)
export let activities = contentRepository.activities
export let lessons = contentRepository.lessons
export let exercises = contentRepository.exercises
export let sentenceExercises = buildSentences(catalog)
function buildSentences(pack: ContentCatalog): SentenceExercise[] {
  return pack.sentences.filter((item) => !item.archived).map((sentence) => {
    const grammar = pack.grammarTopics.find((topic) => topic.id === sentence.grammarTopicId)!
    return { ...sentence, grammarTitle: grammar.title, grammarNote: grammar.explanation }
  })
}
export const getActiveCatalog = () => activeCatalog
export const getServerRevision = () => serverRevision
export const getCatalogSnapshot = () => activeCatalog
export function subscribeCatalog(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback) } }
export const getActivity = (id: string, revision?: number) => contentRepository.getActivity(id, revision)
export const getGrammarTopic = (id: string) => contentRepository.getGrammarTopic(id)
export function installCatalog(value: unknown, revision: number | null) {
  const next = parseContentCatalog(value)
  // A stale browser build can still render every historical activity revision.
  for (const original of catalog.activities) {
    if (!next.activities.some((item) => item.id === original.id && item.revision === original.revision)) throw new Error('The published catalog is missing historical lessons. Please contact the administrator.')
  }
  activeCatalog = next; serverRevision = revision; contentRepository = createCatalogRepository(next)
  activities = contentRepository.activities; lessons = contentRepository.lessons; exercises = contentRepository.exercises
  sentenceExercises = buildSentences(next)
  listeners.forEach((callback) => callback())
}

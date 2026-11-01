import manifest from './content/manifest.json' with { type: 'json' }
import activities from './content/activities.json' with { type: 'json' }
import grammarTopics from './content/grammar.json' with { type: 'json' }
import sentences from './content/sentences.json' with { type: 'json' }
import extraWords from './content/vocabulary-extra.json' with { type: 'json' }
import sourceWords from './vocabulary-hsk1.json' with { type: 'json' }
import { taxonomy } from './taxonomy'
import { normalizeVocabulary } from '../lib/contentVocabulary'
import { parseContentCatalog } from '../lib/contentValidation'
import type { ContentCatalog, LearningActivity, PlatformActivity } from '../types/content'

export const catalog = parseContentCatalog({ ...manifest, taxonomy, activities, grammarTopics, sentences, vocabulary: [...normalizeVocabulary(sourceWords, taxonomy), ...extraWords] })

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
export const contentRepository = createCatalogRepository(catalog)

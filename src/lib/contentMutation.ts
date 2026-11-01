import type { ContentCatalog, GrammarTopic, LearningQuestion, PlatformActivity, SentenceContent, VocabularyEntry } from '../types/content'
import { parseContentCatalog } from './contentValidation'

export type ContentKind = 'lesson' | 'exercise' | 'grammar' | 'vocabulary' | 'sentence'
export type ContentEntity = PlatformActivity | GrammarTopic | VocabularyEntry | SentenceContent
export type CatalogSnapshot = { revision: number; data: ContentCatalog; updated_at: string }
export const contentKinds: ContentKind[] = ['lesson', 'exercise', 'grammar', 'vocabulary', 'sentence']
export function latestActivities(pack: ContentCatalog): PlatformActivity[] {
  const latest = new Map<string, PlatformActivity>()
  for (const item of pack.activities) if (!latest.has(item.id) || latest.get(item.id)!.revision < item.revision) latest.set(item.id, item)
  return [...latest.values()]
}
export function entitiesFor(pack: ContentCatalog, kind: ContentKind): ContentEntity[] {
  if (kind === 'lesson' || kind === 'exercise') return latestActivities(pack).filter((item) => item.kind === kind)
  return kind === 'grammar' ? pack.grammarTopics : kind === 'vocabulary' ? pack.vocabulary : pack.sentences
}
export const isArchived = (item: ContentEntity) => 'publication' in item ? item.publication === 'archived' : !!item.archived
export const entityTitle = (item: ContentEntity) => 'title' in item ? item.title : 'hanzi' in item ? `${item.hanzi} · ${item.meaning}` : item.meaning
export function newQuestion(): LearningQuestion { return { id: `question-${crypto.randomUUID().slice(0, 8)}`, type: 'choice', prompt: '', explanation: '', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }], answer: 'a' } }

export function applyContentMutation(pack: ContentCatalog, kind: ContentKind, id: string, payload: ContentEntity | null): ContentCatalog {
  if (!contentKinds.includes(kind) || !/^[a-z0-9][a-z0-9:_-]{0,159}$/.test(id)) throw new Error('Choose a valid content type and stable identifier.')
  const next = structuredClone(pack)
  const existing = entitiesFor(next, kind).find((item) => item.id === id)
  if (!payload && !existing) throw new Error('This content no longer exists. Reload the catalog.')
  const current = latestActivities(next).filter((item) => item.publication === 'published')
  if (!payload) {
    const used = kind === 'lesson' ? current.some((item) => item.id !== id && item.prerequisites.includes(id))
      : kind === 'grammar' ? current.some((item) => item.grammarTopicIds.includes(id)) || next.sentences.some((item) => !item.archived && item.grammarTopicId === id) || next.grammarTopics.some((item) => !item.archived && item.id !== id && item.prerequisites.includes(id))
      : kind === 'vocabulary' ? current.some((item) => item.vocabularyIds.includes(id)) || next.grammarTopics.some((item) => !item.archived && item.vocabularyIds?.includes(id)) : false
    if (used) throw new Error('This item is used by published content. Remove those links or archive the dependent content first.')
  }
  if (kind === 'lesson' || kind === 'exercise') {
    if (next.activities.some((item) => item.id === id && item.kind !== kind)) throw new Error('An existing activity cannot change its type.')
    const activity = { ...(payload ?? existing), id, kind, source: 'platform', revision: existing && 'revision' in existing ? existing.revision + 1 : 1, publication: payload ? 'published' : 'archived' } as PlatformActivity
    if (payload && (activity.vocabularyIds.some((ref) => next.vocabulary.find((item) => item.id === ref)?.archived) || activity.grammarTopicIds.some((ref) => next.grammarTopics.find((item) => item.id === ref)?.archived) || activity.prerequisites.some((ref) => latestActivities(next).find((item) => item.id === ref)?.publication === 'archived'))) throw new Error('Restore archived references before linking them to published content.')
    next.activities = next.activities.map((item) => item.id === id ? { ...item, publication: 'archived' } : item)
    next.activities.push(activity)
  } else if (kind === 'grammar') {
    const value = { ...(payload ?? existing), id, archived: !payload } as GrammarTopic
    if (payload && ((value.vocabularyIds ?? []).some((ref) => next.vocabulary.find((item) => item.id === ref)?.archived) || value.prerequisites.some((ref) => next.grammarTopics.find((item) => item.id === ref)?.archived))) throw new Error('Restore archived references before linking them to grammar.')
    next.grammarTopics = [...next.grammarTopics.filter((item) => item.id !== id), value]
  } else if (kind === 'vocabulary') {
    const value = { ...(payload ?? existing), id, archived: !payload } as VocabularyEntry
    if (existing && 'hanzi' in existing && existing.hanzi !== value.hanzi) throw new Error('Published characters cannot be reassigned to another word. Create a new word instead.')
    next.vocabulary = [...next.vocabulary.filter((item) => item.id !== id), value]
  } else {
    const value = { ...(payload ?? existing), id, archived: !payload } as SentenceContent
    if (payload && next.grammarTopics.find((item) => item.id === value.grammarTopicId)?.archived) throw new Error('Restore the grammar topic before using it in a sentence.')
    next.sentences = [...next.sentences.filter((item) => item.id !== id), value]
  }
  return parseContentCatalog(next)
}

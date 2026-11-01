import { describe, expect, it } from 'vitest'
import { catalog, contentRepository, createCatalogRepository } from '../data/catalog'
import legacy from '../../tests/fixtures/content-v1.json'
import { parseContentCatalog } from './contentValidation'
import { normalizeVocabulary } from './contentVocabulary'
import { activityStatus, sessionScore, validateLearningSession } from './learning'
import { emptyStudy, mergeLearningSessions, parseStudy } from './study'
import { allContent, matchesContent } from './contentFilter'
import type { LearningSession } from '../types/learning'

const timestamp = '2026-10-14T10:00:00.000Z'
describe('shared platform content catalog and legacy compatibility', () => {
  it('preserves every original word identity, activity/question ID, answer key and prerequisite', () => {
    for (const word of legacy.vocabulary) expect(contentRepository.getVocabulary(word.id)?.hanzi).toBe(word.hanzi)
    for (const old of legacy.activities) {
      const activity = contentRepository.getActivity(old.id, 1)!
      expect(activity.questions).toEqual(old.questions)
      expect(activity.prerequisites).toEqual(old.prerequisites)
      expect(activity.practiceWords).toEqual(old.practiceWords)
      const session: LearningSession = { id: `old-${old.id}`, activityId: old.id, startedAt: timestamp, updatedAt: timestamp, finishedAt: timestamp,
        answers: activity.questions.map((question) => ({ questionId: question.id, response: question.type === 'choice' ? [question.answer] : question.acceptedOrders[0], assisted: false })) }
      const restored = parseStudy(JSON.stringify({ ...emptyStudy(), learningSessions: [session] }))
      expect(restored.learningSessions![0].contentRevision).toBeUndefined()
      expect(activityStatus(activity, restored.learningSessions!)).toBe('completed')
      expect(sessionScore(activity, session).percent).toBe(100)
    }
  })

  it('adds lessons, grammar and authored vocabulary through data alone', () => {
    const next = structuredClone(catalog)
    const word = { ...next.vocabulary[0], id: 'platform:demo-word', hanzi: '明白', languageLevel: 'elementary' as const, sourceId: 'hanzi-original' }
    next.vocabulary.push(word)
    next.grammarTopics.push({ ...next.grammarTopics[0], id: 'grammar-demo', languageLevel: 'elementary' })
    next.activities.push({ ...next.activities[0], id: 'lesson-data-only', languageLevel: 'elementary', vocabularyIds: [word.id], grammarTopicIds: ['grammar-demo'], prerequisites: ['lesson-tones'] })
    const repository = createCatalogRepository(parseContentCatalog(next))
    expect(repository.lessons).toHaveLength(contentRepository.lessons.length + 1)
    expect(repository.getActivity('lesson-data-only')?.practiceWords).toEqual(['明白'])
    expect(matchesContent(repository.getActivity('lesson-data-only')!, { ...allContent, languageLevel: 'elementary' })).toBe(true)
    expect(repository.getGrammarTopic('grammar-demo')).toBeDefined()
  })

  it('separates proficiency levels from HSK source levels without changing stable IDs', () => {
    const taxonomy = structuredClone(catalog.taxonomy)
    taxonomy.vocabularySelection.hsk2Levels = [1, 2]
    const words = normalizeVocabulary({ words: [
      { id: 'first', simplified: '我', pinyin: 'wǒ', gloss_en: 'I', hsk2_level: 1 },
      { id: 'second', simplified: '明白', pinyin: 'míngbai', gloss_en: 'to understand', hsk2_level: 2 },
    ] }, taxonomy)
    expect(words[0]).toMatchObject({ id: 'wo', languageLevel: 'beginner', level: 1 })
    expect(words[1]).toMatchObject({ id: 'hearmandarin:second', languageLevel: 'elementary', level: 2, sourceEntryId: 'second' })
  })

  it('keeps archived revision 1 available when the active question bank changes', () => {
    const next = structuredClone(catalog)
    const first = next.activities[0]
    next.activities[0].publication = 'archived'
    const newer = { ...first, revision: 2, publication: 'published' as const, questions: [{ ...first.questions[0], id: 'replacement-question' }] }
    next.activities.push(newer)
    const repository = createCatalogRepository(parseContentCatalog(next))
    expect(repository.getActivity(first.id)?.revision).toBe(2)
    const original = repository.getActivity(first.id, 1)!
    expect(original.questions).toHaveLength(5)
    const session: LearningSession = { id: 'legacy-finished', activityId: first.id, startedAt: timestamp, updatedAt: timestamp, finishedAt: timestamp,
      answers: original.questions.map((q) => ({ questionId: q.id, response: q.type === 'choice' ? [q.answer] : q.acceptedOrders[0], assisted: false })) }
    expect(sessionScore(repository.getActivity(first.id)!, session)).toMatchObject({ correct: 5, total: 5, passed: true })
    expect(validateLearningSession({ ...session, contentRevision: 999 })).toBe(false)
    expect(validateLearningSession({ ...session, contentRevision: 0 })).toBe(false)
    expect(sessionScore(contentRepository.lessons[1], session).passed).toBe(false)
    expect(() => mergeLearningSessions([session, { ...session, contentRevision: 2 }])).toThrow(/conflicting/)
  })
})

describe('content authoring validation', () => {
  it('rejects unknown references, duplicate IDs, invalid levels and lecturer content in the platform catalog', () => {
    const invalid = [
      (data: typeof catalog) => { data.activities[0].vocabularyIds = ['missing-word'] },
      (data: typeof catalog) => { data.activities[0].grammarTopicIds = ['missing-grammar'] },
      (data: typeof catalog) => { data.sentences[0].grammarTopicId = 'missing-grammar' },
      (data: typeof catalog) => { data.vocabulary.push(data.vocabulary[0]) },
      (data: typeof catalog) => { data.activities.push(data.activities[0]) },
      (data: typeof catalog) => { Object.assign(data.activities[0], { languageLevel: 'expert' }) },
      (data: typeof catalog) => { Object.assign(data.activities[0], { source: 'lecturer' }) },
      (data: typeof catalog) => { Object.assign(data.activities[0], { difficulty: 'impossible' }) },
    ]
    for (const mutate of invalid) { const data = structuredClone(catalog); mutate(data); expect(() => parseContentCatalog(data)).toThrow(/Invalid educational content/) }
  })

  it('rejects prerequisite cycles, higher-level prerequisites and impossible answer keys', () => {
    const cyclic = structuredClone(catalog); cyclic.activities[0].prerequisites = [cyclic.activities[1].id]
    expect(() => parseContentCatalog(cyclic)).toThrow(/cycle/)
    const higher = structuredClone(catalog); higher.activities[0].languageLevel = 'advanced'
    expect(() => parseContentCatalog(higher)).toThrow(/higher language level/)
    const invalidChoice = structuredClone(catalog)
    Object.assign(invalidChoice.activities[0].questions[0], { answer: 'not-an-option' })
    expect(() => parseContentCatalog(invalidChoice)).toThrow(/existing option/)
    const invalidOrder = structuredClone(catalog)
    const order = invalidOrder.activities.flatMap((activity) => activity.questions).find((question) => question.type === 'order')!
    Object.assign(order, { acceptedOrders: [['我', '我', '我']] })
    expect(() => parseContentCatalog(invalidOrder)).toThrow(/every token occurrence/)
    const grammar = structuredClone(catalog); grammar.grammarTopics[0].prerequisites = [grammar.grammarTopics[0].id]
    expect(() => parseContentCatalog(grammar)).toThrow(/cycle/)
  })
})

import { describe, expect, it } from 'vitest'
import { catalog, createCatalogRepository } from '../data/catalog'
import { allContent, profileContentFilter, resolveContentFilter } from './contentFilter'
import { learningRecommendations } from './recommendations'
import type { LearningGoal } from './profile'
import type { GrammarTopic } from '../types/content'
import { parseRoute, routeHash } from './navigation'

const repository = createCatalogRepository(catalog)
const profile = { language_level: 'beginner' as const, difficulty: 'balanced' as const, learning_goals: ['travel' as const] }

describe('profile defaults and explicit catalog overrides', () => {
  it('applies both preferences and preserves independent all/individual overrides in every catalog URL', () => {
    const defaults = profileContentFilter({ language_level: 'advanced', difficulty: 'challenging' })
    expect(resolveContentFilter(defaults, {})).toEqual({ languageLevel: 'advanced', difficulty: 'challenging' })
    expect(resolveContentFilter(defaults, { difficulty: 'all' })).toEqual({ languageLevel: 'advanced', difficulty: 'all' })
    expect(resolveContentFilter(defaults, { level: 'all' })).toEqual({ languageLevel: 'all', difficulty: 'challenging' })
    for (const page of ['course', 'exercises', 'lessons'] as const) {
      for (const override of [{ level: 'all' as const, difficulty: 'all' as const }, { level: 'elementary' as const, difficulty: 'gentle' as const }, { difficulty: 'all' as const }]) {
        const route = parseRoute(routeHash({ page, ...override }))
        expect(route).toEqual({ page, ...override })
        if (route.page !== 'course' && route.page !== 'exercises' && route.page !== 'lessons') throw new Error('Expected a catalog route')
        expect(resolveContentFilter(defaults, route)).toEqual({ languageLevel: override.level ?? 'advanced', difficulty: override.difficulty })
      }
      expect(parseRoute(`#/${page}?level=expert&difficulty=impossible`)).toEqual({ page })
    }
    expect(profileContentFilter({ language_level: null, difficulty: null })).toEqual({ languageLevel: 'beginner', difficulty: 'balanced' })
    expect(resolveContentFilter(defaults, { level: 'all', difficulty: 'all' })).toEqual(allContent)
  })
})

describe('goal-based learning recommendations', () => {
  const goalExamples: Record<LearningGoal, string> = {
    conversation: 'Greeting a friend', travel: 'Finding the airport', work: 'Office project', study: 'Preparing for an exam', culture: 'Traditional festival',
  }
  const grammar: GrammarTopic[] = Object.keys(goalExamples).map((goal) => ({
    id: `grammar-${goal}`, title: 'A useful pattern', explanation: 'A reusable construction.', languageLevel: 'beginner', difficulty: 'balanced', examples: [], prerequisites: [],
  }))
  const candidates = {
    activities: Object.entries(goalExamples).map(([goal, text]) => ({ ...repository.exercises[0], id: `exercise-${goal}`, title: text, description: text, explanation: [text], objectives: [text], examples: [], category: 'all' as const, grammarTopicIds: [`grammar-${goal}`] })),
    grammarTopics: grammar,
    vocabulary: Object.entries(goalExamples).map(([goal, text]) => ({ ...catalog.vocabulary[0], id: `word-${goal}`, meaning: text, categoryId: 'other' as const })),
  }

  it('changes grammar, vocabulary and exercise ranking for each selected goal using text and existing grammar links', () => {
    const original = structuredClone(candidates)
    for (const goal of Object.keys(goalExamples) as LearningGoal[]) {
      const result = learningRecommendations({ ...profile, learning_goals: [goal] }, candidates)
      expect(result.grammar[0]).toMatchObject({ item: { id: `grammar-${goal}` }, goals: [goal] })
      expect(result.vocabulary[0]).toMatchObject({ item: { id: `word-${goal}` }, goals: [goal] })
      expect(result.exercises[0]).toMatchObject({ item: { id: `exercise-${goal}` }, goals: [goal] })
    }
    expect(candidates).toEqual(original)
  })

  it('keeps recommendations inside the chosen level/difficulty and omits archived content', () => {
    const result = learningRecommendations(profile, {
      activities: [...candidates.activities.map((item) => ({ ...item, publication: 'archived' as const })), { ...candidates.activities[1], id: 'other-level', languageLevel: 'advanced' }, { ...candidates.activities[1], id: 'other-difficulty', difficulty: 'gentle' }],
      grammarTopics: [...grammar.map((item) => ({ ...item, archived: true })), { ...grammar[0], id: 'other-level', languageLevel: 'advanced' }, { ...grammar[0], id: 'other-difficulty', difficulty: 'gentle' }],
      vocabulary: [...candidates.vocabulary.map((item) => ({ ...item, archived: true })), { ...candidates.vocabulary[0], id: 'other-level', languageLevel: 'advanced' }],
    })
    expect(result).toEqual({ grammar: [], vocabulary: [], exercises: [] })
  })

  it('combines multiple goals, distinguishes unmatched content and keeps words available for every activity difficulty', () => {
    const result = learningRecommendations({ ...profile, learning_goals: ['travel', 'study', 'travel'] }, candidates, 5)
    expect(new Set(result.exercises.slice(0, 2).map(({ item }) => item.id))).toEqual(new Set(['exercise-travel', 'exercise-study']))
    expect(result.exercises.find(({ item }) => item.id === 'exercise-work')!.goals).toEqual([])
    for (const difficulty of ['gentle', 'challenging'] as const) {
      const changed = learningRecommendations({ ...profile, difficulty }, candidates)
      expect(changed.exercises).toEqual([])
      expect(changed.grammar).toEqual([])
      expect(changed.vocabulary[0].item.id).toBe('word-travel')
      expect(changed.vocabulary[0].item.difficulty).toBe('balanced')
    }
  })

  it('uses the current published catalog, including administrator-added topics, without altering stored learning data', () => {
    const result = learningRecommendations(profile, { activities: repository.activities, grammarTopics: catalog.grammarTopics, vocabulary: catalog.vocabulary })
    expect(result.exercises[0].item.id).toBe('exercise-cafe')
    expect(result.exercises.every(({ item }) => item.languageLevel === 'beginner' && item.difficulty === 'balanced')).toBe(true)
    expect(result.grammar.every(({ item }) => item.languageLevel === 'beginner' && item.difficulty === 'balanced')).toBe(true)
    const added = { ...grammar[0], id: 'platform:travel-grammar', title: 'Airport travel directions', explanation: 'At the airport and train station.' }
    const updated = learningRecommendations(profile, { activities: [], grammarTopics: [added], vocabulary: [] })
    expect(updated.grammar[0]).toMatchObject({ item: { id: added.id }, goals: ['travel'] })
  })
})

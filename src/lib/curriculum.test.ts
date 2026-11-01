import { describe, expect, it } from 'vitest'
import { catalog, contentRepository } from '../data/catalog'
import { coursePaths } from '../data/coursePaths'
import { difficultyIds } from '../types/content'
import { activityStatus } from './learning'

describe('expanded vocabulary and independent course paths', () => {
  it('includes all six HSK 2.0 source levels with stable provider identities', () => {
    expect(catalog.vocabulary).toHaveLength(5000)
    expect([1, 2, 3, 4, 5, 6].map((level) => catalog.vocabulary.filter((word) => word.level === level).length))
      .toEqual([150, 150, 300, 600, 1300, 2500])
    expect(coursePaths.map((path) => catalog.vocabulary.filter((word) => word.languageLevel === path.level).length))
      .toEqual([150, 150, 900, 3800])
    // Same spelling does not mean the same dictionary entry or reading.
    expect(catalog.vocabulary.filter((word) => word.hanzi === '还').map((word) => word.pinyin).sort((a, b) => a.localeCompare(b))).toEqual(['hái', 'huán'])
  })

  it('offers lessons at every level/difficulty and starts each path independently', () => {
    for (const path of coursePaths) {
      const lessons = contentRepository.lessons.filter((lesson) => lesson.languageLevel === path.level)
      expect(lessons.length).toBeGreaterThanOrEqual(6)
      expect(activityStatus(lessons[0], [])).toBe('available')
      for (const difficulty of difficultyIds) expect(lessons.some((lesson) => lesson.difficulty === difficulty)).toBe(true)
      for (const lesson of lessons) {
        expect(lesson.questions).toHaveLength(5)
        for (const prerequisite of lesson.prerequisites) expect(contentRepository.getActivity(prerequisite)?.languageLevel).toBe(path.level)
      }
    }
    expect(contentRepository.lessons).toHaveLength(25)
    expect(contentRepository.exercises).toHaveLength(12)
    expect(catalog.grammarTopics).toHaveLength(32)
    expect(catalog.sentences).toHaveLength(19)
  })
})

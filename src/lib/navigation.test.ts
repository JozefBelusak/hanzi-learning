import { describe, expect, it } from 'vitest'
import { exercises, lessons } from '../data/learning'
import { parseRoute, routeHash } from './navigation'
import type { AppRoute } from './navigation'

describe('course, exercises and contextual practice routes', () => {
  it('round-trips new and existing hash routes without losing the learning context', () => {
    const lesson = lessons[0]
    const routes: AppRoute[] = [
      { page: 'course' }, { page: 'exercises' }, { page: 'onboarding' },
      { page: 'lesson', activityId: lesson.id },
      { page: 'exercise', activityId: exercises[0].id },
      { page: 'practice', category: lesson.category, mode: 'speech', activityId: lesson.id },
      { page: 'practice', category: 'food', mode: 'writing' },
      { page: 'modes', category: 'people' },
      { page: 'course', level: 'advanced', difficulty: 'challenging' },
      { page: 'course', level: 'all' },
      { page: 'topics', level: 'intermediate' },
      { page: 'modes', category: 'all', level: 'all' },
      { page: 'practice', category: 'all', mode: 'writing', level: 'advanced' },
    ]
    for (const route of routes) expect(parseRoute(routeHash(route))).toEqual(route)
  })

  it('ignores unsupported level and difficulty query parameters', () => {
    expect(parseRoute('#/course?level=expert&difficulty=impossible')).toEqual({ page: 'course' })
    expect(parseRoute('#/topics?level=expert')).toEqual({ page: 'topics' })
    expect(parseRoute('#/home?level=advanced')).toEqual({ page: 'home' })
  })

  it('rejects missing IDs, wrong activity kinds, invalid modes and mismatched practice context', () => {
    for (const hash of [
      '#/course/invalid%20id', `#/course/${exercises[0].id}`, `#/exercises/${lessons[0].id}`,
      '#/practice/food/wrong', `#/practice/food/speech/from/${lessons[0].id}`,
    ]) expect(parseRoute(hash)).toEqual({ page: 'home' })
  })
})

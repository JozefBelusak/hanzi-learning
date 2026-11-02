import { describe, expect, it } from 'vitest'
import { isGuestRoute, withoutGuest } from './guest'
import { parseRoute, routeHash, type AppRoute } from './navigation'
import { lessons } from '../data/learning'

describe('explicit guest routes', () => {
  it('round-trips public previews while keeping the return destination separate from authentication', () => {
    const routes: AppRoute[] = [
      { page: 'home', guest: true }, { page: 'course', level: 'all', guest: true },
      { page: 'course', level: 'advanced', difficulty: 'challenging', guest: true },
      { page: 'lesson', activityId: lessons[0].id, guest: true },
      { page: 'practice', category: 'food', mode: 'speech', level: 'intermediate', guest: true },
    ]
    for (const route of routes) {
      expect(parseRoute(routeHash(route))).toEqual(route)
      expect(isGuestRoute(route)).toBe(true)
      expect(isGuestRoute(withoutGuest(route))).toBe(false)
      expect(routeHash(withoutGuest(route))).not.toContain('/guest/')
    }
    expect(parseRoute('#/guest')).toEqual({ page: 'home', guest: true })
  })
  it('never treats account, classroom or management routes as guest access', () => {
    for (const page of ['admin', 'teach', 'classes', 'lessons', 'onboarding'] as const) {
      expect(isGuestRoute({ page, guest: true })).toBe(false)
      expect(parseRoute(`#/guest/${page}`).guest).toBeUndefined()
    }
    expect(parseRoute('#/course').guest).toBeUndefined()
  })
})

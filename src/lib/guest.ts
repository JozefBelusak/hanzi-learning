import type { AppRoute } from './navigation'

const previewPages = new Set(['home', 'course', 'exercises', 'topics', 'modes', 'lesson', 'exercise', 'practice', 'progress', 'settings'])
export function canBrowseAsGuest(page: string): boolean { return previewPages.has(page) }
export function isGuestRoute(route: AppRoute): boolean { return route.guest === true && canBrowseAsGuest(route.page) }
export function withoutGuest(route: AppRoute): AppRoute {
  const destination = { ...route }
  delete destination.guest
  return destination
}

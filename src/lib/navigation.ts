import { useSyncExternalStore } from 'react'
import { categories } from '../data/categories'
import { getActivity } from '../data/learning'
import type { CategoryId, PracticeMode } from '../types/study'

export type AppRoute =
  | { page: 'welcome' | 'home' | 'course' | 'exercises' | 'topics' | 'progress' | 'settings' }
  | { page: 'lesson'; activityId: string }
  | { page: 'exercise'; activityId: string }
  | { page: 'modes'; category: CategoryId }
  | { page: 'practice'; category: CategoryId; mode: PracticeMode; activityId?: string }

const modes: PracticeMode[] = ['flashcards', 'speech', 'writing', 'sentences']
const validCategory = (value: string): value is CategoryId => categories.some((category) => category.id === value)

export function parseRoute(hash: string): AppRoute {
  const parts = hash.replace(/^#\/?/, '').split('/')
  if (parts.length === 1 && ['welcome', 'home', 'course', 'exercises', 'topics', 'progress', 'settings'].includes(parts[0])) {
    return { page: parts[0] as 'welcome' | 'home' | 'course' | 'exercises' | 'topics' | 'progress' | 'settings' }
  }
  if (parts.length === 2 && (parts[0] === 'course' || parts[0] === 'exercises')) {
    const activity = getActivity(parts[1])
    if (activity && activity.kind === (parts[0] === 'course' ? 'lesson' : 'exercise')) {
      return { page: activity.kind === 'lesson' ? 'lesson' : 'exercise', activityId: activity.id }
    }
  }
  if (parts.length === 2 && parts[0] === 'topics' && validCategory(parts[1])) {
    return { page: 'modes', category: parts[1] }
  }
  if (parts.length === 3 && parts[0] === 'practice' && validCategory(parts[1]) && modes.includes(parts[2] as PracticeMode)) {
    return { page: 'practice', category: parts[1], mode: parts[2] as PracticeMode }
  }
  if (parts.length === 5 && parts[0] === 'practice' && validCategory(parts[1]) && modes.includes(parts[2] as PracticeMode) && parts[3] === 'from') {
    const activity = getActivity(parts[4])
    if (activity && activity.category === parts[1]) return { page: 'practice', category: parts[1], mode: parts[2] as PracticeMode, activityId: activity.id }
  }
  return { page: hash ? 'home' : 'welcome' }
}

export function routeHash(route: AppRoute): string {
  if (route.page === 'modes') return `#/topics/${route.category}`
  if (route.page === 'lesson') return `#/course/${route.activityId}`
  if (route.page === 'exercise') return `#/exercises/${route.activityId}`
  if (route.page === 'practice') return `#/practice/${route.category}/${route.mode}${route.activityId ? `/from/${route.activityId}` : ''}`
  return `#/${route.page}`
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  window.addEventListener('hashchange', onChange)
  window.addEventListener('hanzi:navigate', onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('hanzi:navigate', onChange)
  }
}

export function useNavigation() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '')
  const route = parseRoute(hash)
  function navigate(next: AppRoute, replace = false) {
    const target = routeHash(next)
    if (window.location.hash === target) return
    const state = { hanziFrom: window.location.hash }
    if (replace) window.history.replaceState(state, '', target)
    else window.history.pushState(state, '', target)
    window.dispatchEvent(new Event('hanzi:navigate'))
  }
  function back(parent: AppRoute) {
    if (window.history.state?.hanziFrom === routeHash(parent)) window.history.back()
    else navigate(parent, true)
  }
  return { route, navigate, back, hash }
}

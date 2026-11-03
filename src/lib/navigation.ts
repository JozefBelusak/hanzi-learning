import { useSyncExternalStore } from 'react'
import { categories } from '../data/categories'
import { getActivity } from '../data/learning'
import { languageLevelIds, difficultyIds, type LanguageLevel, type Difficulty } from '../types/content'
import type { CategoryId, PracticeMode } from '../types/study'
import { canBrowseAsGuest } from './guest'

type StaticPage = 'welcome' | 'login' | 'register' | 'onboarding' | 'home' | 'progress' | 'settings' | 'classes' | 'teach' | 'admin'
type BaseAppRoute =
  | { page: StaticPage }
  | { page: 'course' | 'exercises' | 'lessons'; level?: LanguageLevel | 'all'; difficulty?: Difficulty | 'all' }
  | { page: 'topics'; level?: LanguageLevel | 'all' }
  | { page: 'public-lesson'; lessonId: string }
  | { page: 'lesson'; activityId: string }
  | { page: 'exercise'; activityId: string }
  | { page: 'modes'; category: CategoryId; level?: LanguageLevel | 'all' }
  | { page: 'practice'; category: CategoryId; mode: PracticeMode; activityId?: string; level?: LanguageLevel | 'all' }
export type AppRoute = BaseAppRoute & { guest?: true }

const modes: PracticeMode[] = ['flashcards', 'speech', 'writing', 'sentences']
const validCategory = (value: string): value is CategoryId => categories.some((category) => category.id === value)

function parsePath(hash: string): AppRoute {
  const parts = hash.replace(/^#\/?/, '').split('/')
  if (parts.length === 1 && ['course', 'exercises', 'lessons', 'topics'].includes(parts[0])) return { page: parts[0] as 'course' | 'exercises' | 'lessons' | 'topics' }
  if (parts.length === 1 && ['welcome', 'login', 'register', 'onboarding', 'home', 'progress', 'settings', 'classes', 'teach', 'admin'].includes(parts[0])) {
    return { page: parts[0] as StaticPage }
  }
  if (parts.length === 2 && parts[0] === 'lessons' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[1])) return { page: 'public-lesson', lessonId: parts[1] }
  if (parts.length === 2 && (parts[0] === 'course' || parts[0] === 'exercises')) {
    const activity = getActivity(parts[1])
    const kind = parts[0] === 'course' ? 'lesson' : 'exercise'
    if ((!activity && /^[a-z0-9][a-z0-9:_-]{0,159}$/.test(parts[1])) || activity?.kind === kind) {
      return { page: kind, activityId: parts[1] }
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

function pathHash(route: AppRoute): string {
  if (route.page === 'public-lesson') return `#/lessons/${route.lessonId}`
  if (route.page === 'modes') return `#/topics/${route.category}`
  if (route.page === 'lesson') return `#/course/${route.activityId}`
  if (route.page === 'exercise') return `#/exercises/${route.activityId}`
  if (route.page === 'practice') return `#/practice/${route.category}/${route.mode}${route.activityId ? `/from/${route.activityId}` : ''}`
  return `#/${route.page}`
}

function parseNormalRoute(hash: string): AppRoute {
  const [path, query = ''] = hash.split('?')
  const route = parsePath(path)
  const params = new URLSearchParams(query)
  const level = params.get('level')
  if (route.page === 'course' || route.page === 'exercises' || route.page === 'lessons') {
    const difficulty = params.get('difficulty')
    return { ...route, ...(level === 'all' || languageLevelIds.includes(level as LanguageLevel) ? { level: level as LanguageLevel | 'all' } : {}), ...(difficulty === 'all' || difficultyIds.includes(difficulty as Difficulty) ? { difficulty: difficulty as Difficulty | 'all' } : {}) }
  }
  if (route.page === 'topics' || route.page === 'modes' || route.page === 'practice') {
    if (level === 'all' || languageLevelIds.includes(level as LanguageLevel)) return { ...route, level: level as LanguageLevel | 'all' }
  }
  return route
}
export function parseRoute(hash: string): AppRoute {
  if (!/^#\/guest(?=\/|\?|$)/.test(hash)) return parseNormalRoute(hash)
  const rest = hash.replace(/^#\/guest/, '')
  const route = parseNormalRoute(rest.startsWith('/') ? `#${rest}` : `#/home${rest}`)
  return canBrowseAsGuest(route.page) ? { ...route, guest: true } : route
}
export function routeHash(route: AppRoute): string {
  const params = new URLSearchParams()
  if ('level' in route && route.level) params.set('level', route.level)
  if ((route.page === 'course' || route.page === 'exercises' || route.page === 'lessons') && route.difficulty) params.set('difficulty', route.difficulty)
  const query = params.toString()
  const path = pathHash(route)
  return (route.guest && canBrowseAsGuest(route.page) ? path.replace(/^#\//, '#/guest/') : path) + (query ? `?${query}` : '')
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

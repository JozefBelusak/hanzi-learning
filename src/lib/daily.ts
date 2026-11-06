import { getActiveCatalog, contentRepository } from '../data/catalog'
import { activities } from '../data/learning'
import { sentences } from '../data/sentences'
import type { UserProfile } from '../types/auth'
import type { DailyRoute, DailyStop } from '../types/daily'
import type { StudyData } from '../types/study'
import { languageLevelIds, difficultyIds } from '../types/content'
import { activityStatus, getLatestSession, sessionScore } from './learning'
import { learningRecommendations } from './recommendations'
import { routePace } from './routePace'

export function localDay(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
export function dailyPreferenceKey(profile: UserProfile) {
  return JSON.stringify([profile.language_level ?? 'beginner', profile.difficulty ?? 'balanced', routePace(profile.daily_goal).id, [...profile.preferred_modes].sort(), [...profile.learning_goals].sort()])
}
export function todayRoutes(data: StudyData, now = new Date()) {
  return (data.dailyRoutes ?? []).filter((route) => route.day === localDay(now)).slice().sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}
export function currentDailyRoute(data: StudyData, now = new Date()) { return todayRoutes(data, now).at(-1) }
export function dailyStopProgress(route: DailyRoute, stop: DailyStop, data: StudyData) {
  const start = Date.parse(route.createdAt), end = Date.parse(route.expiresAt)
  if (stop.kind === 'activity') {
    const done = (data.learningSessions ?? []).some((session) => session.activityId === stop.activityId && !route.previousSessionIds.includes(session.id)
      && session.finishedAt && Date.parse(session.finishedAt) >= start && Date.parse(session.finishedAt) < end)
    return { done: Number(done), total: 1, complete: done, remainingIds: [] as string[] }
  }
  const attempted = new Set(data.attempts.filter((attempt) => attempt.mode === stop.mode && !route.boundaryAttemptIds.includes(attempt.id)
    && Date.parse(attempt.createdAt) >= start && Date.parse(attempt.createdAt) < end).map((attempt) => attempt.cardId))
  const remainingIds = stop.targetIds.filter((id) => !attempted.has(id))
  return { done: stop.targetIds.length - remainingIds.length, total: stop.targetIds.length, complete: remainingIds.length === 0, remainingIds }
}
export function dailyRouteProgress(route: DailyRoute, data: StudyData) {
  const done = route.stops.filter((stop) => dailyStopProgress(route,stop,data).complete).length
  return { done, total: route.stops.length, complete: done === route.stops.length }
}
export function dailyStopAvailable(stop: DailyStop, data: StudyData) {
  if (stop.kind === 'activity') {
    const current = contentRepository.getActivity(stop.activityId)
    return !!current && current.publication === 'published' && !!contentRepository.getActivity(stop.activityId,stop.revision)
      && activityStatus(current,data.learningSessions ?? []) !== 'locked'
  }
  if (stop.mode === 'sentences') return stop.targetIds.every((id) => sentences.some((sentence) => sentence.id === id))
  return stop.targetIds.every((id) => getActiveCatalog().vocabulary.some((word) => word.id === id && !word.archived))
}

export function buildDailyRoute(data: StudyData, profile: UserProfile, now = new Date()): DailyRoute | null {
  const catalog = getActiveCatalog()
  const level = profile.language_level ?? 'beginner', difficulty = profile.difficulty ?? 'balanced'
  const sessions = data.learningSessions ?? []
  const pace = routePace(profile.daily_goal)
  const recommendations = learningRecommendations(profile,{activities,grammarTopics:catalog.grammarTopics,vocabulary:catalog.vocabulary},catalog.vocabulary.length)
  const goalRanks = new Map(recommendations.vocabulary.map(({item},index) => [item.id,index]))
  const latestAttempts = new Map<string, StudyData['attempts'][number]>()
  const latestMode = new Map<string,string>()
  data.attempts.forEach((attempt) => {
    const key = `${attempt.mode}:${attempt.cardId}`, previous = latestAttempts.get(key)
    if (!previous || Date.parse(attempt.createdAt) >= Date.parse(previous.createdAt)) latestAttempts.set(key,attempt)
    if (Date.parse(attempt.createdAt) >= Date.parse(latestMode.get(attempt.mode) ?? '') || !latestMode.has(attempt.mode)) latestMode.set(attempt.mode,attempt.createdAt)
  })
  const reviewPriority = (id: string) => {
    const progress = data.progress[id]
    return progress ? (Date.parse(progress.dueAt) <= now.getTime() ? 2 : 0) : 1
  }
  const words = catalog.vocabulary.filter((word) => !word.archived && word.languageLevel === level).sort((a,b) => {
    const lastA = latestAttempts.get(`flashcards:${a.id}`), lastB = latestAttempts.get(`flashcards:${b.id}`)
    const weakA = Number(lastA?.correct === false), weakB = Number(lastB?.correct === false)
    return weakB - weakA || reviewPriority(b.id) - reviewPriority(a.id) || Number(Boolean(lastA)) - Number(Boolean(lastB))
      || (goalRanks.get(a.id) ?? 99999) - (goalRanks.get(b.id) ?? 99999) || a.id.localeCompare(b.id)
  })
  const stops: DailyStop[] = []
  const reviewWords = words.slice(0,pace.words)
  if (reviewWords.length) stops.push({ id:'review',kind:'practice',mode:'flashcards',title:'Word review',targetIds:reviewWords.map((word) => word.id),reason:reviewWords.some((word) => latestAttempts.get(`flashcards:${word.id}`)?.correct === false) ? 'Revisit words you recently found difficult.' : reviewWords.some((word) => data.progress[word.id] && Date.parse(data.progress[word.id].dueAt) <= now.getTime()) ? 'These words are due for another review.' : 'Words selected for your level and learning goals.' })
  const modes = [...new Set([...profile.preferred_modes.filter((mode) => mode !== 'flashcards'),'sentences','speech','writing'] as const)]
  // Least recently practised preferred skill first; ties rotate as history grows.
  modes.sort((a,b) => {
    return Number(profile.preferred_modes.includes(b)) - Number(profile.preferred_modes.includes(a)) || (latestMode.get(a) ?? '').localeCompare(latestMode.get(b) ?? '')
  })
  for (const mode of modes) {
    const candidates = mode === 'sentences' ? sentences.filter((item) => item.languageLevel === level && item.difficulty === difficulty).map((item) => item.id)
      : words.filter((word) => mode !== 'writing' || /^\p{Script=Han}$/u.test(word.hanzi)).map((word) => word.id)
    const byId = new Map(words.map((word) => [word.id,word])), characters = new Set<string>()
    const unique = mode === 'writing' ? candidates.filter((id) => { const hanzi = byId.get(id)!.hanzi; if (characters.has(hanzi)) return false; characters.add(hanzi); return true }) : candidates
    const ranked = unique.slice().sort((a,b) => {
      const first = latestAttempts.get(`${mode}:${a}`), second = latestAttempts.get(`${mode}:${b}`)
      return Number(second?.correct === false) - Number(first?.correct === false) || (first?.createdAt ?? '').localeCompare(second?.createdAt ?? '')
    }).slice(0,pace.practice)
    if (!ranked.length) continue
    stops.push({ id:'skill',kind:'practice',mode,targetIds:ranked,title:mode === 'sentences' ? 'Build a sentence' : mode === 'speech' ? 'Speaking practice' : 'Character writing',reason:profile.preferred_modes.includes(mode) ? 'A practice mode from your preferences, with new or difficult items.' : 'Add another skill to today’s route.' })
    break
  }
  const eligible = activities.filter((activity) => activity.languageLevel === level && activity.publication === 'published' && activityStatus(activity,sessions) !== 'locked')
  const unfinishedLessons = eligible.filter((activity) => activity.kind === 'lesson' && activityStatus(activity,sessions) !== 'completed')
  const preferredExercises = recommendations.exercises.map(({item}) => item).filter((item) => eligible.some((candidate) => candidate.id === item.id))
  const activity = unfinishedLessons.find((item) => activityStatus(item,sessions) === 'in-progress') ?? unfinishedLessons[0]
    ?? preferredExercises.find((item) => !getLatestSession(item.id,sessions)?.finishedAt) ?? preferredExercises.slice().sort((a,b) => {
      const lastA = getLatestSession(a.id,sessions)?.updatedAt ?? '', lastB = getLatestSession(b.id,sessions)?.updatedAt ?? ''
      return lastA.localeCompare(lastB)
    })[0]
  if (activity) {
    const previous = getLatestSession(activity.id,sessions)
    stops.push({id:'learn',kind:'activity',activityId:activity.id,revision:activity.revision,title:activity.title,reason:previous && !previous.finishedAt ? 'Continue your unfinished activity.' : previous && !sessionScore(activity,previous).passed ? 'Revisit this activity after an earlier review.' : activity.kind === 'lesson' ? 'The next available stop on your course path.' : 'An exercise matching your level, difficulty and learning goals.'})
  }
  if (!stops.length) return null
  const expires = new Date(now); expires.setHours(24,0,0,0)
  return { id:crypto.randomUUID(),day:localDay(now),createdAt:now.toISOString(),expiresAt:expires.toISOString(),preferenceKey:dailyPreferenceKey(profile),languageLevel:level,difficulty,
    boundaryAttemptIds:data.attempts.filter((attempt) => Date.parse(attempt.createdAt) >= now.getTime()).map((attempt) => attempt.id),
    previousSessionIds:sessions.filter((session) => session.finishedAt && Date.parse(session.finishedAt) >= now.getTime()).map((session) => session.id),stops }
}

function assert(condition: unknown): asserts condition { if (!condition) throw new Error('The backup contains invalid daily routes.') }
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9:_-]{0,199}$/.test(value)
export function parseDailyRoute(value: unknown): DailyRoute {
  assert(value && typeof value === 'object')
  const route = value as DailyRoute
  assert(id(route.id) && typeof route.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.day))
  assert(new Date(`${route.day}T00:00:00Z`).toISOString().slice(0,10) === route.day)
  assert(typeof route.createdAt === 'string' && typeof route.expiresAt === 'string' && Number.isFinite(Date.parse(route.createdAt)) && Number.isFinite(Date.parse(route.expiresAt)))
  assert(Date.parse(route.expiresAt) > Date.parse(route.createdAt) && Date.parse(route.expiresAt) - Date.parse(route.createdAt) <= 26*3600000)
  assert(languageLevelIds.includes(route.languageLevel) && difficultyIds.includes(route.difficulty) && typeof route.preferenceKey === 'string' && route.preferenceKey.length <= 1000)
  for (const list of [route.boundaryAttemptIds,route.previousSessionIds]) assert(Array.isArray(list) && list.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 200) && new Set(list).size === list.length)
  assert(Array.isArray(route.stops) && route.stops.length > 0 && route.stops.length <= 3 && route.stops.every((stop) => stop && typeof stop === 'object'))
  assert(new Set(route.stops.map((stop) => stop.id)).size === route.stops.length)
  for (const stop of route.stops) {
    assert(stop && id(stop.id) && typeof stop.title === 'string' && stop.title.length <= 500 && typeof stop.reason === 'string' && stop.reason.length <= 1000)
    if (stop.kind === 'activity') assert(id(stop.activityId) && Number.isInteger(stop.revision) && stop.revision > 0)
    else assert(stop.kind === 'practice' && ['flashcards','speech','writing','sentences'].includes(stop.mode) && Array.isArray(stop.targetIds) && stop.targetIds.length > 0 && stop.targetIds.length <= 7 && stop.targetIds.every(id) && new Set(stop.targetIds).size === stop.targetIds.length)
  }
  return route
}
export function mergeDailyRoutes(routes: DailyRoute[]) {
  const byId = new Map<string,DailyRoute>()
  for (const value of routes) {
    const route = parseDailyRoute(value), previous = byId.get(route.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(route)) throw new Error('The backup contains conflicting daily routes.')
    byId.set(route.id,route)
  }
  return [...byId.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

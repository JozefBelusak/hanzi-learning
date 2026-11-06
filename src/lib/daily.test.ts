import { describe, expect, it } from 'vitest'
import { getActiveCatalog, contentRepository } from '../data/catalog'
import { activityStatus } from './learning'
import { appendAttempt, emptyStudy, mergeStudy, parseStudy, studySummary } from './study'
import { applyAccountProfile } from './profile'
import { buildDailyRoute, currentDailyRoute, dailyPreferenceKey, dailyRouteProgress, dailyStopAvailable, dailyStopProgress, localDay, parseDailyRoute } from './daily'
import { routePace } from './routePace'
import type { UserProfile } from '../types/auth'
import type { DailyRoute, DailyStop } from '../types/daily'
import type { StudyAttempt, StudyData } from '../types/study'
import type { LearningSession } from '../types/learning'

const now = new Date(2026,10,6,10)
const after = new Date(now.getTime()+60000).toISOString()
const profile: UserProfile = { id:'student', email:'student@example.test', display_name:'Student', role:'student', created_at:now.toISOString(), onboarding_completed_at:now.toISOString(), language_level:'beginner', difficulty:'balanced', preferred_modes:['flashcards'], learning_goals:['conversation'], daily_goal:5 }
const plan = (data = emptyStudy(), overrides: Partial<UserProfile> = {}, date = now) => buildDailyRoute(data,{...profile,...overrides},date)!
function practice(route: DailyRoute, mode = 'flashcards') { return route.stops.find((stop) => stop.kind === 'practice' && stop.mode === mode)! as Extract<DailyStop,{kind:'practice'}> }
function attempt(cardId: string, overrides: Partial<StudyAttempt> = {}): StudyAttempt { return { id:crypto.randomUUID(),cardId,mode:'flashcards',input:'self',correct:true,createdAt:after,...overrides } }
function session(route: DailyRoute, overrides: Partial<LearningSession> = {}): LearningSession {
  const stop = route.stops.find((stop) => stop.kind === 'activity')! as Extract<DailyStop,{kind:'activity'}>
  const activity = contentRepository.getActivity(stop.activityId)!
  return { id:crypto.randomUUID(),activityId:activity.id,contentRevision:activity.revision,startedAt:now.toISOString(),updatedAt:after,finishedAt:after,
    answers:activity.questions.map((question) => ({questionId:question.id,assisted:false,response:question.type === 'choice' ? [question.answer] : question.acceptedOrders[0]})),...overrides }
}

describe('daily route planning', () => {
  it('selects concrete level-appropriate words, a skill and an unlocked course stop', () => {
    const route = plan(), words = practice(route)
    expect(words.targetIds).toHaveLength(3)
    expect(route.stops).toHaveLength(3)
    expect(route.stops.every((stop) => dailyStopAvailable(stop,emptyStudy()))).toBe(true)
    expect(words.targetIds.every((id) => contentRepository.getVocabulary(id)?.languageLevel === 'beginner')).toBe(true)
    const learning = route.stops.find((stop) => stop.kind === 'activity')!
    if (learning.kind !== 'activity') throw Error('Expected a learning activity')
    expect(activityStatus(contentRepository.getActivity(learning.activityId)!,[])).toBe('available')
    expect(dailyRouteProgress(route,emptyStudy())).toEqual({done:0,total:3,complete:false})
    expect(route.expiresAt).toBe(new Date(2026,10,7).toISOString())
  })
  it('uses workload ranges while preserving existing account settings and history', () => {
    expect([1,5,7,15,16,100].map((value) => routePace(value).id)).toEqual(['short','short','regular','regular','extended','extended'])
    const data = appendAttempt(emptyStudy(),attempt('wo'))
    expect(applyAccountProfile(data,{display_name:'Student',daily_goal:7})).toMatchObject({dailyGoal:7,attempts:data.attempts,progress:data.progress})
    expect(practice(plan(data,{daily_goal:7})).targetIds).toHaveLength(5)
    expect(practice(plan(data,{daily_goal:100})).targetIds).toHaveLength(7)
  })
  it('prioritizes failed words, then due or unseen words; new sections use latest results', () => {
    const route = plan(), review = practice(route)
    let data = emptyStudy()
    review.targetIds.forEach((id,index) => { data = appendAttempt(data,attempt(id,{correct:index !== 0,rating:index === 0 ? 'again' : 'good'})) })
    const next = plan(data,{},new Date(Date.parse(after)+1))
    expect(practice(next).targetIds[0]).toBe(review.targetIds[0])
    expect(practice(next).targetIds).not.toContain(review.targetIds[1])
    expect(practice(next).reason).toContain('difficult')
    expect(dailyStopProgress(next,practice(next),data).done).toBe(0)
  })
  it('selects overdue successful reviews before unseen words, without changing their schedule', () => {
    const word = getActiveCatalog().vocabulary.filter((word) => word.languageLevel === 'beginner').at(-1)!
    const data = appendAttempt(emptyStudy(),attempt(word.id,{createdAt:new Date(now.getTime()-2*86400000).toISOString()}))
    const before = JSON.stringify(data.progress)
    const stop = practice(plan(data))
    expect(stop.targetIds[0]).toBe(word.id)
    expect(stop.reason).toContain('due')
    expect(JSON.stringify(data.progress)).toBe(before)
  })
  it('uses preferred skills and unique single characters for writing', () => {
    const route = plan(emptyStudy(),{preferred_modes:['writing'],daily_goal:20})
    const stop = practice(route,'writing')
    const glyphs = stop.targetIds.map((id) => contentRepository.getVocabulary(id)!.hanzi)
    expect(glyphs.length).toBeGreaterThan(0)
    expect(glyphs.every((text) => /^\p{Script=Han}$/u.test(text))).toBe(true)
    expect(new Set(glyphs).size).toBe(glyphs.length)
    const speech = practice(plan(emptyStudy(),{preferred_modes:['speech']}),'speech')
    expect(speech.targetIds.length).toBeGreaterThan(0)
  })
  it('applies each language level and goal preferences without changing previous plans', () => {
    for (const language_level of ['beginner','elementary','intermediate','advanced'] as const) {
      const route = plan(emptyStudy(),{language_level,difficulty:'challenging'})
      expect(route.languageLevel).toBe(language_level)
      expect(route.difficulty).toBe('challenging')
      expect(practice(route).targetIds.every((id) => contentRepository.getVocabulary(id)?.languageLevel === language_level)).toBe(true)
    }
    const first = plan(), snapshot = JSON.stringify(first)
    const second = plan(emptyStudy(),{learning_goals:['travel'],difficulty:'gentle'})
    expect(practice(second).targetIds).not.toEqual(practice(first).targetIds)
    expect(second.preferenceKey).not.toBe(first.preferenceKey)
    expect(JSON.stringify(first)).toBe(snapshot)
    expect(dailyPreferenceKey({...profile,preferred_modes:['speech','writing']})).toBe(dailyPreferenceKey({...profile,preferred_modes:['writing','speech']}))
  })
  it('resumes unfinished lessons and recommends the next prerequisite only after passing', () => {
    const route = plan(), finished = session(route)
    const inProgress = {...finished,finishedAt:undefined,answers:finished.answers.slice(0,1)}
    const resumed = plan({...emptyStudy(),learningSessions:[inProgress]})
    expect(resumed.stops.find((stop) => stop.kind === 'activity')).toMatchObject({activityId:finished.activityId,reason:'Continue your unfinished activity.'})
    const next = plan({...emptyStudy(),learningSessions:[finished]}, {},new Date(Date.parse(after)+1))
    const learning = next.stops.find((stop) => stop.kind === 'activity')!
    expect(learning).not.toMatchObject({activityId:finished.activityId})
    if (learning.kind === 'activity') expect(activityStatus(contentRepository.getActivity(learning.activityId)!,[finished])).toBe('available')
    const failed = {...finished,answers:finished.answers.map((answer) => ({...answer,assisted:true}))}
    expect(plan({...emptyStudy(),learningSessions:[failed]}).stops.find((stop) => stop.kind === 'activity')).toMatchObject({activityId:finished.activityId})
  })
})

describe('daily completion from existing histories', () => {
  it('counts distinct matching work, including free practice, without demanding a perfect score', () => {
    const route = plan(), stop = practice(route)
    const data = {...emptyStudy(),attempts:[attempt(stop.targetIds[0],{correct:false}),attempt(stop.targetIds[0]),attempt('unrelated'),attempt(stop.targetIds[1],{mode:'speech',input:'manual'})]}
    expect(dailyStopProgress(route,stop,data)).toMatchObject({done:1,total:3,complete:false,remainingIds:stop.targetIds.slice(1)})
    stop.targetIds.slice(1).forEach((id) => data.attempts.push(attempt(id,{assisted:true})))
    expect(dailyStopProgress(route,stop,data).complete).toBe(true)
    expect(dailyRouteProgress(route,data).done).toBe(1)
  })
  it('counts typed speaking and guided writing as participation, preserving independent accuracy', () => {
    for (const mode of ['speech','writing'] as const) {
      const route = plan(emptyStudy(),{preferred_modes:[mode]}), stop = practice(route,mode)
      const attempts = stop.targetIds.map((id) => attempt(id,{mode,input:mode === 'speech' ? 'manual' : 'writing',assisted:mode === 'writing'}))
      expect(dailyStopProgress(route,stop,{...emptyStudy(),attempts}).complete).toBe(true)
      expect(studySummary(attempts,now).accuracy).toBeNull()
    }
  })
  it('excludes earlier work, repeat-boundary records and work after midnight', () => {
    const route = plan(), stop = practice(route), id = stop.targetIds[0]
    const earlier = attempt(id,{createdAt:new Date(now.getTime()-1).toISOString()})
    const boundary = attempt(id,{createdAt:now.toISOString()})
    const atExpiry = attempt(id,{createdAt:route.expiresAt})
    const data = {...emptyStudy(),attempts:[earlier,boundary,atExpiry]}
    const fresh = plan(data)
    expect(dailyStopProgress(fresh,practice(fresh),data).done).toBe(0)
    expect(currentDailyRoute({...data,dailyRoutes:[route]},new Date(2026,10,7))).toBeUndefined()
    expect(localDay(now)).toBe('2026-11-06')
  })
  it('counts a resumed course finish after planning, but never an already finished session', () => {
    const route = plan(), learning = route.stops.find((stop) => stop.kind === 'activity')!
    const completed = session(route)
    expect(dailyStopProgress(route,learning,{...emptyStudy(),learningSessions:[completed]}).complete).toBe(true)
    const atBoundary = {...completed,finishedAt:now.toISOString(),updatedAt:now.toISOString()}
    const again = plan({...emptyStudy(),learningSessions:[{...atBoundary,answers:atBoundary.answers.map((answer) => ({...answer,assisted:true}))}]})
    const repeatedStop = again.stops.find((stop) => stop.kind === 'activity')!
    expect(dailyStopProgress(again,repeatedStop,{...emptyStudy(),learningSessions:[atBoundary]}).complete).toBe(false)
    expect(studySummary([],new Date(after),[completed])).toMatchObject({streak:1,todayCount:0,accuracy:null})
  })
})

describe('backward-compatible daily route persistence', () => {
  it('preserves old backups and merges new snapshots once without losing review schedules', () => {
    const legacy = appendAttempt(emptyStudy(),attempt('wo'))
    expect(parseStudy(JSON.stringify(legacy))).toEqual(legacy)
    const data: StudyData = {...legacy,dailyRoutes:[plan(legacy)]}
    const restored = parseStudy(JSON.stringify(data))
    expect(restored).toEqual(data)
    expect(mergeStudy(restored,data)).toEqual(data)
    expect(mergeStudy(legacy,data).progress).toEqual(legacy.progress)
    expect(mergeStudy(data,legacy).dailyRoutes).toEqual(data.dailyRoutes)
    expect(() => mergeStudy(data,{...data,dailyRoutes:[{...data.dailyRoutes![0],difficulty:'gentle'}]})).toThrow('conflicting')
  })
  it('retains historical targets when content is missing, but prevents starting them', () => {
    const route = plan(), missing: DailyStop = {id:'missing',kind:'practice',mode:'speech',targetIds:['archived-word'],title:'Old word',reason:'Historical plan'}
    const snapshot = {...route,stops:[missing]}
    expect(parseDailyRoute(snapshot)).toEqual(snapshot)
    expect(dailyStopAvailable(missing,emptyStudy())).toBe(false)
    expect(getActiveCatalog().vocabulary.length).toBeGreaterThan(0)
  })
  it('rejects malformed dates, stops, duplicates and unsupported modes', () => {
    const route = plan()
    for (const patch of [{day:'2026-02-31'},{createdAt:42},{expiresAt:route.createdAt},{stops:[null]},{stops:[route.stops[0],route.stops[0]]},{stops:[{...practice(route),targetIds:['same','same']}]},{stops:[{...practice(route),mode:'magic'}]},{stops:[]}]) {
      expect(() => parseStudy(JSON.stringify({...emptyStudy(),dailyRoutes:[{...route,...patch}]}))).toThrow()
    }
  })
})

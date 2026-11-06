import { useEffect, useMemo, useState } from 'react'
import type { AttemptInput, StudyData } from '../types/study'
import type { LearningSession } from '../types/learning'
import { appendAttempt, createAttempt, emptyStudy, mergeStudy, parseStudy, saveLearningSession } from './study'
import { loadStudyData, saveStudyData } from './storage'
import { applyAccountProfile } from './profile'
import type { UserProfile } from '../types/auth'
import { buildDailyRoute, currentDailyRoute, dailyPreferenceKey, dailyRouteProgress, dailyStopAvailable } from './daily'

export function useStudy(profile: UserProfile) {
  const userId = profile.id
  const [stored, setData] = useState<StudyData>(emptyStudy)
  const { display_name, daily_goal } = profile
  const data = useMemo(() => applyAccountProfile(stored, { display_name, daily_goal }), [stored, display_name, daily_goal])
  const [ready, setReady] = useState(false)
  const [storageWritable, setStorageWritable] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    loadStudyData(userId).then((saved) => { if (active) { setData(saved); setStorageWritable(true); setReady(true) } }).catch(() => {
      if (active) { setStorageError('Your saved progress could not be loaded. Export your new results as a backup.'); setReady(true) }
    })
    return () => { active = false }
  }, [userId])
  useEffect(() => {
    if (!ready || !storageWritable) return
    let active = true
    saveStudyData(data, userId).then(() => { if (active) setStorageError(null) }).catch(() => {
      if (active) setStorageError('Your progress is available for this session, but could not be saved. Export a backup.')
    })
    return () => { active = false }
  }, [data, ready, storageWritable, userId])
  function recordAttempt(input: AttemptInput) {
    const attempt = createAttempt(input)
    setData((previous) => appendAttempt(previous, attempt))
  }
  function recordLearningSession(session: LearningSession) {
    setData((previous) => saveLearningSession(previous, session))
  }
  function startDailyRoute(nextSection = false) {
    const now = new Date()
    const previous = currentDailyRoute(data,now)
    if (previous && !nextSection) return true
    if (previous && !dailyRouteProgress(previous,data).complete && previous.preferenceKey === dailyPreferenceKey(profile) && previous.stops.every((stop) => dailyStopAvailable(stop,data))) return false
    const route = buildDailyRoute(data,profile,now)
    if (!route) return false
    setData((stored) => {
      // A second click cannot append a duplicate section from a stale render.
      if (currentDailyRoute(stored,now)?.id !== previous?.id) return stored
      return { ...stored, dailyRoutes: [...(stored.dailyRoutes ?? []),route] }
    })
    return true
  }
  function importBackup(raw: string) {
    const imported = parseStudy(raw)
    // Validate cross-device conflicts inside the caller's import error handler.
    const merged = applyAccountProfile(mergeStudy(data, imported), profile)
    setData(merged)
    return merged
  }
  return { data, ready, storageError, recordAttempt, recordLearningSession, startDailyRoute, importBackup }
}

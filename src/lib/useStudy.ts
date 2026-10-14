import { useEffect, useState } from 'react'
import type { AttemptInput, StudyData } from '../types/study'
import type { LearningSession } from '../types/learning'
import { appendAttempt, createAttempt, emptyStudy, mergeStudy, parseStudy, saveLearningSession } from './study'
import { loadStudyData, saveStudyData } from './storage'

export function useStudy() {
  const [data, setData] = useState<StudyData>(emptyStudy)
  const [ready, setReady] = useState(false)
  const [storageWritable, setStorageWritable] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    loadStudyData().then((saved) => { if (active) { setData(saved); setStorageWritable(true); setReady(true) } }).catch(() => {
      if (active) { setStorageError('Your saved progress could not be loaded. Export your new results as a backup.'); setReady(true) }
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!ready || !storageWritable) return
    let active = true
    saveStudyData(data).then(() => { if (active) setStorageError(null) }).catch(() => {
      if (active) setStorageError('Your progress is available for this session, but could not be saved. Export a backup.')
    })
    return () => { active = false }
  }, [data, ready, storageWritable])
  function recordAttempt(input: AttemptInput) {
    const attempt = createAttempt(input)
    setData((previous) => appendAttempt(previous, attempt))
  }
  function updateProfile(displayName: string, dailyGoal: number) {
    if (!Number.isFinite(dailyGoal)) return
    setData((previous) => ({ ...previous, displayName: displayName.trim().slice(0, 60), dailyGoal: Math.max(1, Math.min(100, Math.round(dailyGoal))) }))
  }
  function recordLearningSession(session: LearningSession) {
    setData((previous) => saveLearningSession(previous, session))
  }
  function importBackup(raw: string) {
    const imported = parseStudy(raw)
    // Validate cross-device conflicts inside the caller's import error handler.
    const merged = mergeStudy(data, imported)
    setData(merged)
    return imported
  }
  return { data, ready, storageError, recordAttempt, recordLearningSession, updateProfile, importBackup }
}

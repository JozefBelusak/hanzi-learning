import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { StudyAttempt, StudyData } from '../types/study'
import { appendAttempt, emptyStudy, parseStudy } from './study'

export const STUDY_KEY = 'hanzi-learning-study-v1'
export async function readStoredString(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) return (await Preferences.get({ key })).value
  return localStorage.getItem(key)
}
export async function writeStoredString(key: string, value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Preferences.set({ key, value })
  else localStorage.setItem(key, value)
}
export async function removeStoredString(key: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Preferences.remove({ key })
  else localStorage.removeItem(key)
}
export function studyKey(userId?: string): string { return userId ? `${STUDY_KEY}:${userId}` : STUDY_KEY }
function legacyArray(key: string): unknown[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
export function migrateLegacy(): StudyData {
  const attempts: StudyAttempt[] = []
  for (const [mode, key] of [['flashcards', 'hanzi-flashcard-attempts'], ['speech', 'hanzi-speech-attempts']] as const) {
    legacyArray(key).forEach((value, index) => {
      if (!value || typeof value !== 'object') return
      const old = value as Record<string, unknown>
      if (typeof old.cardId !== 'string' || typeof old.createdAt !== 'string' || !Number.isFinite(Date.parse(old.createdAt))) return
      const correct = mode === 'speech' ? old.matched : old.correct
      if (typeof correct !== 'boolean') return
      attempts.push({ id: `legacy:${mode}:${index}:${old.createdAt}`, cardId: old.cardId, mode, correct, createdAt: old.createdAt, input: mode === 'speech' ? 'recognition' : 'self', ...(typeof old.recognizedText === 'string' ? { responseText: old.recognizedText } : {}) })
    })
  }
  return attempts.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).reduce(appendAttempt, emptyStudy())
}
export async function loadStudyData(userId?: string): Promise<StudyData> {
  const key = studyKey(userId)
  const saved = await readStoredString(key)
  if (!saved) return userId ? emptyStudy() : migrateLegacy()
  try { return parseStudy(saved) } catch {
    await writeStoredString(`${key}-recovery`, saved)
    return userId ? emptyStudy() : migrateLegacy()
  }
}
let saveQueue = Promise.resolve()
export function saveStudyData(data: StudyData, userId?: string): Promise<void> {
  const value = JSON.stringify(data)
  const next = saveQueue.catch(() => undefined).then(() => writeStoredString(studyKey(userId), value))
  saveQueue = next
  return next
}
export async function exportStudyData(data: StudyData): Promise<void> {
  const filename = `hanzi-progress-${new Date().toISOString().slice(0, 10)}.json`
  const value = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({ path: filename, data: value, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: 'Hanzi progress', files: [result.uri] })
    return
  }
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

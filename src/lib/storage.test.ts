import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyStudy } from './study'

const native = vi.hoisted(() => ({
  enabled: false,
  get: vi.fn(), set: vi.fn(), remove: vi.fn(), writeFile: vi.fn(), share: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.enabled } }))
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: native.get, set: native.set, remove: native.remove } }))
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: native.writeFile }, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }))
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }))

import {
  exportStudyData, loadStudyData, migrateLegacy,
  readStoredString, removeStoredString, saveStudyData, STUDY_KEY, writeStoredString,
} from './storage'

let values: Map<string, string>
let localGet: ReturnType<typeof vi.fn>
let localSet: ReturnType<typeof vi.fn>

beforeEach(() => {
  native.enabled = false
  vi.clearAllMocks()
  native.get.mockReset().mockResolvedValue({ value: null })
  native.set.mockReset().mockResolvedValue(undefined)
  native.remove.mockReset().mockResolvedValue(undefined)
  native.writeFile.mockReset().mockResolvedValue({ uri: 'file:///cache/hanzi.json' })
  native.share.mockReset().mockResolvedValue(undefined)
  values = new Map()
  localGet = vi.fn((key: string) => values.get(key) ?? null)
  localSet = vi.fn((key: string, value: string) => { values.set(key, value) })
  vi.stubGlobal('localStorage', { getItem: localGet, setItem: localSet, removeItem: (key: string) => values.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())

describe('storage compatibility and recovery', () => {
  it('removes only the session key on web and uses Preferences.remove on Android', async () => {
    await writeStoredString('hanzi-auth-session-v1', 'session')
    await writeStoredString(`${STUDY_KEY}:student`, 'progress')
    await removeStoredString('hanzi-auth-session-v1')
    expect(await readStoredString('hanzi-auth-session-v1')).toBeNull()
    expect(await readStoredString(`${STUDY_KEY}:student`)).toBe('progress')
    native.enabled = true
    await removeStoredString('hanzi-auth-session-v1')
    expect(native.remove).toHaveBeenCalledWith({ key: 'hanzi-auth-session-v1' })
  })
  it('uses browser storage on web and Preferences on native devices', async () => {
    await writeStoredString('test', 'web value')
    expect(await readStoredString('test')).toBe('web value')
    expect(native.set).not.toHaveBeenCalled()
    native.enabled = true
    native.get.mockResolvedValue({ value: 'native value' })
    expect(await readStoredString('test')).toBe('native value')
    await writeStoredString('test', 'native value')
    expect(native.set).toHaveBeenCalledWith({ key: 'test', value: 'native value' })
  })

  it('migrates valid legacy histories deterministically and skips malformed entries', () => {
    values.set('hanzi-flashcard-attempts', JSON.stringify([
      { cardId: 'wo', correct: true, createdAt: '2026-10-09T10:00:00Z' },
      { cardId: 'bad', correct: true, createdAt: 'invalid' },
      null,
    ]))
    values.set('hanzi-speech-attempts', JSON.stringify([
      { cardId: 'shui', matched: false, recognizedText: '我', createdAt: '2026-10-08T10:00:00Z' },
    ]))
    const migrated = migrateLegacy()
    expect(migrated.attempts).toHaveLength(2)
    expect(migrated.attempts[0]).toMatchObject({ cardId: 'shui', mode: 'speech', correct: false, responseText: '我' })
    expect(migrated.progress.wo.repetitions).toBe(1)
    expect(migrateLegacy().attempts.map((item) => item.id)).toEqual(migrated.attempts.map((item) => item.id))
  })

  it('preserves a damaged saved file for recovery before falling back to legacy history', async () => {
    values.set(STUDY_KEY, '{broken JSON')
    expect(await loadStudyData()).toEqual(emptyStudy())
    expect(values.get(`${STUDY_KEY}-recovery`)).toBe('{broken JSON')
  })

  it('propagates read failure instead of silently treating inaccessible progress as empty', async () => {
    localGet.mockImplementation(() => { throw new Error('storage denied') })
    await expect(loadStudyData()).rejects.toThrow('storage denied')
    expect(localSet).not.toHaveBeenCalled()
  })
  it('keeps each account’s progress separate and does not automatically claim earlier anonymous progress', async () => {
    values.set(STUDY_KEY, JSON.stringify({ ...emptyStudy(), displayName: 'Anonymous history' }))
    await saveStudyData({ ...emptyStudy(), displayName: 'Student A' }, 'account-a')
    await saveStudyData({ ...emptyStudy(), displayName: 'Student B' }, 'account-b')
    expect((await loadStudyData('account-a')).displayName).toBe('Student A')
    expect((await loadStudyData('account-b')).displayName).toBe('Student B')
    expect(await loadStudyData('new-account')).toEqual(emptyStudy())
    expect((await loadStudyData()).displayName).toBe('Anonymous history')
  })
})

describe('serialized native writes and backups', () => {
  it('serializes asynchronous saves so an older state cannot overwrite a newer state', async () => {
    native.enabled = true
    let releaseFirst: (() => void) | undefined
    native.set.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve }))
    const first = saveStudyData({ ...emptyStudy(), displayName: 'first' })
    const second = saveStudyData({ ...emptyStudy(), displayName: 'second' })
    await vi.waitFor(() => expect(native.set).toHaveBeenCalledTimes(1))
    releaseFirst!()
    await Promise.all([first, second])
    expect(native.set.mock.calls.map(([entry]) => JSON.parse(entry.value).displayName)).toEqual(['first', 'second'])
  })

  it('allows a later save to recover after one queued write failed', async () => {
    native.enabled = true
    native.set.mockRejectedValueOnce(new Error('temporarily unavailable'))
    const results = await Promise.allSettled([
      saveStudyData({ ...emptyStudy(), displayName: 'failed' }),
      saveStudyData({ ...emptyStudy(), displayName: 'recovered' }),
    ])
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled'])
    expect(JSON.parse(native.set.mock.calls[1][0].value).displayName).toBe('recovered')
  })

  it('exports native progress as a real cache file shared by its URI', async () => {
    native.enabled = true
    await exportStudyData({ ...emptyStudy(), displayName: 'Jožko' })
    expect(native.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      directory: 'CACHE', encoding: 'utf8', path: expect.stringMatching(/^hanzi-progress-.*\.json$/),
    }))
    expect(JSON.parse(native.writeFile.mock.calls[0][0].data)).toMatchObject({ version: 1, displayName: 'Jožko' })
    expect(native.share).toHaveBeenCalledWith({ title: 'Hanzi progress', files: ['file:///cache/hanzi.json'] })
  })
})

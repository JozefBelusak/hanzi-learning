import { beforeEach, expect, it, vi } from 'vitest'
import snapshot from '../data/vocabulary-hsk.json'

const storage = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('./storage', () => ({ readStoredString: storage.read, writeStoredString: storage.write }))
vi.mock('../data/content/vocabulary-extra.json', () => ({ default: [{ id: 'platform:hello', hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', categoryId: 'other', level: 1, sourceId: 'hanzi-original', languageLevel: 'beginner', difficulty: 'gentle' }] }))
import { bundledVocabulary, loadVocabulary, refreshVocabulary } from './vocabulary'

beforeEach(() => { storage.read.mockReset().mockResolvedValue(null); storage.write.mockReset().mockResolvedValue(undefined) })
it('keeps authored words through a public dataset refresh and device-cache reload', async () => {
  expect(bundledVocabulary.find((word) => word.id === 'platform:hello')).toBeDefined()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }))
  try {
    expect((await refreshVocabulary()).find((word) => word.id === 'platform:hello')?.meaning).toBe('hello')
    storage.read.mockResolvedValue(storage.write.mock.calls[0][1])
    expect((await loadVocabulary()).find((word) => word.id === 'platform:hello')?.difficulty).toBe('gentle')
  } finally { vi.unstubAllGlobals() }
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import snapshot from '../data/vocabulary-hsk1.json'

const storage = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('./storage', () => ({ readStoredString: storage.read, writeStoredString: storage.write }))
import { bundledVocabulary, loadVocabulary, parseVocabulary, refreshVocabulary, VOCABULARY_KEY } from './vocabulary'

beforeEach(() => {
  storage.read.mockReset().mockResolvedValue(null)
  storage.write.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('public vocabulary normalization', () => {
  it('preserves the starter card IDs and includes only HSK 1 words', () => {
    const words = [
      { id: '1', simplified: '我', pinyin: ' wǒ ', gloss_en: ' I ', hsk2_level: 1 },
      { id: '2', simplified: '好', pinyin: 'hǎo', gloss_en: 'good', hsk2_level: 1 },
      { id: '3', simplified: '水', pinyin: 'shuǐ', gloss_en: 'water', hsk2_level: 1 },
      { id: '4', simplified: '高级', pinyin: 'gāojí', gloss_en: 'advanced', hsk2_level: 4 },
      { id: '5', simplified: '坏', pinyin: '', gloss_en: 'bad', hsk2_level: 1 },
    ]
    const result = parseVocabulary({ words })
    expect(result.map((card) => card.id)).toEqual(['wo', 'hao', 'shui'])
    expect(result[0]).toMatchObject({ pinyin: 'wǒ', meaning: 'I', categoryId: 'people', level: 1 })
    expect(result[2].categoryId).toBe('food')
    expect(bundledVocabulary).toHaveLength(150)
  })

  it('rejects invalid datasets and duplicate IDs instead of creating conflicting progress keys', () => {
    expect(() => parseVocabulary(null)).toThrow()
    expect(() => parseVocabulary({ words: [] })).toThrow()
    expect(() => parseVocabulary({ words: [snapshot.words[0], snapshot.words[0]] })).toThrow(/duplicate/)
  })
})

describe('offline vocabulary and explicit refresh', () => {
  it('uses the public bundled snapshot on the first launch without making a network request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await loadVocabulary()).toEqual(bundledVocabulary)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('recovers from denied, corrupted or incompatible cache and honors aborts', async () => {
    storage.read.mockRejectedValueOnce(new Error('denied'))
    expect(await loadVocabulary()).toEqual(bundledVocabulary)
    storage.read.mockResolvedValueOnce('{broken')
    expect(await loadVocabulary()).toEqual(bundledVocabulary)
    storage.read.mockResolvedValueOnce(JSON.stringify({ ...snapshot, words: snapshot.words.slice(1) }))
    expect(await loadVocabulary()).toEqual(bundledVocabulary)
    const controller = new AbortController()
    controller.abort()
    await expect(loadVocabulary(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('accepts edited glosses for the same IDs and caches only the starter subset', async () => {
    const updated = structuredClone(snapshot)
    updated.words[0].gloss_en = 'updated teaching gloss'
    const extra = { ...updated.words[0], id: 'advanced-only', simplified: '高级', hsk2_level: 4 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...updated, words: [...updated.words, extra] }) }))
    const cards = await refreshVocabulary()
    expect(cards[0].meaning).toBe('updated teaching gloss')
    const [key, raw] = storage.write.mock.calls[0]
    expect(key).toBe(VOCABULARY_KEY)
    expect(JSON.parse(raw).words).toHaveLength(150)
    storage.read.mockResolvedValue(raw)
    expect((await loadVocabulary())[0].meaning).toBe('updated teaching gloss')
  })

  it('refuses changed character identities or a partial list before replacing the cache', async () => {
    const changed = structuredClone(snapshot)
    changed.words[0].simplified = '另一个词'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => changed }))
    await expect(refreshVocabulary()).rejects.toThrow(/word list has changed/)
    expect(storage.write).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...snapshot, words: snapshot.words.slice(1) }) }))
    await expect(refreshVocabulary()).rejects.toThrow(/word list has changed/)
    expect(storage.write).not.toHaveBeenCalled()
  })

  it('does not replace cached data after an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    await expect(refreshVocabulary()).rejects.toThrow(/downloaded/)
    expect(storage.write).not.toHaveBeenCalled()
  })
})

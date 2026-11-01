import { describe, expect, it, vi } from 'vitest'
import type { Card } from '../types/study'
import { loadStrokeData, writingCharacters } from './writing'
import snapshot from '../data/vocabulary-hsk.json'

const words: Card[] = [
  { id: 'hello', hanzi: '你好！', pinyin: 'nǐ hǎo', meaning: 'ahoj', categoryId: 'people', level: 1, languageLevel: 'beginner', difficulty: 'balanced', sourceId: 'hanzi-original' },
  { id: 'good', hanzi: '好', pinyin: 'hǎo', meaning: 'dobrý', categoryId: 'other', level: 1, languageLevel: 'beginner', difficulty: 'balanced', sourceId: 'hanzi-original' },
  { id: 'me', hanzi: '我', pinyin: 'wǒ', meaning: 'ja', categoryId: 'people', level: 1, languageLevel: 'beginner', difficulty: 'balanced', sourceId: 'hanzi-original' },
]

describe('writing characters', () => {
  it('extracts unique characters in vocabulary order and retains the source word', () => {
    const characters = writingCharacters(words)
    expect(characters.map((item) => item.character)).toEqual(['你', '好', '我'])
    expect(characters[1].card.id).toBe('hello')
  })

  it('handles empty groups and ignores punctuation, numbers, and Latin text', () => {
    expect(writingCharacters([])).toEqual([])
    expect(writingCharacters([{ ...words[0], hanzi: 'hello 123！？' }])).toEqual([])
  })

  it('treats supplementary Unicode Han as a single character', () => {
    expect(writingCharacters([{ ...words[0], hanzi: '𠀀𠀀' }]).map((item) => item.character)).toEqual(['𠀀'])
  })
})

describe('offline stroke data', () => {
  it('loads a real, bundled character with matching strokes and trajectories', async () => {
    const data = await loadStrokeData('我')
    expect(data.strokes).toHaveLength(7)
    expect(data.medians).toHaveLength(data.strokes.length)
    expect(data.medians.every((points) => points.length >= 2)).toBe(true)
  })

  it('reports missing data instead of substituting or grading another character', async () => {
    await expect(loadStrokeData('not-a-character')).rejects.toThrow('single Chinese character')
  })

  it('loads and validates additional admin-created characters from the pinned public data source', async () => {
    const valid = await loadStrokeData('我')
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => valid })
    vi.stubGlobal('fetch', fetch)
    try {
      expect(await loadStrokeData('龘')).toEqual(valid)
      expect(fetch.mock.calls[0][0]).toContain('hanzi-writer-data@2.0.1/')
      fetch.mockResolvedValueOnce({ ok: false })
      await expect(loadStrokeData('龘')).rejects.toThrow('No stroke template')
      fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ strokes: ['bad'], medians: [] }) })
      await expect(loadStrokeData('龘')).rejects.toThrow('invalid')
    } finally { vi.unstubAllGlobals() }
  })

  it('includes valid offline trajectories for every Hanzi in the original beginner vocabulary', async () => {
    const characters: string[] = Array.from(new Set<string>(snapshot.words.filter((word) => word.hsk2_level === 1).flatMap((word) =>
      [...word.simplified].filter((character: string) => /\p{Script=Han}/u.test(character)),
    )))
    expect(characters.length).toBeGreaterThan(100)
    const data = await Promise.all(characters.map(loadStrokeData))
    expect(data).toHaveLength(characters.length)
  })
})

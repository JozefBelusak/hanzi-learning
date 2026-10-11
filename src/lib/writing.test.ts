import { describe, expect, it } from 'vitest'
import type { Card } from '../types/study'
import { loadStrokeData, writingCharacters } from './writing'
import snapshot from '../data/vocabulary-hsk1.json'

const words: Card[] = [
  { id: 'hello', hanzi: '你好！', pinyin: 'nǐ hǎo', meaning: 'ahoj', categoryId: 'people', level: 1 },
  { id: 'good', hanzi: '好', pinyin: 'hǎo', meaning: 'dobrý', categoryId: 'other', level: 1 },
  { id: 'me', hanzi: '我', pinyin: 'wǒ', meaning: 'ja', categoryId: 'people', level: 1 },
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
    await expect(loadStrokeData('not-a-character')).rejects.toThrow('No stroke template')
  })

  it('includes valid offline trajectories for every Hanzi in the starter vocabulary', async () => {
    const characters = Array.from(new Set(snapshot.words.flatMap((word) =>
      Array.from(word.simplified).filter((character) => /\p{Script=Han}/u.test(character)),
    )))
    expect(characters.length).toBeGreaterThan(100)
    const data = await Promise.all(characters.map(loadStrokeData))
    expect(data).toHaveLength(characters.length)
  })
})

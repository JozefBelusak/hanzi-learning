import { describe, expect, it } from 'vitest'
import { sentences } from '../data/sentences'
import {
  createSentenceTokens,
  isSentenceOrderCorrect,
  sentenceText,
  shuffleSentenceTokens,
} from './sentences'

describe('sentence ordering', () => {
  it('recognizes the target order and rejects a complete but incorrect order', () => {
    const exercise = sentences[0]
    const tokens = createSentenceTokens(exercise)
    const orderedIds = tokens.map((token) => token.id)

    expect(isSentenceOrderCorrect(exercise, tokens, orderedIds)).toBe(true)
    expect(isSentenceOrderCorrect(exercise, tokens, [...orderedIds].reverse())).toBe(false)
  })

  it('accepts both valid positions of the time phrase', () => {
    const exercise = sentences.find((sentence) => sentence.id === 'sentence-today-study')!
    const tokens = createSentenceTokens(exercise)

    expect(isSentenceOrderCorrect(exercise, tokens, tokens.map((token) => token.id))).toBe(true)
    expect(
      isSentenceOrderCorrect(exercise, tokens, [tokens[1].id, tokens[0].id, tokens[2].id, tokens[3].id]),
    ).toBe(true)
    expect(
      isSentenceOrderCorrect(exercise, tokens, [tokens[0].id, tokens[2].id, tokens[1].id, tokens[3].id]),
    ).toBe(false)
  })

  it('keeps identical words distinct while allowing their physical tokens to be swapped', () => {
    const exercise = sentences.find((sentence) => sentence.id === 'sentence-family-tea')!
    const tokens = createSentenceTokens(exercise)
    const indicesWithIdenticalWordsSwapped = [0, 6, 7, 3, 4, 5, 1, 2]
    const selected = indicesWithIdenticalWordsSwapped.map((index) => tokens[index].id)

    expect(new Set(tokens.map((token) => token.id)).size).toBe(tokens.length)
    expect(isSentenceOrderCorrect(exercise, tokens, selected)).toBe(true)
    expect(sentenceText(tokens, selected)).toBe('我喜欢茶，爸爸也喜欢茶')
  })

  it('rejects incomplete selections, reused token IDs and unknown token IDs', () => {
    const exercise = sentences[0]
    const tokens = createSentenceTokens(exercise)

    expect(isSentenceOrderCorrect(exercise, tokens, [tokens[0].id])).toBe(false)
    expect(isSentenceOrderCorrect(exercise, tokens, [tokens[0].id, tokens[0].id, tokens[2].id])).toBe(false)
    expect(isSentenceOrderCorrect(exercise, tokens, [tokens[0].id, tokens[1].id, 'missing'])).toBe(false)
  })

  it('shuffles without mutating or losing the supplied tokens', () => {
    const tokens = createSentenceTokens(sentences[0])
    const originalIds = tokens.map((token) => token.id)
    const shuffled = shuffleSentenceTokens(tokens, () => 0)

    expect(tokens.map((token) => token.id)).toEqual(originalIds)
    expect(shuffled.map((token) => token.id).sort()).toEqual([...originalIds].sort())
    expect(shuffled.map((token) => token.id)).not.toEqual(originalIds)
  })

  it('does not reveal the target order even when random swaps leave it unchanged', () => {
    const tokens = createSentenceTokens(sentences[0])
    const shuffled = shuffleSentenceTokens(tokens, () => 0.999)

    expect(shuffled.map((token) => token.text)).not.toEqual(tokens.map((token) => token.text))
  })

  it('all hand-written accepted variants use precisely the target token inventory', () => {
    for (const exercise of sentences) {
      for (const variant of exercise.acceptedOrders ?? []) {
        expect([...variant].sort()).toEqual([...exercise.tokens].sort())
      }
    }
  })
})

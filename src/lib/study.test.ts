import { describe, expect, it } from 'vitest'
import type { Card, StudyAttempt } from '../types/study'
import {
  appendAttempt,
  dayKey,
  dueCards,
  emptyStudy,
  isStudyAttempt,
  mergeStudy,
  nextReviewCard,
  parseStudy,
  scheduleReview,
  studySummary,
} from './study'

const date = '2026-10-09T10:00:00.000Z'
const attempt = (overrides: Partial<StudyAttempt> = {}): StudyAttempt => ({
  id: 'attempt-1', cardId: 'wo', mode: 'flashcards', correct: true,
  input: 'self', createdAt: date, ...overrides,
})
const cards: Card[] = ['wo', 'hao', 'shui'].map((id) => ({
  id, hanzi: id, pinyin: id, meaning: id, categoryId: 'other', level: 1,
}))

describe('review scheduling and attempt history', () => {
  it('increases successful review intervals, caps them, and resets failures to ten minutes', () => {
    let progress = scheduleReview(undefined, true, date)
    expect(progress).toMatchObject({ repetitions: 1, intervalDays: 1, dueAt: '2026-10-10T10:00:00.000Z' })
    for (const intervalDays of [3, 7, 14, 30, 30]) {
      progress = scheduleReview(progress, true, date)
      expect(progress.intervalDays).toBe(intervalDays)
    }
    const failed = scheduleReview(progress, false, date)
    expect(failed).toMatchObject({ repetitions: 0, intervalDays: 0, dueAt: '2026-10-09T10:10:00.000Z' })
    expect(scheduleReview(failed, true, date).intervalDays).toBe(1)
  })

  it('gives new cards four distinct review times and preserves ratings in the history', () => {
    const expectations = [
      { rating: 'again', correct: false, repetitions: 0, intervalDays: 0, dueAt: '2026-10-09T10:10:00.000Z' },
      { rating: 'hard', correct: true, repetitions: 1, intervalDays: 0.5, dueAt: '2026-10-09T22:00:00.000Z' },
      { rating: 'good', correct: true, repetitions: 1, intervalDays: 1, dueAt: '2026-10-10T10:00:00.000Z' },
      { rating: 'easy', correct: true, repetitions: 2, intervalDays: 3, dueAt: '2026-10-12T10:00:00.000Z' },
    ] as const
    for (const { rating, correct, ...expected } of expectations) {
      const state = appendAttempt(emptyStudy(), attempt({ rating, correct }))
      expect(state.progress.wo).toMatchObject({ cardId: 'wo', ...expected })
      expect(state.attempts[0].rating).toBe(rating)
      expect(parseStudy(JSON.stringify(state)).progress.wo).toEqual(state.progress.wo)
    }
  })

  it('holds hard answers at their step, skips one step for easy and caps review intervals', () => {
    let progress = scheduleReview(undefined, true, date, 'easy')
    const hard = scheduleReview(progress, true, date, 'hard')
    expect(hard).toMatchObject({ repetitions: 2, intervalDays: 1.5, dueAt: '2026-10-10T22:00:00.000Z' })
    expect(scheduleReview(hard, true, date, 'hard')).toMatchObject({ repetitions: 2, intervalDays: 1.5 })
    expect(scheduleReview(hard, true, date, 'good')).toMatchObject({ repetitions: 3, intervalDays: 7 })
    expect(scheduleReview(hard, true, date, 'easy')).toMatchObject({ repetitions: 4, intervalDays: 14 })
    for (let index = 0; index < 10; index++) progress = scheduleReview(progress, true, date, 'easy')
    expect(progress.intervalDays).toBe(30)
    expect(scheduleReview(progress, true, date, 'hard').intervalDays).toBe(15)
    expect(scheduleReview(progress, false, date, 'again')).toMatchObject({ repetitions: 0, intervalDays: 0 })
  })

  it('replays mixed old boolean history and rated history without changing older intervals', () => {
    const restored = parseStudy(JSON.stringify({
      ...emptyStudy(),
      attempts: [
        attempt(),
        attempt({ id: 'old-failure', correct: false, createdAt: '2026-10-09T11:00:00Z' }),
        attempt({ id: 'new-easy', rating: 'easy', createdAt: '2026-10-09T11:10:00Z' }),
        attempt({ id: 'old-success', createdAt: '2026-10-12T11:10:00Z' }),
      ],
    }))
    expect(restored.progress.wo).toMatchObject({
      repetitions: 3, intervalDays: 7, dueAt: '2026-10-19T11:10:00.000Z',
    })
    expect(restored.attempts[0]).not.toHaveProperty('rating')
    expect(scheduleReview(undefined, true, date)).toEqual(scheduleReview(undefined, true, date, 'good'))
    expect(scheduleReview(undefined, false, date)).toEqual(scheduleReview(undefined, false, date, 'again'))
  })

  it('does not duplicate an imported attempt or alter flashcard scheduling for other modes', () => {
    const first = appendAttempt(emptyStudy(), attempt())
    expect(appendAttempt(first, attempt())).toBe(first)
    const guided = appendAttempt(first, attempt({ id: 'guided', assisted: true, correct: false }))
    const speech = appendAttempt(guided, attempt({ id: 'speech', mode: 'speech', input: 'recognition', correct: false }))
    expect(speech.progress).toEqual(first.progress)
    expect(speech.attempts).toHaveLength(3)
    expect(emptyStudy().progress).toEqual({})
  })

  it('finds new and overdue cards, skips future reviews and avoids repeating the current card', () => {
    const state = appendAttempt(emptyStudy(), attempt())
    expect(dueCards(cards, state.progress, Date.parse(date)).map((card) => card.id)).toEqual(['hao', 'shui'])
    expect(nextReviewCard(cards, state.progress, 'hao')?.id).toBe('shui')
    expect(nextReviewCard([cards[0]], state.progress, 'wo')?.id).toBe('wo')
    expect(nextReviewCard([], state.progress)).toBeUndefined()
    expect(dueCards(cards, state.progress, Date.parse('2026-10-10T10:00:00Z'))).toHaveLength(3)
  })
})

describe('progress summaries', () => {
  it('counts guided and manual practice toward activity but excludes them from accuracy', () => {
    const now = new Date(2026, 9, 9, 12)
    const sameDay = now.toISOString()
    const summary = studySummary([
      attempt({ createdAt: sameDay }),
      attempt({ id: 'wrong', correct: false, createdAt: sameDay }),
      attempt({ id: 'manual', mode: 'speech', input: 'manual', cardId: 'shui', createdAt: sameDay }),
      attempt({ id: 'hint', mode: 'sentences', input: 'sentence', cardId: 'sentence-1', assisted: true, createdAt: sameDay }),
    ], now)
    expect(summary).toMatchObject({ todayCount: 4, streak: 1, accuracy: 50, practiced: 2 })
    expect(studySummary([attempt({ assisted: true })], now).accuracy).toBeNull()
  })

  it('keeps a streak from yesterday until today is practiced and stops at a missing local day', () => {
    const now = new Date(2026, 9, 9, 12)
    const onDay = (day: number) => attempt({ id: String(day), createdAt: new Date(2026, 9, day, 12).toISOString() })
    expect(studySummary([onDay(8), onDay(7), onDay(5)], now)).toMatchObject({ todayCount: 0, streak: 2 })
    expect(studySummary([onDay(9), onDay(8), onDay(6)], now).streak).toBe(2)
    expect(dayKey(new Date(2026, 0, 2))).toBe('2026-01-02')
  })
})

describe('backup validation and merging', () => {
  it('rebuilds progress chronologically rather than trusting supplied review metadata', () => {
    const restored = parseStudy(JSON.stringify({
      ...emptyStudy(), displayName: 'Jožko', dailyGoal: 12,
      attempts: [attempt({ id: 'second', createdAt: '2026-10-10T10:00:00Z' }), attempt()],
      progress: { wo: { repetitions: 999, dueAt: '2099-01-01' } },
    }))
    expect(restored.attempts.map((item) => item.id)).toEqual(['attempt-1', 'second'])
    expect(restored.progress.wo).toMatchObject({ repetitions: 2, intervalDays: 3, dueAt: '2026-10-13T10:00:00.000Z' })
    expect(restored).toMatchObject({ displayName: 'Jožko', dailyGoal: 12 })
  })

  it('rejects unsupported versions, invalid dates, mode/input mismatches and malformed counters', () => {
    expect(isStudyAttempt(attempt({ mode: 'speech', input: 'self' }))).toBe(false)
    expect(isStudyAttempt(attempt({ createdAt: 'not-a-date' }))).toBe(false)
    expect(isStudyAttempt(attempt({ mistakes: -1 }))).toBe(false)
    expect(isStudyAttempt(attempt({ durationMs: Infinity }))).toBe(false)
    expect(() => parseStudy(JSON.stringify({ ...emptyStudy(), version: 2 }))).toThrow()
    expect(() => parseStudy(JSON.stringify({ ...emptyStudy(), dailyGoal: 101 }))).toThrow()
    expect(() => parseStudy(JSON.stringify({ ...emptyStudy(), attempts: [attempt({ mode: 'speech', input: 'self' })] }))).toThrow()
    expect(() => parseStudy('not json')).toThrow()
  })

  it('rejects unknown ratings, ratings on other modes and contradictions with correctness', () => {
    const invalid = [
      { rating: 'excellent' },
      { rating: null },
      { rating: 1 },
      { rating: 'again', correct: true },
      { rating: 'hard', correct: false },
      { rating: 'good', correct: false },
      { rating: 'easy', correct: false },
      { mode: 'speech', input: 'recognition', rating: 'good' },
      { mode: 'writing', input: 'writing', rating: 'easy' },
      { mode: 'sentences', input: 'sentence', rating: 'hard' },
    ]
    for (const override of invalid) {
      const value = { ...attempt(), ...override }
      expect(isStudyAttempt(value)).toBe(false)
      expect(() => parseStudy(JSON.stringify({ ...emptyStudy(), attempts: [value] }))).toThrow()
    }
  })

  it('merges overlapping backups once and preserves their replayed scheduling', () => {
    const current = appendAttempt(emptyStudy(), attempt())
    const imported = appendAttempt(current, attempt({ id: 'second', createdAt: '2026-10-10T10:00:00Z' }))
    const merged = mergeStudy(current, imported)
    expect(merged.attempts).toHaveLength(2)
    expect(merged.progress.wo.repetitions).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import { lessons } from '../data/learning'
import type { LearningSession } from '../types/learning'
import { activityStatus, sessionScore, validateLearningSession } from './learning'
import { emptyStudy, mergeStudy, parseStudy, saveLearningSession } from './study'

const lesson = lessons[0]
function session(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: 'learning-1', activityId: lesson.id,
    startedAt: '2026-10-14T10:00:00.000Z', updatedAt: '2026-10-14T10:05:00.000Z',
    answers: lesson.questions.map((question) => ({ questionId: question.id, response: question.type === 'choice' ? [question.answer] : question.acceptedOrders[0], assisted: false })),
    finishedAt: '2026-10-14T10:05:00.000Z', ...overrides,
  }
}

describe('learning persistence and compatible backups', () => {
  it('loads older backups with no course data and preserves the existing practice history', () => {
    const old = { ...emptyStudy(), learningSessions: undefined }
    expect(parseStudy(JSON.stringify(old)).learningSessions).toEqual([])
    const state = saveLearningSession(emptyStudy(), session())
    const restored = parseStudy(JSON.stringify(state))
    expect(restored.learningSessions).toEqual([session()])
    expect(restored.progress).toEqual({})
    expect(restored.attempts).toEqual([])
    expect(activityStatus(lesson, restored.learningSessions!)).toBe('completed')
  })

  it('merges an updated session once and keeps learning data when importing a legacy backup', () => {
    const draft = session({ answers: [], finishedAt: undefined, updatedAt: '2026-10-14T10:00:00.000Z' })
    const current = saveLearningSession(emptyStudy(), draft)
    const incoming = saveLearningSession(emptyStudy(), session())
    const merged = mergeStudy(current, incoming)
    expect(merged.learningSessions).toEqual([session()])
    expect(mergeStudy(merged, incoming).learningSessions).toHaveLength(1)
    expect(mergeStudy(merged, emptyStudy()).learningSessions).toEqual([session()])
    expect(mergeStudy(merged, current).learningSessions).toEqual([session()])
  })

  it('rejects malformed progress instead of unlocking a lesson using forged completion flags', () => {
    for (const bad of [
      session({ activityId: 'missing-lesson' }),
      session({ answers: [] }),
      session({ updatedAt: 'invalid-date' }),
      session({ answers: [session().answers[0], session().answers[0]] }),
    ]) {
      expect(() => parseStudy(JSON.stringify({ ...emptyStudy(), learningSessions: [bad] }))).toThrow()
    }
    expect(() => parseStudy(JSON.stringify({ ...emptyStudy(), learningSessions: {} }))).toThrow()
    expect(() => mergeStudy(saveLearningSession(emptyStudy(), session()), saveLearningSession(emptyStudy(), session({ startedAt: '2026-10-14T09:00:00.000Z' })))).toThrow(/conflicting/)
  })

  it('preserves checked answers, completion and hint use when merging a newer unfinished device copy', () => {
    const finished = saveLearningSession(emptyStudy(), session())
    const hinted = saveLearningSession(emptyStudy(), session({ answers: [], finishedAt: undefined, updatedAt: '2026-10-14T10:06:00.000Z', hintedQuestionIds: [lesson.questions[0].id] }))
    const merged = mergeStudy(finished, hinted).learningSessions![0]
    expect(validateLearningSession(merged)).toBe(true)
    expect(merged.answers).toHaveLength(lesson.questions.length)
    expect(merged.finishedAt).toBe(session().finishedAt)
    expect(merged.hintedQuestionIds).toEqual([lesson.questions[0].id])
    expect(sessionScore(lesson, merged).correct).toBe(lesson.questions.length - 1)
  })
})

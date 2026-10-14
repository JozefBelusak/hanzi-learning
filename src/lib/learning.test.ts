import { describe, expect, it } from 'vitest'
import { activities, exercises, getActivity, lessons } from '../data/learning'
import vocabulary from '../data/vocabulary-hsk1.json'
import type { LearningActivity, LearningQuestion, LearningSession } from '../types/learning'
import {
  activityStatus, getLatestSession, getNextLesson, gradeAnswer, sessionScore,
  validateLearningSession,
} from './learning'

const startedAt = '2026-10-14T10:00:00.000Z'
const finishedAt = '2026-10-14T10:05:00.000Z'

function responseFor(question: LearningQuestion): string[] {
  return question.type === 'choice' ? [question.answer] : [...question.acceptedOrders[0]]
}

function completed(activity: LearningActivity, overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    id: `session-${activity.id}`, activityId: activity.id, startedAt,
    updatedAt: finishedAt, finishedAt,
    answers: activity.questions.map((question) => ({
      questionId: question.id, response: responseFor(question), assisted: false,
    })),
    ...overrides,
  }
}

describe('learning review grading', () => {
  it('accepts both grammatical placements of a time expression', () => {
    const question = getActivity('lesson-introductions')!.questions.find((item) => item.id === 'intro-today')!
    expect(gradeAnswer(question, ['我', '今天', '学习', '汉语'])).toBe(true)
    expect(gradeAnswer(question, ['今天', '我', '学习', '汉语'])).toBe(true)
    expect(gradeAnswer(question, ['我', '学习', '今天', '汉语'])).toBe(false)
  })

  it('requires all repeated tokens exactly once per occurrence', () => {
    const question = getActivity('exercise-family')!.questions[4]
    const correct = ['我', '喜欢', '茶', '，', '爸爸', '也', '喜欢', '茶']
    expect(gradeAnswer(question, correct)).toBe(true)
    expect(gradeAnswer(question, correct.slice(0, -1))).toBe(false)
    expect(gradeAnswer(question, ['我', '喜欢', '茶', '，', '爸爸', '也', '茶', '茶'])).toBe(false)
  })

  it('rejects a choice with multiple selected options', () => {
    const question = lessons[0].questions[0]
    const correct = responseFor(question)
    expect(gradeAnswer(question, correct)).toBe(true)
    expect(gradeAnswer(question, [...correct, ...correct])).toBe(false)
  })

  it('requires a finished complete review even when the current score reaches 80%', () => {
    const activity = lessons[0]
    const complete = completed(activity)
    const unfinished = { ...complete, answers: complete.answers.slice(0, 4), finishedAt: undefined }
    expect(sessionScore(activity, unfinished)).toEqual({ correct: 4, total: 5, percent: 80, passed: false })
    expect(sessionScore(activity, { ...complete, finishedAt: undefined }).passed).toBe(false)
    expect(sessionScore(activity, complete).passed).toBe(true)
  })

  it('does not turn hinted answers into independent achievement', () => {
    const activity = lessons[0]
    const session = completed(activity)
    session.answers[0].assisted = true
    session.answers[1].assisted = true
    expect(sessionScore(activity, session)).toEqual({ correct: 3, total: 5, percent: 60, passed: false })
    session.answers[1].assisted = false
    expect(sessionScore(activity, session).passed).toBe(true)
  })

  it('retains hint assistance after reload even if an imported answer claims otherwise', () => {
    const activity = lessons[0]
    const session = completed(activity, { hintedQuestionIds: activity.questions.slice(0, 2).map((question) => question.id) })
    expect(session.answers.every((answer) => !answer.assisted)).toBe(true)
    expect(sessionScore(activity, session)).toEqual({ correct: 3, total: 5, percent: 60, passed: false })
  })
})

describe('course progression', () => {
  it('unlocks the two branches after introductions and requires both for the checkpoint', () => {
    const sessions = lessons.slice(0, 3).map((activity) => completed(activity))
    expect(activityStatus(lessons[0], [])).toBe('available')
    expect(activityStatus(lessons[1], [])).toBe('locked')
    expect(activityStatus(lessons[3], sessions)).toBe('available')
    expect(activityStatus(lessons[4], sessions)).toBe('available')
    expect(activityStatus(lessons[5], [...sessions, completed(lessons[3])])).toBe('locked')
    expect(activityStatus(lessons[5], [...sessions, completed(lessons[3]), completed(lessons[4])])).toBe('available')
  })

  it('keeps completed lessons completed when the user starts a later retry', () => {
    const activity = lessons[0]
    const successful = completed(activity)
    const retry = completed(activity, {
      id: 'retry', updatedAt: '2026-10-14T11:00:00.000Z', answers: [], finishedAt: undefined,
    })
    expect(getLatestSession(activity.id, [retry, successful])).toBe(retry)
    expect(activityStatus(activity, [successful, retry])).toBe('completed')
    expect(activityStatus(lessons[1], [successful, retry])).toBe('available')
  })

  it('resumes unfinished lessons and allows every exercise immediately', () => {
    const session = completed(lessons[0], { answers: [], finishedAt: undefined })
    expect(activityStatus(lessons[0], [session])).toBe('in-progress')
    expect(getNextLesson([session])?.id).toBe(lessons[0].id)
    for (const exercise of exercises) expect(activityStatus(exercise, [])).toBe('available')
    expect(getNextLesson(lessons.map((activity) => completed(activity)))).toBeUndefined()
  })
})

describe('learning backup validation', () => {
  it('accepts complete, wrong, and unfinished attempts without trusting supplied scores', () => {
    const activity = lessons[0]
    const session = completed(activity)
    expect(validateLearningSession(session)).toBe(true)
    session.answers[0].response = ['second']
    session.answers[1].response = ['falling']
    expect(validateLearningSession({ ...session, percent: 100, passed: true })).toBe(true)
    expect(sessionScore(activity, session).passed).toBe(false)
    expect(validateLearningSession({ ...session, answers: [], finishedAt: undefined })).toBe(true)
  })

  it('rejects invalid chronology, unknown activities, and finishing before all questions', () => {
    const session = completed(lessons[0])
    expect(validateLearningSession({ ...session, startedAt: 'not a date' })).toBe(false)
    expect(validateLearningSession({ ...session, updatedAt: '2026-10-13T10:00:00.000Z' })).toBe(false)
    expect(validateLearningSession({ ...session, finishedAt: '2026-10-14T11:00:00.000Z' })).toBe(false)
    expect(validateLearningSession({ ...session, finishedAt: '2026-10-13T10:00:00.000Z' })).toBe(false)
    expect(validateLearningSession({ ...session, activityId: 'not-a-lesson' })).toBe(false)
    expect(validateLearningSession({ ...session, answers: session.answers.slice(0, 4) })).toBe(false)
  })

  it('requires answers in the authored order and rejects duplicate question IDs', () => {
    const session = completed(lessons[0])
    expect(validateLearningSession({ ...session, answers: [session.answers[1]], finishedAt: undefined })).toBe(false)
    expect(validateLearningSession({ ...session, answers: [session.answers[0], session.answers[0]], finishedAt: undefined })).toBe(false)
    expect(validateLearningSession({ ...session, answers: [...session.answers].reverse() })).toBe(false)
  })

  it('rejects invented choices, invalid token inventories, and missing assistance flags', () => {
    const session = completed(getActivity('exercise-family')!)
    expect(validateLearningSession({ ...session, answers: session.answers.map((answer, index) => index === 0 ? { ...answer, response: ['invented'] } : answer) })).toBe(false)
    expect(validateLearningSession({ ...session, answers: session.answers.map((answer, index) => index === 4 ? { ...answer, response: ['我', '喜欢', '茶', '，', '爸爸', '也', '茶', '茶'] } : answer) })).toBe(false)
    expect(validateLearningSession({ ...session, answers: session.answers.map((answer) => ({ ...answer, assisted: undefined })) })).toBe(false)
  })

  it('validates shown hints before checking and rejects future, repeated, or unknown hint IDs', () => {
    const session = completed(lessons[0], { answers: [], finishedAt: undefined })
    const first = lessons[0].questions[0].id
    expect(validateLearningSession({ ...session, hintedQuestionIds: [first] })).toBe(true)
    expect(validateLearningSession({ ...session, hintedQuestionIds: [first, first] })).toBe(false)
    expect(validateLearningSession({ ...session, hintedQuestionIds: [lessons[0].questions[1].id] })).toBe(false)
    expect(validateLearningSession({ ...session, hintedQuestionIds: ['unknown'] })).toBe(false)
  })
})

describe('authored curriculum integrity', () => {
  it('uses existing practice words and valid prerequisite lessons without dead ends', () => {
    const words = new Set(vocabulary.words.map((word) => word.simplified))
    expect(new Set(activities.map((activity) => activity.id)).size).toBe(activities.length)
    for (const activity of activities) {
      expect(activity.questions.length).toBeGreaterThan(0)
      expect(new Set(activity.questions.map((question) => question.id)).size).toBe(activity.questions.length)
      for (const word of activity.practiceWords) expect(words.has(word), `${activity.id}: ${word}`).toBe(true)
      for (const prerequisite of activity.prerequisites) {
        expect(getActivity(prerequisite)?.kind).toBe('lesson')
        expect(lessons.findIndex((lesson) => lesson.id === prerequisite)).toBeLessThan(lessons.indexOf(activity))
      }
      for (const question of activity.questions) {
        if (question.type === 'choice') {
          expect(question.options.some((option) => option.id === question.answer)).toBe(true)
          expect(new Set(question.options.map((option) => option.id)).size).toBe(question.options.length)
        } else {
          for (const accepted of question.acceptedOrders) expect([...accepted].sort()).toEqual([...question.tokens].sort())
        }
      }
      expect(validateLearningSession(completed(activity))).toBe(true)
    }
  })
})

import { getActivity, lessons } from '../data/learning'
import type { LearningActivity, LearningQuestion, LearningSession } from '../types/learning'

export type LearningStatus = 'locked' | 'available' | 'in-progress' | 'completed'

export function gradeAnswer(question: LearningQuestion, response: string[]): boolean {
  if (question.type === 'choice') {
    return response.length === 1 && response[0] === question.answer
  }
  return question.acceptedOrders.some((order) =>
    response.length === order.length && order.every((token, index) => token === response[index]),
  )
}

export function sessionScore(activity: LearningActivity, session: LearningSession) {
  const total = activity.questions.length
  const answers = new Map(session.answers.map((answer) => [answer.questionId, answer]))
  const correct = activity.questions.filter((question) => {
    const answer = answers.get(question.id)
    return answer && !answer.assisted && !session.hintedQuestionIds?.includes(question.id) &&
      gradeAnswer(question, answer.response)
  }).length
  const percent = total ? Math.round(100 * correct / total) : 0
  const complete = session.activityId === activity.id && total > 0 &&
    session.answers.length === total && answers.size === total &&
    activity.questions.every((question) => answers.has(question.id)) &&
    !!session.finishedAt && Number.isFinite(Date.parse(session.finishedAt))
  // Hint-assisted answers are useful practice, but do not raise the independent score.
  return { correct, total, percent, passed: complete && correct / total >= 0.8 }
}

export function getLatestSession(
  activityId: string,
  sessions: LearningSession[],
): LearningSession | undefined {
  return sessions.filter((session) => session.activityId === activityId)
    .reduce<LearningSession | undefined>((latest, session) =>
      !latest || Date.parse(session.updatedAt) >= Date.parse(latest.updatedAt) ? session : latest,
    undefined)
}

function hasPassed(activityId: string, sessions: LearningSession[]): boolean {
  const activity = getActivity(activityId)
  return !!activity && sessions.some((session) =>
    session.activityId === activityId && sessionScore(activity, session).passed,
  )
}

export function activityStatus(
  activity: LearningActivity,
  sessions: LearningSession[],
): LearningStatus {
  // Revisiting a lesson never removes an already earned completion.
  if (hasPassed(activity.id, sessions)) return 'completed'
  if (activity.prerequisites.some((id) => !hasPassed(id, sessions))) return 'locked'
  const latest = getLatestSession(activity.id, sessions)
  return latest && !latest.finishedAt ? 'in-progress' : 'available'
}

export function getNextLesson(sessions: LearningSession[]): LearningActivity | undefined {
  return lessons.find((activity) => {
    const status = activityStatus(activity, sessions)
    return status === 'available' || status === 'in-progress'
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function usesExactTokens(response: string[], tokens: string[]): boolean {
  if (response.length !== tokens.length) return false
  const remaining = new Map<string, number>()
  for (const token of tokens) remaining.set(token, (remaining.get(token) ?? 0) + 1)
  for (const token of response) {
    const count = remaining.get(token) ?? 0
    if (count < 1) return false
    remaining.set(token, count - 1)
  }
  return true
}

export function validateLearningSession(value: unknown): value is LearningSession {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 200 ||
    typeof value.activityId !== 'string' ||
    !validDate(value.startedAt) || !validDate(value.updatedAt) ||
    Date.parse(value.updatedAt) < Date.parse(value.startedAt) ||
    !Array.isArray(value.answers)) return false
  const activity = getActivity(value.activityId)
  if (!activity || value.answers.length > activity.questions.length) return false
  if (value.hintedQuestionIds !== undefined) {
    if (!Array.isArray(value.hintedQuestionIds) ||
      new Set(value.hintedQuestionIds).size !== value.hintedQuestionIds.length ||
      !value.hintedQuestionIds.every((id: unknown) => typeof id === 'string' &&
        activity.questions.some((question, index) => question.id === id &&
          !!question.hint && index <= (value.answers as unknown[]).length))) return false
  }
  if (value.finishedAt !== undefined && (
    !validDate(value.finishedAt) ||
    Date.parse(value.finishedAt) < Date.parse(value.startedAt) ||
    Date.parse(value.finishedAt) > Date.parse(value.updatedAt) ||
    value.answers.length !== activity.questions.length
  )) return false
  // Sessions contain a prefix of the authored review. No skipped or duplicated questions.
  return value.answers.every((answer: unknown, index: number) => {
    if (!isRecord(answer) || answer.questionId !== activity.questions[index].id ||
      typeof answer.assisted !== 'boolean' ||
      !Array.isArray(answer.response) ||
      !answer.response.every((item: unknown) => typeof item === 'string')) return false
    const response = answer.response as string[]
    const question = activity.questions[index]
    return question.type === 'choice'
      ? response.length === 1 && question.options.some((option) => option.id === response[0])
      : usesExactTokens(response, question.tokens)
  })
}

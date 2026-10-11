import type {
  AttemptInput, Card, CardProgress, FlashcardRating, StudyAttempt, StudyData,
} from '../types/study'

const DAY = 86_400_000
const intervals = [1, 3, 7, 14, 30]
export const emptyStudy = (): StudyData => ({ version: 1, displayName: '', dailyGoal: 10, attempts: [], progress: {} })
export function scheduleReview(
  previous: CardProgress | undefined,
  correct: boolean,
  createdAt: string,
  rating?: FlashcardRating,
): CardProgress {
  // Older boolean-only attempts keep their original good/again scheduling.
  const response = rating ?? (correct ? 'good' : 'again')
  const previousRepetitions = previous?.repetitions ?? 0
  let repetitions: number
  switch (response) {
    case 'again': repetitions = 0; break
    case 'hard': repetitions = Math.max(1, previousRepetitions); break
    case 'good': repetitions = previousRepetitions + 1; break
    case 'easy': repetitions = previousRepetitions + 2; break
  }
  const step = intervals[Math.min(Math.max(repetitions - 1, 0), intervals.length - 1)]
  // Hard keeps the current step and halves its interval; easy skips one step.
  const intervalDays = response === 'again' ? 0 : response === 'hard' ? step / 2 : step
  const delay = response === 'again' ? 10 * 60_000 : intervalDays * DAY
  return {
    cardId: previous?.cardId ?? '',
    repetitions,
    intervalDays,
    ease: 2.5,
    dueAt: new Date(Date.parse(createdAt) + delay).toISOString(),
    lastReviewedAt: createdAt,
  }
}
export function appendAttempt(state: StudyData, attempt: StudyAttempt): StudyData {
  if (state.attempts.some((existing) => existing.id === attempt.id)) return state
  const progress = { ...state.progress }
  if (attempt.mode === 'flashcards' && !attempt.assisted) {
    progress[attempt.cardId] = {
      ...scheduleReview(progress[attempt.cardId], attempt.correct, attempt.createdAt, attempt.rating),
      cardId: attempt.cardId,
    }
  }
  return { ...state, attempts: [...state.attempts, attempt], progress }
}
export function createAttempt(input: AttemptInput): StudyAttempt {
  return { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
}
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function studySummary(attempts: StudyAttempt[], now = new Date()) {
  const today = dayKey(now)
  const todayCount = attempts.filter((attempt) => dayKey(new Date(attempt.createdAt)) === today).length
  const activeDays = new Set(attempts.map((attempt) => dayKey(new Date(attempt.createdAt))))
  const cursor = new Date(now)
  if (!activeDays.has(today)) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (activeDays.has(dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1) }
  const points = attempts.reduce((sum, attempt) => sum + (attempt.correct && !attempt.assisted ? 20 : 5), 0)
  const graded = attempts.filter((attempt) => !attempt.assisted && attempt.input !== 'manual')
  return { todayCount, streak, points, level: 1 + Math.floor(points / 200), accuracy: graded.length ? Math.round(100 * graded.filter((attempt) => attempt.correct).length / graded.length) : null, practiced: new Set(attempts.filter((attempt) => attempt.mode !== 'sentences').map((attempt) => attempt.cardId)).size }
}
export function dueCards(cards: Card[], progress: StudyData['progress'], now = Date.now()): Card[] {
  return cards.filter((card) => !progress[card.id] || Date.parse(progress[card.id].dueAt) <= now)
    .sort((a, b) => (Date.parse(progress[a.id]?.dueAt ?? '') || 0) - (Date.parse(progress[b.id]?.dueAt ?? '') || 0))
}
export function nextReviewCard(cards: Card[], progress: StudyData['progress'], currentId?: string): Card | undefined {
  const candidates = cards.filter((card) => card.id !== currentId)
  const pool = candidates.length ? candidates : cards
  return dueCards(pool, progress)[0] ?? pool.slice().sort((a, b) => (Date.parse(progress[a.id]?.dueAt ?? '') || 0) - (Date.parse(progress[b.id]?.dueAt ?? '') || 0))[0]
}
export function isStudyAttempt(value: unknown): value is StudyAttempt {
  if (!value || typeof value !== 'object') return false
  const a = value as Record<string, unknown>
  const modeInputs: Record<string, string[]> = { flashcards: ['self'], speech: ['recognition', 'manual'], writing: ['writing'], sentences: ['sentence'] }
  const validRating = a.rating === undefined || (
    a.mode === 'flashcards' &&
    ['again', 'hard', 'good', 'easy'].includes(a.rating as string) &&
    a.correct === (a.rating !== 'again')
  )
  return typeof a.id === 'string' && !!a.id && typeof a.cardId === 'string' && !!a.cardId &&
    typeof a.mode === 'string' && Object.hasOwn(modeInputs, a.mode) && typeof a.input === 'string' && modeInputs[a.mode].includes(a.input) &&
    typeof a.correct === 'boolean' && typeof a.createdAt === 'string' && Number.isFinite(Date.parse(a.createdAt)) &&
    (a.assisted === undefined || typeof a.assisted === 'boolean') &&
    (a.mistakes === undefined || (typeof a.mistakes === 'number' && Number.isInteger(a.mistakes) && a.mistakes >= 0)) &&
    (a.durationMs === undefined || (typeof a.durationMs === 'number' && Number.isFinite(a.durationMs) && a.durationMs >= 0)) &&
    (a.expectedText === undefined || typeof a.expectedText === 'string') && (a.responseText === undefined || typeof a.responseText === 'string') &&
    validRating
}
export function parseStudy(raw: string): StudyData {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('The backup has an invalid format.')
  const data = value as Record<string, unknown>
  if (data.version !== 1 || typeof data.displayName !== 'string' || !Array.isArray(data.attempts) || !data.attempts.every(isStudyAttempt) || typeof data.dailyGoal !== 'number' || !Number.isInteger(data.dailyGoal) || data.dailyGoal < 1 || data.dailyGoal > 100) throw new Error('The backup does not contain valid Hanzi progress.')
  return data.attempts.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).reduce(appendAttempt, { ...emptyStudy(), displayName: data.displayName.slice(0, 60), dailyGoal: data.dailyGoal })
}
export function mergeStudy(current: StudyData, imported: StudyData): StudyData {
  return parseStudy(JSON.stringify({ ...imported, attempts: [...current.attempts, ...imported.attempts] }))
}

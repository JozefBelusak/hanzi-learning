import type { Difficulty, LanguageLevel } from './content'
import type { PracticeMode } from './study'

export type DailyStop = { id: string; title: string; reason: string } & (
  | { kind: 'practice'; mode: PracticeMode; targetIds: string[] }
  | { kind: 'activity'; activityId: string; revision: number }
)
// Immutable plans; completion is derived from the existing validated histories.
export type DailyRoute = {
  id: string
  day: string
  createdAt: string
  expiresAt: string
  preferenceKey: string
  languageLevel: LanguageLevel
  difficulty: Difficulty
  boundaryAttemptIds: string[]
  previousSessionIds: string[]
  stops: DailyStop[]
}

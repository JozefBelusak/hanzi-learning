import type { LearningSession } from './learning'

export type WordCategoryId =
  | 'people' | 'food' | 'numbers' | 'time'
  | 'places' | 'actions' | 'objects' | 'other'

export type CategoryId = 'all' | WordCategoryId
export type PracticeMode = 'flashcards' | 'speech' | 'writing' | 'sentences'
export type LearningModeId = PracticeMode | 'progress'
export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy'

export type Card = {
  id: string
  hanzi: string
  pinyin: string
  meaning: string
  categoryId: WordCategoryId
  level: number
}

export type AttemptInput = {
  mode: PracticeMode
  cardId: string
  correct: boolean
  input: 'self' | 'recognition' | 'manual' | 'writing' | 'sentence'
  expectedText?: string
  responseText?: string
  mistakes?: number
  assisted?: boolean
  durationMs?: number
  rating?: FlashcardRating
}

export type StudyAttempt = AttemptInput & {
  id: string
  createdAt: string
}

export type CardProgress = {
  cardId: string
  repetitions: number
  intervalDays: number
  ease: number
  dueAt: string
  lastReviewedAt: string
}

export type StudyData = {
  version: 1
  displayName: string
  dailyGoal: number
  attempts: StudyAttempt[]
  progress: Record<string, CardProgress>
  learningSessions?: LearningSession[]
}

// Earlier saved attempts are migrated when the application starts.
export type FlashcardAttempt = { cardId: string; correct: boolean; createdAt: string }
export type SpeechAttempt = {
  cardId: string; recognizedText: string; matched: boolean; createdAt: string
}

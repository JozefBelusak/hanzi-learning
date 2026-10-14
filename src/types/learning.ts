import type { CategoryId } from './study'

type QuestionBase = {
  id: string
  prompt: string
  explanation: string
  hint?: string
  audioText?: string
}

export type LearningQuestion = QuestionBase & (
  | {
      type: 'choice'
      options: { id: string; text: string; pinyin?: string }[]
      answer: string
    }
  | {
      type: 'order'
      tokens: string[]
      acceptedOrders: string[][]
    }
)

export type LearningActivity = {
  id: string
  kind: 'lesson' | 'exercise'
  title: string
  description: string
  minutes: number
  category: CategoryId
  objectives: string[]
  explanation: string[]
  examples: { hanzi: string; pinyin: string; meaning: string }[]
  questions: LearningQuestion[]
  prerequisites: string[]
  line: 'sounds' | 'everyday' | 'sentences'
  position: { x: number; y: number }
  practiceWords: string[]
  fact?: { title: string; text: string; sourceUrl: string; sourceLabel: string }
}

export type LearningAnswer = {
  questionId: string
  // A choice stores one option ID; ordering stores the complete sequence of words.
  response: string[]
  assisted: boolean
}

export type LearningSession = {
  id: string
  activityId: string
  startedAt: string
  updatedAt: string
  answers: LearningAnswer[]
  // Persist shown hints immediately, including before an answer is checked.
  hintedQuestionIds?: string[]
  finishedAt?: string
}

export type { LearningActivity, LearningQuestion } from './content'

export type LearningAnswer = {
  questionId: string
  // A choice stores one option ID; ordering stores the complete sequence of words.
  response: string[]
  assisted: boolean
}

export type LearningSession = {
  id: string
  activityId: string
  // Absent in older backups: the original published revision is 1.
  contentRevision?: number
  startedAt: string
  updatedAt: string
  answers: LearningAnswer[]
  // Persist shown hints immediately, including before an answer is checked.
  hintedQuestionIds?: string[]
  finishedAt?: string
}

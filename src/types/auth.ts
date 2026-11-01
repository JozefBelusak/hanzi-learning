import type { LearningGoal } from '../lib/profile'
import type { Difficulty, LanguageLevel } from './content'
import type { PracticeMode } from './study'

export type UserRole = 'student' | 'lecturer' | 'admin'

export type UserProfile = {
  id: string
  email: string
  display_name: string
  role: UserRole
  created_at: string
  language_level: LanguageLevel | null
  difficulty: Difficulty | null
  preferred_modes: PracticeMode[]
  learning_goals: LearningGoal[]
  daily_goal: number
  onboarding_completed_at: string | null
}

export type { LecturerLesson as PublicLesson } from './content'

export type Classroom = {
  id: string
  lecturer_id: string
  name: string
  join_code: string
  created_at: string
}

export type ClassroomMember = {
  classroom_id: string
  student_id: string
  joined_at: string
}

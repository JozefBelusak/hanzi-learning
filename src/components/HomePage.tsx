import { studySummary } from '../lib/study'
import { getNextLesson, activityStatus } from '../lib/learning'
import { lessons } from '../data/learning'
import type { PracticeMode, StudyData } from '../types/study'
import type { UserProfile } from '../types/auth'
import LearningPlan from './LearningPlan'
import { levelLabel } from '../data/taxonomy'

type Props = { study: StudyData; profile: UserProfile; onEditProfile: () => void; onPreferredPractice: (mode: PracticeMode) => void; onLearn: () => void; onCourse: () => void; onLesson: (id: string) => void; onExercises: () => void; onProgress: () => void }

export default function HomePage({ study, profile, onEditProfile, onPreferredPractice, onLearn, onCourse, onLesson, onExercises, onProgress }: Props) {
  const summary = studySummary(study.attempts)
  const sessions = study.learningSessions ?? []
  const pathLessons = lessons.filter((lesson) => lesson.languageLevel === (profile.language_level ?? 'beginner'))
  const next = getNextLesson(sessions, pathLessons)
  const complete = pathLessons.filter((lesson) => activityStatus(lesson, sessions) === 'completed').length
  return (
    <main className="home-page">
      <h1>Home</h1>
      {study.displayName && <p className="home-greeting">Hi, {study.displayName}.</p>}
      <section className="home-study">
        <div>
          <span className="home-course-label">{levelLabel(profile.language_level ?? 'beginner')} path</span>
          <h2>{next?.title ?? 'Your learning path, complete'}</h2>
          <p>{next?.description ?? 'Revisit any stop on the course map, or put your skills to work in a themed exercise.'}</p>
          <div className="action-row">
            <button type="button" onClick={() => next ? onLesson(next.id) : onCourse()}>{next ? sessions.some((session) => session.activityId === next.id && !session.finishedAt) ? 'Continue lesson' : 'Start course' : 'Revisit course'}</button>
            <button type="button" className="home-map-button" onClick={onCourse}>View course map</button>
          </div>
          <span className="home-course-progress">{complete} / {pathLessons.length} stops completed</span>
        </div>
        <span className="home-character" lang="zh-CN" aria-hidden="true">学</span>
      </section>
      <section className="home-pathways" aria-label="Choose your learning path">
        <button className="home-pathway" type="button" aria-label="Themed exercises" onClick={onExercises}><span><strong>Themed exercises</strong><span>Practise listening, vocabulary and sentences in everyday situations.</span></span></button>
        <button className="home-pathway" type="button" aria-label="Start practice" onClick={onLearn}><span><strong>Start practice</strong><span>Choose your own words and focus on one skill at a time.</span></span></button>
      </section>
      <LearningPlan profile={profile} onEdit={onEditProfile} onPractice={onPreferredPractice} />
      <section className="home-goal" aria-label="Today's practice">
        <div className="goal-heading"><h2>Daily practice goal</h2><span>{summary.todayCount} / {study.dailyGoal} practice attempts</span></div>
        <progress aria-label="Daily goal progress" value={Math.min(summary.todayCount, study.dailyGoal)} max={study.dailyGoal} />
        {summary.todayCount >= study.dailyGoal && <p>You've reached today's goal.</p>}
      </section>
      <section className="home-progress">
        <div><strong>{summary.streak}</strong><span>{summary.streak === 1 ? 'day streak' : 'days in a row'}</span></div>
        <div><strong>{summary.practiced}</strong><span>{summary.practiced === 1 ? 'word practised' : 'words practised'}</span></div>
        <button type="button" className="text-btn" onClick={onProgress}>View progress</button>
      </section>
    </main>
  )
}

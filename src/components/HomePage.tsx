import { studySummary } from '../lib/study'
import type { StudyData } from '../types/study'

type Props = { study: StudyData; onLearn: () => void; onProgress: () => void }

export default function HomePage({ study, onLearn, onProgress }: Props) {
  const summary = studySummary(study.attempts)
  return (
    <main className="home-page">
      <h1>Home</h1>
      {study.displayName && <p className="home-greeting">Hi, {study.displayName}.</p>}
      <section className="home-study">
        <div>
          <h2>Chinese practice</h2>
          <p>Choose a topic and practise vocabulary, speaking or writing characters.</p>
          <button type="button" onClick={onLearn}>Start practice</button>
        </div>
        <span className="home-character" lang="zh-CN" aria-hidden="true">学</span>
      </section>
      <section className="home-goal" aria-label="Today's practice">
        <div className="goal-heading"><h2>Today's goal</h2><span>{summary.todayCount} / {study.dailyGoal} attempts</span></div>
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

import type { Card, StudyData } from '../types/study'
import { categories, filterCards } from '../data/categories'
import { dayKey, dueCards, studySummary } from '../lib/study'
import { activities, lessons, exercises, getActivity } from '../data/learning'
import { activityStatus, sessionScore } from '../lib/learning'

type Props = { cards: Card[]; study: StudyData; onBack: () => void }
const modeNames = { flashcards: 'Flashcards', speech: 'Speaking · text match', writing: 'Writing', sentences: 'Sentences · word order' }

export default function ProgressPage({ cards, study, onBack }: Props) {
  const summary = studySummary(study.attempts)
  const sessions = study.learningSessions ?? []
  const finished = sessions.filter((session) => session.finishedAt).slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - index))
    return { date, count: study.attempts.filter((attempt) => dayKey(new Date(attempt.createdAt)) === dayKey(date)).length }
  })
  const max = Math.max(1, ...days.map((day) => day.count))

  return (
    <main className="progress-page">
      <button className="back-button" type="button" onClick={onBack}>Back</button>
      <h1>Progress</h1>
      <section className="stats-grid">
        <div className="stat-card"><span>Total attempts</span><strong>{study.attempts.length}</strong></div>
        <div className="stat-card"><span>Words practised</span><strong>{summary.practiced} <small>/ {cards.length}</small></strong></div>
        <div className="stat-card"><span>Day streak</span><strong>{summary.streak}</strong></div>
        <div className="stat-card"><span>Points</span><strong>{summary.points}</strong></div>
      </section>
      <section className="card-surface learning-progress-summary" aria-label="Course and exercise progress">
        <h2>Your learning journeys</h2>
        <div className="learning-progress-totals">
          <span><strong>{lessons.filter((lesson) => activityStatus(lesson, sessions) === 'completed').length} / {lessons.length}</strong>course stops completed</span>
          <span><strong>{exercises.filter((exercise) => activityStatus(exercise, sessions) === 'completed').length} / {exercises.length}</strong>exercises passed</span>
        </div>
        {finished.length ? <ol className="learning-history">{finished.slice(0, 6).map((session) => {
          const activity = getActivity(session.activityId)!
          const score = sessionScore(activity, session)
          return <li key={session.id}><div><strong>{activity.title}</strong><small>{activity.kind === 'lesson' ? 'Course' : 'Exercise'} · {score.passed ? 'Passed' : 'Review recommended'} · {new Date(session.updatedAt).toLocaleDateString('en-GB')}</small></div><span>{score.correct} / {score.total} independent answers</span></li>
        })}</ol> : <p>{activities.some((activity) => activityStatus(activity, sessions) === 'in-progress') ? 'A learning session is in progress. Continue it from Course or Exercises.' : 'Complete a course stop or a themed exercise to see your results here.'}</p>}
      </section>
      <section className="progress-columns">
        <div className="card-surface">
          <h2>The last seven days</h2>
          <div className="activity-chart" aria-label="Attempts over the last seven days">
            {days.map(({ date, count }) => <div className="activity-day" key={dayKey(date)}><span>{count}</span><div className="activity-track"><div style={{ height: `${Math.max(count ? 5 : 0, count / max * 100)}%` }} /></div><span>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span></div>)}
          </div>
        </div>
        <div className="card-surface">
          <h2>Results by mode</h2>
          {Object.entries(modeNames).map(([mode, title]) => {
            const attempts = study.attempts.filter((attempt) => attempt.mode === mode && !attempt.assisted && attempt.input !== 'manual')
            const correct = attempts.filter((attempt) => attempt.correct).length
            return <div className="mode-stat" key={mode}><span>{title}<small>{attempts.length} unassisted {attempts.length === 1 ? 'attempt' : 'attempts'}</small></span><strong>{attempts.length ? `${Math.round(100 * correct / attempts.length)}%` : '—'}</strong></div>
          })}
          <details className="practice-help"><summary>How are results calculated?</summary><p>Assisted attempts and manually entered text appear in your history but do not count towards these percentages. Flashcards use self-assessment. Speaking checks the recognised text, not tones or pronunciation quality.</p></details>
        </div>
      </section>
      <details className="card-surface category-progress">
        <summary>Review by topic</summary>
        <div className="review-category-list">
          {categories.filter((category) => category.id !== 'all').map((category) => {
            const selected = filterCards(cards, category.id)
            return <div key={category.id}><span>{category.title}</span><span>{dueCards(selected, study.progress).length} / {selected.length} due</span></div>
          })}
        </div>
      </details>
      <section className="card-surface history-section">
        <h2>Recent attempts</h2>
        {study.attempts.length ? <ol className="history-list">{study.attempts.slice(-12).reverse().map((attempt) => {
          const card = cards.find((item) => item.id === attempt.cardId)
          return <li key={attempt.id}><span className={`history-result ${attempt.correct ? 'is-correct' : ''}`}>{attempt.correct ? 'Correct' : 'Review'}</span><div><strong lang={attempt.mode === 'flashcards' && attempt.expectedText === card?.meaning ? 'en' : 'zh-CN'}>{attempt.expectedText ?? card?.hanzi ?? 'Sentence'}</strong><span>{modeNames[attempt.mode]}{attempt.assisted ? ' · assisted' : ''}{attempt.input === 'manual' ? ' · manual entry' : ''}</span></div><time dateTime={attempt.createdAt}>{new Date(attempt.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></li>
        })}</ol> : <p>No attempts yet.</p>}
      </section>
    </main>
  )
}

import type { Card, StudyData } from '../types/study'
import { categories, filterCards } from '../data/categories'
import { dayKey, dueCards, studySummary } from '../lib/study'

type Props = { cards: Card[]; study: StudyData; onBack: () => void }
const modeNames = { flashcards: 'Flashcards', speech: 'Speaking · text match', writing: 'Writing', sentences: 'Sentences · word order' }

export default function ProgressPage({ cards, study, onBack }: Props) {
  const summary = studySummary(study.attempts)
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

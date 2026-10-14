import { useState } from 'react'
import { categories, categoryTitle } from '../data/categories'
import { exercises } from '../data/learning'
import { getLatestSession, sessionScore } from '../lib/learning'
import type { LearningActivity, LearningSession } from '../types/learning'
import type { CategoryId } from '../types/study'
import './ExercisesPage.css'

type Props = {
  sessions: LearningSession[]
  onSelect: (id: string) => void
  onPractice: () => void
}

function normalizeSearch(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function bestResult(activity: LearningActivity, sessions: LearningSession[]) {
  const results = sessions.filter((session) => session.activityId === activity.id && session.finishedAt).map((session) => sessionScore(activity, session))
  return results.reduce<ReturnType<typeof sessionScore> | undefined>((best, result) => !best || result.percent > best.percent ? result : best, undefined)
}

export default function ExercisesPage({ sessions, onSelect, onPractice }: Props) {
  const [topic, setTopic] = useState<CategoryId>('all')
  const [query, setQuery] = useState('')
  const normalizedQuery = normalizeSearch(query)
  const topics = categories.filter((category) => category.id !== 'all' && exercises.some((exercise) => exercise.category === category.id))
  const filtered = exercises.filter((exercise) => (topic === 'all' || exercise.category === topic) && normalizeSearch([exercise.title, exercise.description, ...exercise.objectives, ...exercise.examples.flatMap((example) => [example.hanzi, example.pinyin, example.meaning])].join(' ')).includes(normalizedQuery))

  return (
    <main className="exercises-page">
      <header className="exercises-heading">
        <div><h1>Exercises</h1><p>Pick a situation and work through a mix of short tasks. No course stops need to be unlocked.</p></div>
        <span className="exercises-heading-symbol" lang="zh-CN" aria-hidden="true">练</span>
      </header>

      <section className="exercises-toolbar" aria-label="Find an exercise">
        <div className="exercise-filter-field"><label htmlFor="exercise-search">Search exercises</label><input id="exercise-search" type="search" placeholder="A situation, word or phrase…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="exercise-filter-field"><span id="exercise-topic-label">Topic</span><div className="exercise-topic-filters" role="group" aria-labelledby="exercise-topic-label">
          {[{ id: 'all' as const, title: 'All topics' }, ...topics].map((category) => <button className="exercise-topic-button" key={category.id} type="button" aria-pressed={topic === category.id} onClick={() => setTopic(category.id)}>{category.title}</button>)}
        </div></div>
      </section>
      <p className="exercises-count" role="status">{filtered.length} {filtered.length === 1 ? 'exercise' : 'exercises'}{query || topic !== 'all' ? ' found' : ' to explore'}</p>

      <section className="exercise-catalog" aria-label="Available exercises">
        {filtered.map((exercise) => {
          const best = bestResult(exercise, sessions)
          const latest = getLatestSession(exercise.id, sessions)
          const continuing = latest && !latest.finishedAt
          const category = categories.find((item) => item.id === exercise.category)
          return (
            <article className="exercise-card" key={exercise.id}>
              <div className={`exercise-cover exercise-cover-${exercises.indexOf(exercise) % 3}`}><span className="exercise-cover-symbol" lang="zh-CN" aria-hidden="true">{category?.symbol ?? '练'}</span><span className="exercise-cover-topic">{categoryTitle(exercise.category)}</span></div>
              <div className="exercise-card-content">
                <div className="exercise-card-meta"><span>{exercise.minutes} min</span><span>{exercise.questions.length} tasks</span>{continuing && <strong>In progress</strong>}</div>
                <h2>{exercise.title}</h2>
                <p>{exercise.description}</p>
                <div className="exercise-card-footer">{best && <span>Best independent result<br /><strong>{best.correct} / {best.total} · {best.percent}%</strong></span>}<button type="button" aria-label={`${continuing ? 'Continue' : 'Start'} ${exercise.title}`} onClick={() => onSelect(exercise.id)}>{continuing ? 'Continue' : 'Start exercise'}</button></div>
              </div>
            </article>
          )
        })}
      </section>

      {filtered.length === 0 && <div className="exercises-empty"><h2>No exercises found</h2><p>Try another word or explore all of the starter situations.</p><button type="button" className="secondary-btn" onClick={() => { setQuery(''); setTopic('all') }}>Show all exercises</button></div>}

      <aside className="exercise-practice-link"><div><h2>Want to focus on one skill?</h2><p>Choose your own vocabulary and practise flashcards, speaking, character writing or sentences.</p></div><button type="button" className="secondary-btn" onClick={onPractice}>Open free practice</button></aside>
      <p className="exercise-score-note">Exercise results count correct answers completed without hints. They do not measure pronunciation or tone accuracy.</p>
    </main>
  )
}

import { useState, type CSSProperties } from 'react'
import { lessons as allLessons } from '../data/learning'
import { activityStatus, getLatestSession, getNextLesson, sessionScore } from '../lib/learning'
import type { LearningActivity, LearningSession } from '../types/learning'
import './CoursePage.css'
import { taxonomy, difficultyLabel, levelLabel } from '../data/taxonomy'
import ContentFilters from './ContentFilters'
import { allContent, matchesContent } from '../lib/contentFilter'

type Props = {
  sessions: LearningSession[]
  onSelect: (id: string) => void
}

const routes = Object.fromEntries(taxonomy.courseLines.map((line) => [line.id, line]))

const statusLabels = {
  locked: 'Not yet unlocked',
  available: 'Ready to start',
  'in-progress': 'In progress',
  completed: 'Completed',
}

function trackPath(from: LearningActivity, to: LearningActivity) {
  const { x: startX, y: startY } = from.position
  const { x: endX, y: endY } = to.position
  if (startY === endY) return `M ${startX} ${startY} H ${endX}`
  const bend = startX + (endX - startX) * .45
  return `M ${startX} ${startY} H ${bend} L ${endX} ${endY}`
}

export default function CoursePage({ sessions, onSelect }: Props) {
  const [contentFilter, setContentFilter] = useState(allContent)
  const lessons = allLessons.filter((lesson) => matchesContent(lesson, contentFilter))
  const suggested = getNextLesson(sessions, lessons)
  const [selectedId, setSelectedId] = useState(() => suggested?.id ?? lessons[0]?.id)
  const selected = lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0]
  const completed = lessons.filter((lesson) => activityStatus(lesson, sessions) === 'completed').length
  const next = suggested ?? lessons[0]

  if (!selected || !next) return <main className="course-page"><h1>Your Chinese journey</h1><ContentFilters id="course" value={contentFilter} onChange={setContentFilter} /><p>No lessons match this level and difficulty yet.</p><button type="button" onClick={() => setContentFilter(allContent)}>Show all lessons</button></main>

  const selectedStatus = activityStatus(selected, sessions)
  const nextSession = getLatestSession(next.id, sessions)
  const latestSession = getLatestSession(selected.id, sessions)
  const latestScore = latestSession?.finishedAt ? sessionScore(selected, latestSession) : null
  const prerequisites = selected.prerequisites.map((id) => allLessons.find((lesson) => lesson.id === id)).filter((lesson) => lesson !== undefined)
  const mapWidth = Math.max(1000, ...lessons.map((lesson) => lesson.position.x + 120))
  const mapHeight = Math.max(470, ...lessons.map((lesson) => lesson.position.y + 120))

  return (
    <main className="course-page">
      <div className="course-heading">
        <div>
          <h1>Your Chinese journey</h1>
          <p>A short course in sounds, useful words and your first sentences. Take it one stop at a time.</p>
        </div>
        <div className="course-progress" aria-label={`${completed} of ${lessons.length} lessons completed`}>
          <strong>{completed}<span> / {lessons.length}</span></strong>
          <span>stops completed</span>
          <progress aria-label="Course completion" value={completed} max={lessons.length} />
        </div>
      </div>
      <ContentFilters id="course" value={contentFilter} onChange={setContentFilter} />

      <section className="course-next" aria-label="Recommended lesson">
        <div className="course-next-symbol" lang="zh-CN" aria-hidden="true">{completed === lessons.length ? '成' : '学'}</div>
        <div>
          <p>{completed === lessons.length ? 'You have reached the end of this starter course' : nextSession && !nextSession.finishedAt ? 'Pick up where you left off' : 'Your next stop'}</p>
          <h2>{completed === lessons.length ? 'Keep your first Chinese fresh' : next.title}</h2>
          <span>{completed === lessons.length ? 'Revisit a station or try a mixed exercise.' : `${next.minutes} min · a little learning, then a short review`}</span>
        </div>
        <button type="button" onClick={() => onSelect(next.id)}>{completed === lessons.length ? 'Revisit first lesson' : activityStatus(next, sessions) === 'in-progress' ? 'Continue lesson' : 'Start lesson'}</button>
      </section>

      <div className="course-layout">
        <section className="course-network" aria-labelledby="course-map-heading">
          <div className="course-map-heading"><h2 id="course-map-heading">Find your next stop</h2><span>Platform course · {taxonomy.courseLines.length} connected lines</span></div>
          <ul className="course-lines" aria-label="Course lines">
            {Object.entries(routes).map(([id, route]) => <li key={id} style={{ '--route-color': route.color } as CSSProperties}><span aria-hidden="true" />{route.title}</li>)}
          </ul>

          <div className="course-map">
            <svg className="course-tracks" viewBox={`0 0 ${mapWidth} ${mapHeight}`} preserveAspectRatio="none" aria-hidden="true">
              <defs><pattern id="course-map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.2" fill="#d8e2d5" /></pattern></defs>
              <rect width={mapWidth} height={mapHeight} fill="url(#course-map-grid)" />
              {lessons.flatMap((lesson) => lesson.prerequisites.map((id) => {
                const previous = lessons.find((item) => item.id === id)
                return previous ? <path key={`${id}-${lesson.id}`} d={trackPath(previous, lesson)} fill="none" stroke={routes[lesson.line].color} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" /> : null
              }))}
            </svg>
            <ol className="course-stations" aria-label="Lessons on the course map">
              {lessons.map((lesson, index) => {
                const status = activityStatus(lesson, sessions)
                return (
                  <li key={lesson.id} className={`course-station-wrap is-${status}`} style={{ '--station-x': `${lesson.position.x / mapWidth * 100}%`, '--station-y': `${lesson.position.y / mapHeight * 100}%`, '--route-color': routes[lesson.line].color } as CSSProperties}>
                    <button type="button" className={`course-station${suggested?.id === lesson.id ? ' is-next' : ''}`} aria-pressed={selected.id === lesson.id} aria-label={`Lesson ${index + 1}: ${lesson.title}. ${statusLabels[status]}. Select to see details.`} onClick={() => setSelectedId(lesson.id)}>
                      <span className="course-station-dot" aria-hidden="true">{status === 'completed' ? '✓' : index + 1}</span>
                      <span className="course-station-label"><strong>{lesson.title}</strong><span>{statusLabels[status]}</span></span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
          <div className="course-map-key" aria-label="Station status legend"><span><i className="course-key-current" aria-hidden="true" />Next stop</span><span><i className="course-key-done" aria-hidden="true">✓</i>Completed</span><span><i className="course-key-locked" aria-hidden="true" />Preview available</span></div>
          <p className="course-map-note">Score at least 80% independently in the review to unlock the linked stops. At the fork, explore both branches before the final checkpoint. You can preview any stop.</p>
        </section>

        <aside className="course-preview" aria-labelledby="course-preview-title">
          <div className="course-preview-route" style={{ '--route-color': routes[selected.line].color } as CSSProperties}><span lang="zh-CN" aria-hidden="true">{routes[selected.line].symbol}</span>{routes[selected.line].title}</div>
          <p className={`course-state is-${selectedStatus}`}>{statusLabels[selectedStatus]} · {selected.minutes} min</p>
          <h2 id="course-preview-title">{selected.title}</h2>
          <p className="content-classification">{levelLabel(selected.languageLevel)} · {difficultyLabel(selected.difficulty)}</p>
          <p>{selected.description}</p>
          <h3>At this stop</h3>
          <ul className="course-objectives">{selected.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
          {latestScore && <p className="course-last-result">Last review: <strong>{latestScore.correct} / {latestScore.total}</strong>{latestScore.passed ? ' · Passed' : ' · Try again when ready'}</p>}
          {selectedStatus === 'locked' && <div className="course-unlock"><strong>First, complete</strong><ul>{prerequisites.map((lesson) => <li key={lesson.id}>{lesson.title}{activityStatus(lesson, sessions) === 'completed' ? ' ✓' : ''}</li>)}</ul></div>}
          <button type="button" onClick={() => onSelect(selected.id)}>{selectedStatus === 'locked' ? 'Preview lesson' : selectedStatus === 'completed' ? 'Review lesson' : selectedStatus === 'in-progress' ? 'Continue lesson' : 'Start lesson'}</button>
          <p className="course-mastery-note">Completion records this lesson&apos;s review. It is not a verified score of pronunciation or tone mastery.</p>
        </aside>
      </div>
    </main>
  )
}

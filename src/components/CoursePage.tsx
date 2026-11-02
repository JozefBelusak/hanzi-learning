import { useState, type CSSProperties } from 'react'
import { lessons as allLessons } from '../data/learning'
import { activityStatus, getLatestSession, getNextLesson, sessionScore } from '../lib/learning'
import type { LearningActivity, LearningSession } from '../types/learning'
import './CoursePage.css'
import { taxonomy, difficultyLabel, levelLabel } from '../data/taxonomy'
import ContentFilters from './ContentFilters'
import CoursePathPicker from './CoursePathPicker'
import { coursePaths } from '../data/coursePaths'
import type { LanguageLevel } from '../types/content'
import { matchesContent, type ContentFilter } from '../lib/contentFilter'
import { layoutCourseMap } from '../lib/courseMap'

type Props = {
  sessions: LearningSession[]
  onSelect: (id: string) => void
  level: LanguageLevel | 'all'
  difficulty: ContentFilter['difficulty']
  onFilterChange: (value: ContentFilter) => void
  previewOnly?: boolean
}

const routes = Object.fromEntries(taxonomy.courseLines.map((line) => [line.id, line]))

const statusLabels = {
  locked: 'Not yet unlocked',
  available: 'Ready to start',
  'in-progress': 'In progress',
  completed: 'Completed',
}

function trackPath(from: LearningActivity['position'], to: LearningActivity['position']) {
  const { x: startX, y: startY } = from
  const { x: endX, y: endY } = to
  if (startY === endY) return `M ${startX} ${startY} H ${endX}`
  const bend = startX + (endX - startX) * .45
  return `M ${startX} ${startY} H ${bend} L ${endX} ${endY}`
}

export default function CoursePage({ sessions, onSelect, level, difficulty, onFilterChange, previewOnly = false }: Props) {
  const contentFilter: ContentFilter = { languageLevel: level, difficulty }
  const setContentFilter = onFilterChange
  const path = coursePaths.find((item) => item.level === level)!
  const picker = <CoursePathPicker value={level} lessons={allLessons} sessions={sessions} previewOnly={previewOnly} onChange={(languageLevel) => setContentFilter({ ...contentFilter, languageLevel })} />
  const lessons = allLessons.filter((lesson) => matchesContent(lesson, contentFilter))
  const suggested = getNextLesson(sessions, lessons)
  const [selectedId, setSelectedId] = useState(() => suggested?.id ?? lessons[0]?.id)
  const selected = lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0]
  const completed = lessons.filter((lesson) => activityStatus(lesson, sessions) === 'completed').length
  const next = suggested ?? lessons[0]

  if (level === 'all') return <main className="course-page course-overview">
    <div className="course-heading"><div><h1>Your Chinese journey</h1></div><div className="course-overview-count"><strong>{allLessons.length}</strong><span>lessons across {coursePaths.length} paths</span></div></div>
    {picker}
  </main>

  if (!selected || !next) return <main className="course-page"><h1>Your Chinese journey</h1>{picker}<ContentFilters id="course" value={contentFilter} onChange={setContentFilter} showLevel={false} /><p>No lessons match this level and difficulty yet.</p><button type="button" onClick={() => setContentFilter({ languageLevel: level, difficulty: 'all' })}>Show all lessons</button></main>

  const selectedStatus = activityStatus(selected, sessions)
  const nextSession = getLatestSession(next.id, sessions)
  const latestSession = getLatestSession(selected.id, sessions)
  const latestScore = latestSession?.finishedAt ? sessionScore(selected, latestSession) : null
  const prerequisites = selected.prerequisites.map((id) => allLessons.find((lesson) => lesson.id === id)).filter((lesson) => lesson !== undefined)
  const map = layoutCourseMap(lessons)
  const mapWidth = map.width
  const mapHeight = map.height
  const visibleRoutes = Object.entries(routes).filter(([id]) => lessons.some((lesson) => lesson.line === id))

  return (
    <main className="course-page">
      <div className="course-heading">
        <div>
          <h1>Your Chinese journey</h1>
        </div>
        {previewOnly ? <div className="course-progress"><strong>{lessons.length}</strong><span>lessons to explore</span></div> : <div className="course-progress" aria-label={`${completed} of ${lessons.length} lessons completed`}>
          <strong>{completed}<span> / {lessons.length}</span></strong>
          <span>stops completed</span>
          <progress aria-label="Course completion" value={completed} max={lessons.length} />
        </div>}
      </div>
      {picker}<ContentFilters id="course" value={contentFilter} onChange={setContentFilter} showLevel={false} />

      <section className="course-next" aria-label="Recommended lesson">
        <div className="course-next-symbol" lang="zh-CN" aria-hidden="true">{completed === lessons.length ? '成' : '学'}</div>
        <div>
          <p>{completed === lessons.length ? 'You have reached the end of this path' : nextSession && !nextSession.finishedAt ? 'Pick up where you left off' : 'Your next stop'}</p>
          <h2>{completed === lessons.length ? 'Path completed' : next.title}</h2>
          {completed !== lessons.length && <span>{next.minutes} min</span>}
        </div>
        <button type="button" onClick={() => onSelect(next.id)}>{previewOnly ? 'Preview lesson' : completed === lessons.length ? 'Revisit first lesson' : activityStatus(next, sessions) === 'in-progress' ? 'Continue lesson' : 'Start lesson'}</button>
      </section>

      <div className="course-layout">
        <section className="course-network" aria-labelledby="course-map-heading">
          <div className="course-map-heading"><h2 id="course-map-heading">{path.title}</h2><span>{levelLabel(level)} path · {lessons.length} stops</span></div>
          <ul className="course-lines" aria-label="Course lines">
            {visibleRoutes.map(([id, route]) => <li key={id} style={{ '--route-color': route.color } as CSSProperties}><span aria-hidden="true" />{route.title}</li>)}
          </ul>

          <div key={`${level}:${difficulty}`} className="course-map-scroll" role="region" aria-label={`${levelLabel(level)} course map`} tabIndex={0}>
          <div className="course-map" style={{ '--course-columns': `${map.columns}`, '--course-map-height': `${mapHeight}px` } as CSSProperties}>
            <svg className="course-tracks" viewBox={`0 0 ${mapWidth} ${mapHeight}`} preserveAspectRatio="none" aria-hidden="true">
              <defs><pattern id="course-map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.2" fill="#d8e2d5" /></pattern></defs>
              <rect width={mapWidth} height={mapHeight} fill="url(#course-map-grid)" />
              {lessons.flatMap((lesson) => lesson.prerequisites.map((id) => {
                const previous = lessons.find((item) => item.id === id)
                return previous ? <path key={`${id}-${lesson.id}`} d={trackPath(map.positions.get(previous.id)!, map.positions.get(lesson.id)!)} fill="none" stroke={routes[lesson.line].color} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" /> : null
              }))}
            </svg>
            <ol className="course-stations" aria-label="Lessons on the course map">
              {lessons.map((lesson, index) => {
                const status = activityStatus(lesson, sessions)
                const position = map.positions.get(lesson.id)!
                return (
                  <li key={lesson.id} className={`course-station-wrap is-${status}`} style={{ '--station-x': `${position.x / mapWidth * 100}%`, '--station-y': `${position.y / mapHeight * 100}%`, '--route-color': routes[lesson.line].color } as CSSProperties}>
                    <button type="button" className={`course-station${suggested?.id === lesson.id ? ' is-next' : ''}`} aria-controls="course-preview" aria-pressed={selected.id === lesson.id} aria-label={`Lesson ${index + 1}: ${lesson.title}. ${statusLabels[status]}. Select to see details.`} onClick={() => setSelectedId(lesson.id)}>
                      <span className="course-station-dot" aria-hidden="true">{status === 'completed' ? '✓' : index + 1}</span>
                      <span className="course-station-label"><strong title={lesson.title}>{lesson.title}</strong><span>{statusLabels[status]}</span></span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
          </div>
          <div className="course-map-key" aria-label="Station status legend"><span><i className="course-key-current" aria-hidden="true" />Next stop</span><span><i className="course-key-done" aria-hidden="true">✓</i>Completed</span><span><i className="course-key-locked" aria-hidden="true" />Preview available</span></div>
          <details className="course-map-help"><summary>How lessons unlock</summary><p>Score at least 80% without hints to unlock linked stops. Complete both branches before their checkpoint.</p></details>
        </section>

        <aside id="course-preview" className="course-preview" aria-labelledby="course-preview-title">
          <div className="course-preview-main">
          <div className="course-preview-route" style={{ '--route-color': routes[selected.line].color } as CSSProperties}><span lang="zh-CN" aria-hidden="true">{routes[selected.line].symbol}</span>{routes[selected.line].title}</div>
          <p className={`course-state is-${selectedStatus}`}>{statusLabels[selectedStatus]} · {selected.minutes} min</p>
          <h2 id="course-preview-title">{selected.title}</h2>
          <p className="content-classification">{levelLabel(selected.languageLevel)} · {difficultyLabel(selected.difficulty)}</p>
          </div>
          <div className="course-preview-details">
          <h3>At this stop</h3>
          <ul className="course-objectives">{selected.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
          {latestScore && <p className="course-last-result">Last review: <strong>{latestScore.correct} / {latestScore.total}</strong>{latestScore.passed ? ' · Passed' : ' · Try again when ready'}</p>}
          {selectedStatus === 'locked' && <div className="course-unlock"><strong>First, complete</strong><ul>{prerequisites.map((lesson) => <li key={lesson.id}>{lesson.title}{activityStatus(lesson, sessions) === 'completed' ? ' ✓' : ''}</li>)}</ul></div>}
          </div>
          <div className="course-preview-actions">
          <button type="button" onClick={() => onSelect(selected.id)}>{previewOnly || selectedStatus === 'locked' ? 'Preview lesson' : selectedStatus === 'completed' ? 'Review lesson' : selectedStatus === 'in-progress' ? 'Continue lesson' : 'Start lesson'}</button>
          <details className="course-mastery-note"><summary>About this lesson</summary><p>{selected.description}</p><p>Completion records this lesson&apos;s review, not verified pronunciation or tone mastery.</p></details>
          </div>
        </aside>
      </div>
    </main>
  )
}

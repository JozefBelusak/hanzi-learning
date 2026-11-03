import { useEffect, useState } from 'react'
import { findLesson, listLessons, platformError } from '../lib/platform'
import type { PublicLesson } from '../types/auth'
import './PlatformPages.css'
import { difficultyLabel, levelLabel } from '../data/taxonomy'
import ContentFilters from './ContentFilters'
import { allContent, matchesContent, type ContentFilter } from '../lib/contentFilter'

export default function PublicLessonsPage({ lessonId, onSelect, onBack, filter, onFilterChange, profileFilter }: { lessonId?: string; onSelect: (id: string) => void; onBack: () => void; filter: ContentFilter; onFilterChange: (filter: ContentFilter) => void; profileFilter: ContentFilter }) {
  const [lessons, setLessons] = useState<PublicLesson[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const visible = lessons.filter((lesson) => matchesContent(lesson, filter))
  useEffect(() => {
    let active = true
    const request = lessonId ? findLesson(lessonId).then((lesson) => [lesson]) : listLessons(true)
    void request.then((result) => { if (active) setLessons(result) }).catch((failure: unknown) => { if (active) setError(platformError(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [lessonId, revision])
  return <main className="platform-page">
    {lessonId && <button type="button" className="back-button" onClick={onBack}>Back to public lessons</button>}
    <h1>{lessonId && lessons[0] ? lessons[0].title : 'Public lessons'}</h1>
    {!lessonId && <ContentFilters id="public-lessons" value={filter} onChange={onFilterChange} profileFilter={profileFilter} />}
    {loading && <p role="status">Loading lessons…</p>}
    {error && <div role="alert" className="error-message"><p>{error}</p><button type="button" onClick={() => { setError(null); setLoading(true); setRevision((value) => value + 1) }}>Try again</button></div>}
    {!loading && !error && !lessons.length && <p>No lessons have been published yet. The starter course and free practice are available from the main navigation.</p>}
    {!lessonId && !loading && !error && lessons.length > 0 && !visible.length && <div><p>No public lessons match this level and difficulty.</p><button type="button" className="secondary-btn" onClick={() => onFilterChange(allContent)}>Show all public lessons</button></div>}
    {lessonId ? lessons[0] && !error && <article className="card-surface lesson-reader"><p className="content-classification">Lecturer lesson · {levelLabel(lessons[0].languageLevel)} · {difficultyLabel(lessons[0].difficulty)}</p><p>{lessons[0].summary}</p><div className="lesson-body">{lessons[0].content}</div></article> :
      <section className="published-lesson-list">{visible.map((lesson) => <article className="card-surface" key={lesson.id}><h2>{lesson.title}</h2><p className="content-classification">{levelLabel(lesson.languageLevel)} · {difficultyLabel(lesson.difficulty)}</p><p>{lesson.summary}</p><button type="button" onClick={() => onSelect(lesson.id)}>Read lesson</button></article>)}</section>}
  </main>
}

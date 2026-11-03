import { useEffect, useState, type FormEvent } from 'react'
import { deleteLesson, listLessons, platformError, saveLesson, type LessonDraft } from '../lib/platform'
import type { PublicLesson, UserProfile } from '../types/auth'
import { difficulties, languageLevels, difficultyLabel, levelLabel } from '../data/taxonomy'
import { documentForLesson } from '../lib/lessonBlocks'
import LessonBlockEditor from './LessonBlockEditor'
import LessonBlockPreview from './LessonBlockPreview'
import './LessonBlocks.css'

const blank = (): LessonDraft => ({ title: '', summary: '', content: '', blocks: { schemaVersion: 1, blocks: [] }, published: false, languageLevel: 'beginner', difficulty: 'balanced' })

export default function LessonManager({ profile, onRead }: { profile: UserProfile; onRead: (id: string) => void }) {
  const [lessons, setLessons] = useState<PublicLesson[]>([])
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  const [draft, setDraft] = useState<LessonDraft>(blank)
  const [baseline, setBaseline] = useState('')
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [legacy, setLegacy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const dirty = editing !== undefined && JSON.stringify(draft) !== baseline
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function discard() { return !dirty || window.confirm('Discard unsaved lesson changes?') }
  function open(lesson?: PublicLesson, preview = false) {
    if (!discard()) return
    const next = lesson ? { title: lesson.title, summary: lesson.summary, content: lesson.content, blocks: documentForLesson(lesson), published: lesson.published, languageLevel: lesson.languageLevel, difficulty: lesson.difficulty } : blank()
    setDraft(next); setBaseline(JSON.stringify(next)); setEditing(lesson?.id ?? null); setView(preview ? 'preview' : 'edit'); setLegacy(Boolean(lesson && !lesson.blocks)); setMessage(''); setError(null)
  }
  useEffect(() => {
    let active = true
    void listLessons().then((data) => { if (active) setLessons(profile.role === 'admin' ? data : data.filter((lesson) => lesson.author_id === profile.id)) })
      .catch((failure: unknown) => { if (active) setError(platformError(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [profile.id, profile.role])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(null); setMessage('')
    try {
      const saved = await saveLesson({ ...draft, title: draft.title.trim(), summary: draft.summary.trim() }, editing ?? undefined)
      setLessons((current) => [saved, ...current.filter((lesson) => lesson.id !== saved.id)])
      setEditing(undefined); setDraft(blank()); setBaseline(''); setMessage('Lesson saved.')
    } catch (failure) { setError(failure instanceof Error && !('code' in failure) ? failure.message : platformError(failure)) }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (editing === id && !discard()) return
    if (!window.confirm('Delete this lesson? This cannot be undone.')) return
    setBusy(true); setError(null)
    try { await deleteLesson(id); setLessons((current) => current.filter((lesson) => lesson.id !== id)); if (editing === id) setEditing(undefined); setMessage('Lesson deleted.') }
    catch (failure) { setError(platformError(failure)) }
    finally { setBusy(false) }
  }
  return <section className="card-surface management-section" aria-label="Manage lessons">
    <div className="management-heading"><h2>{profile.role === 'admin' ? 'All authored lessons' : 'Your lessons'}</h2><button type="button" disabled={busy} onClick={() => open()}>New lesson</button></div>
    {loading && <p role="status">Loading lessons…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="status-message">{message}</p>}
    {editing !== undefined && <div className="lecturer-lesson-editor">
      <header className="lesson-editor-toolbar"><div><h3>{editing ? 'Edit lesson' : 'New lesson'}</h3><small>{draft.published ? 'Published lesson' : 'Draft'}{dirty ? ' · Unsaved changes' : ''}</small></div><nav aria-label="Lesson editor view"><button type="button" className="secondary-btn" aria-pressed={view === 'edit'} disabled={busy} onClick={() => setView('edit')}>Edit blocks</button><button type="button" className="secondary-btn" aria-pressed={view === 'preview'} disabled={busy} onClick={() => setView('preview')}>Preview lesson</button></nav></header>
      {legacy && <p className="lesson-legacy-note">This text lesson opens as an explanation block. Your original text is preserved; blocks are stored when you save.</p>}
      {view === 'edit' ? <form noValidate className="management-form lesson-author-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="lesson-author-fields" disabled={busy}>
          <label>Title<input required maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label>Summary<input maxLength={500} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
          <div className="editor-columns"><label>Lesson language level<select aria-label="Lesson language level" value={draft.languageLevel} onChange={(event) => setDraft({ ...draft, languageLevel: event.target.value as LessonDraft['languageLevel'] })}>{languageLevels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label>
          <label>Lesson difficulty<select aria-label="Lesson difficulty" value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as LessonDraft['difficulty'] })}>{difficulties.map((difficulty) => <option key={difficulty.id} value={difficulty.id}>{difficulty.label}</option>)}</select></label></div>
          <LessonBlockEditor document={draft.blocks!} onChange={(blocks) => setDraft({ ...draft, blocks })} />
          <footer className="lesson-editor-footer"><label className="checkbox-field"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /> Publish to all signed-in learners</label><small>Drafts may be unfinished. Complete every block before publishing. Published lessons retain a readable text version.</small><div className="action-row"><button type="submit">{busy ? 'Saving…' : 'Save lesson'}</button><button type="button" className="text-btn" onClick={() => { if (discard()) setEditing(undefined) }}>Cancel editing</button></div></footer>
        </fieldset>
      </form> : <LessonBlockPreview document={draft.blocks!} title={draft.title} summary={draft.summary} />}
    </div>}
    <ul className="management-list">{lessons.map((lesson) => <li key={lesson.id}><div><strong>{lesson.title}</strong><small>{lesson.published ? 'Published' : 'Draft'} · {levelLabel(lesson.languageLevel)} · {difficultyLabel(lesson.difficulty)} · {lesson.blocks ? `${lesson.blocks.blocks.length} blocks` : 'Text lesson'}</small></div><div className="action-row"><button type="button" className="text-btn" disabled={busy} onClick={() => open(lesson, true)}>Preview</button><button type="button" className="secondary-btn" disabled={busy} onClick={() => open(lesson)}>Edit</button>{lesson.published && <button type="button" className="text-btn" disabled={busy} onClick={() => { if (discard()) onRead(lesson.id) }}>Open public page</button>}<button type="button" className="text-btn" disabled={busy} onClick={() => void remove(lesson.id)}>Delete</button></div></li>)}</ul>
    {!loading && !lessons.length && <p>Create your first lesson. Drafts are visible only to their lecturer and administrators.</p>}
  </section>
}

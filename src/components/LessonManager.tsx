import { useEffect, useState, type FormEvent } from 'react'
import { deleteLesson, listLessons, platformError, saveLesson, type LessonDraft } from '../lib/platform'
import type { PublicLesson, UserProfile } from '../types/auth'

const blank: LessonDraft = { title: '', summary: '', content: '', published: false }

export default function LessonManager({ profile, onRead }: { profile: UserProfile; onRead: (id: string) => void }) {
  const [lessons, setLessons] = useState<PublicLesson[]>([])
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  const [draft, setDraft] = useState<LessonDraft>(blank)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  async function refresh() {
    const data = await listLessons()
    setLessons(profile.role === 'admin' ? data : data.filter((lesson) => lesson.author_id === profile.id))
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
      await saveLesson({ ...draft, title: draft.title.trim(), summary: draft.summary.trim(), content: draft.content.trim() }, editing ?? undefined)
      setEditing(undefined); setDraft(blank); await refresh(); setMessage('Lesson saved.')
    } catch (failure) { setError(platformError(failure)) }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this lesson? This cannot be undone.')) return
    setBusy(true); setError(null)
    try { await deleteLesson(id); await refresh(); setMessage('Lesson deleted.') }
    catch (failure) { setError(platformError(failure)) }
    finally { setBusy(false) }
  }
  return <section className="card-surface management-section" aria-label="Manage lessons">
    <div className="management-heading"><h2>{profile.role === 'admin' ? 'All authored lessons' : 'Your lessons'}</h2><button type="button" disabled={busy} onClick={() => { setEditing(null); setDraft(blank); setMessage('') }}>New lesson</button></div>
    {loading && <p role="status">Loading lessons…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="status-message">{message}</p>}
    {editing !== undefined && <form className="management-form" onSubmit={(event) => void submit(event)}>
      <h3>{editing ? 'Edit lesson' : 'New lesson'}</h3>
      <label htmlFor="lesson-title">Title</label><input id="lesson-title" required maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} disabled={busy} />
      <label htmlFor="lesson-summary">Summary</label><input id="lesson-summary" maxLength={500} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} disabled={busy} />
      <label htmlFor="lesson-content">Lesson content</label><textarea id="lesson-content" rows={10} required maxLength={50000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} disabled={busy} />
      <small>Write explanations, Chinese examples and translations. Paragraphs are preserved.</small>
      <label className="checkbox-field"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} disabled={busy} /> Publish to all signed-in learners</label>
      <div className="action-row"><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save lesson'}</button><button type="button" className="secondary-btn" disabled={busy} onClick={() => setEditing(undefined)}>Cancel editing</button></div>
    </form>}
    <ul className="management-list">{lessons.map((lesson) => <li key={lesson.id}><div><strong>{lesson.title}</strong><small>{lesson.published ? 'Published' : 'Draft'}</small></div><div className="action-row"><button type="button" className="text-btn" onClick={() => onRead(lesson.id)}>Preview</button><button type="button" className="secondary-btn" disabled={busy} onClick={() => { setEditing(lesson.id); setDraft({ title: lesson.title, summary: lesson.summary, content: lesson.content, published: lesson.published }); setMessage('') }}>Edit</button><button type="button" className="text-btn" disabled={busy} onClick={() => void remove(lesson.id)}>Delete</button></div></li>)}</ul>
    {!loading && !lessons.length && <p>Create your first lesson. Drafts are visible only to their lecturer and administrators.</p>}
  </section>
}

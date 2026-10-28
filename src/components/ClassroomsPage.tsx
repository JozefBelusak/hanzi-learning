import { useEffect, useState, type FormEvent } from 'react'
import { createClassroom, joinClassroom, listClassrooms, listMembers, platformError, removeClassroom, removeMember } from '../lib/platform'
import type { Classroom, UserProfile } from '../types/auth'

type Member = Awaited<ReturnType<typeof listMembers>>[number]

export default function ClassroomsPage({ profile, embedded = false }: { profile: UserProfile; embedded?: boolean }) {
  const manage = profile.role !== 'student'
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    void listClassrooms().then((data) => { if (active) setClassrooms(data) }).catch((failure: unknown) => { if (active) setError(platformError(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function run(action: () => Promise<void>, success: string) {
    if (busy) return
    setBusy(true); setError(null); setMessage('')
    try { await action(); setClassrooms(await listClassrooms()); setMessage(success) }
    catch (failure) { setError(platformError(failure)) }
    finally { setBusy(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    await run(async () => { if (manage) await createClassroom(name); else await joinClassroom(name); setName('') }, manage ? 'Classroom created.' : 'You joined the classroom.')
  }
  async function openMembers(id: string) {
    await run(async () => { setMembers(await listMembers(id)); setSelected(id) }, '')
  }
  const content = <>
    {embedded ? <h2>Classrooms and students</h2> : <h1>Your classrooms</h1>}
    <p>{manage ? 'Create a classroom and share its invitation code with students. You can view and remove students in your own classrooms.' : 'Join a lecturer’s classroom using their invitation code.'}</p>
    <form className="action-row classroom-create" onSubmit={(event) => void submit(event)}><label htmlFor="classroom-input">{manage ? 'Classroom name' : 'Invitation code'}</label><input id="classroom-input" required maxLength={manage ? 100 : 100} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /><button type="submit" disabled={busy}>{manage ? 'Create classroom' : 'Join classroom'}</button></form>
    {loading && <p role="status">Loading classrooms…</p>}{error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="status-message">{message}</p>}
    <ul className="management-list">{classrooms.map((classroom) => <li key={classroom.id}><div><strong>{classroom.name}</strong>{manage && <small>Invitation code: <code>{classroom.join_code}</code></small>}</div><div className="action-row">{manage ? <><button type="button" className="secondary-btn" disabled={busy} onClick={() => void openMembers(classroom.id)}>Manage students</button><button type="button" className="text-btn" disabled={busy} onClick={() => { if (window.confirm('Delete this classroom and its memberships?')) void run(async () => { await removeClassroom(classroom.id); if (selected === classroom.id) setSelected(null) }, 'Classroom deleted.') }}>Delete classroom</button></> : <button type="button" className="secondary-btn" disabled={busy} onClick={() => void run(() => removeMember(classroom.id, profile.id), 'You left the classroom.')}>Leave classroom</button>}</div></li>)}</ul>
    {manage && selected && <section className="roster" aria-label="Classroom students"><h3>{classrooms.find((classroom) => classroom.id === selected)?.name} · students</h3>{!members.length && <p>No students have joined this classroom yet.</p>}<ul className="management-list">{members.map(({ membership, profile: student }) => <li key={student.id}><div><strong>{student.display_name}</strong><small>{student.email}</small></div><button type="button" className="secondary-btn" disabled={busy} onClick={() => void run(async () => { await removeMember(membership.classroom_id, student.id); setMembers(await listMembers(membership.classroom_id)) }, 'Student removed from the classroom.')}>Remove from classroom</button></li>)}</ul></section>}
  </>
  return embedded ? <section className="card-surface management-section" aria-label="Manage classrooms">{content}</section> : <main className="platform-page">{content}</main>
}

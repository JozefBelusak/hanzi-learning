import { useEffect, useState, type FormEvent } from 'react'
import { changeRole, listUsers, platformError } from '../lib/platform'
import { roleLabels } from '../lib/access'
import type { UserProfile, UserRole } from '../types/auth'
import LessonManager from './LessonManager'
import ClassroomsPage from './ClassroomsPage'
import './PlatformPages.css'

function UserRoles({ onOwnRoleChange, ownId }: { onOwnRoleChange: () => void; ownId: string }) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void listUsers().then((data) => { if (active) setUsers(data) }).catch((failure: unknown) => { if (active) setError(platformError(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function update(event: FormEvent<HTMLFormElement>, user: UserProfile) {
    event.preventDefault()
    if (busy) return
    const value = new FormData(event.currentTarget).get('role') as UserRole
    if (value === user.role) return
    if (!window.confirm(`Change ${user.display_name} to ${roleLabels[value]}?`)) return
    setBusy(true); setError(null); setMessage('')
    try {
      await changeRole(user.id, value)
      if (user.id === ownId) onOwnRoleChange()
      else { setUsers(await listUsers()); setMessage('Role updated.') }
    } catch (failure) { setError(platformError(failure)) }
    finally { setBusy(false) }
  }
  const filtered = users.filter((user) => `${user.display_name} ${user.email}`.toLowerCase().includes(query.toLowerCase().trim()))
  return <section className="card-surface management-section" aria-label="Manage users"><h2>Users and roles</h2><p>New registrations are students. Only administrators can grant Lecturer or Admin access.</p>
    <label htmlFor="user-search">Find a user</label><input id="user-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
    {loading && <p role="status">Loading users…</p>}{error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="status-message">{message}</p>}
    <ul className="management-list">{filtered.map((user) => <li key={`${user.id}:${user.role}`}><div><strong>{user.display_name}{user.id === ownId ? ' (you)' : ''}</strong><small>{user.email}</small></div><form className="action-row" onSubmit={(event) => void update(event, user)}><select name="role" aria-label={`Role for ${user.email}`} defaultValue={user.role} disabled={busy}>{(['student', 'lecturer', 'admin'] as const).map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}</select><button type="submit" className="secondary-btn" disabled={busy}>Save role</button></form></li>)}</ul>
  </section>
}

export default function ManagementPage({ profile, admin, onRead, onRefreshAccount }: { profile: UserProfile; admin: boolean; onRead: (id: string) => void; onRefreshAccount: () => void }) {
  return <main className="platform-page"><h1>{admin ? 'Administration' : 'Lecturer workspace'}</h1><p>{admin ? 'Manage platform roles, authored lessons and classrooms.' : 'Publish lessons and work with your students.'}</p>
    {admin && <UserRoles ownId={profile.id} onOwnRoleChange={onRefreshAccount} />}
    <LessonManager profile={profile} onRead={onRead} />
    <ClassroomsPage profile={profile} embedded />
  </main>
}

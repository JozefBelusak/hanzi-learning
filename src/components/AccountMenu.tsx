import { useEffect, useId, useRef, useState } from 'react'
import { canTeach, roleLabels } from '../lib/access'
import type { UserProfile } from '../types/auth'
import './AccountMenu.css'

type AccountPage = 'lessons' | 'classes' | 'teach' | 'admin' | 'settings'

export default function AccountMenu({ profile, activePage, onNavigate, onLogout }: {
  profile: UserProfile; activePage: string; onNavigate: (page: AccountPage) => void; onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])

  function visit(page: AccountPage) { setOpen(false); onNavigate(page) }
  const links: { page: AccountPage; label: string; description: string; symbol: string }[] = [
    { page: 'lessons', label: 'Public lessons', description: 'Explore lessons from the community', symbol: '书' },
    { page: 'classes', label: 'Your classrooms', description: 'Learn together with your class', symbol: '人' },
    ...(canTeach(profile.role) ? [{ page: 'teach' as const, label: 'Lecturer workspace', description: 'Create lessons and guide students', symbol: '师' }] : []),
    ...(profile.role === 'admin' ? [{ page: 'admin' as const, label: 'Administration', description: 'Manage content and platform access', symbol: '管' }] : []),
    { page: 'settings', label: 'Profile and preferences', description: 'Your learning goals and account', symbol: '我' },
  ]
  return <div className="account-menu" ref={root} onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false)
  }}>
    <button className="account-trigger" type="button" ref={trigger} aria-label="Your account" aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
      <span className="account-avatar" aria-hidden="true">{Array.from(profile.display_name.trim())[0]?.toUpperCase() || 'H'}</span>
      <span className="account-trigger-name">{profile.display_name}</span>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && <section id={id} ref={panel} className="account-panel" role="dialog" aria-label="Your account">
      <div className="account-panel-heading"><div><strong>{profile.display_name}</strong><span className="account-role">{roleLabels[profile.role]}</span></div><button type="button" className="account-close" aria-label="Close account panel" onClick={() => { setOpen(false); trigger.current?.focus() }}>×</button></div>
      <div className="account-links">{links.map((link) => <button type="button" key={link.page} className="account-link" aria-label={link.label} aria-current={activePage === link.page || (link.page === 'lessons' && activePage === 'public-lesson') ? 'page' : undefined} onClick={() => visit(link.page)}><span className="account-link-symbol" lang="zh-CN" aria-hidden="true">{link.symbol}</span><span><strong>{link.label}</strong><small>{link.description}</small></span><span aria-hidden="true">↗</span></button>)}</div>
      <button type="button" className="account-signout" onClick={() => { setOpen(false); onLogout() }}>Sign out</button>
    </section>}
  </div>
}

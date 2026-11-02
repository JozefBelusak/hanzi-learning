import type { ReactNode } from 'react'

const navigation = [
  { page: 'home', label: 'Home', icon: 'M3 10 12 3 21 10 M5 9v12h5v-7h4v7h5V9' },
  { page: 'course', label: 'Course', icon: 'M5 4v16 M19 4v16 M5 7h14 M5 17h14 M12 7v10 M2 4h6 M16 20h6' },
  { page: 'exercises', label: 'Exercises', icon: 'M9 6h12 M9 12h12 M9 18h12 M2 5l2 2 3-3 M2 11l2 2 3-3 M2 17l2 2 3-3' },
  { page: 'topics', label: 'Practice', icon: 'M7 3h13v15H7z M4 6H2v15h13v-2 M10 8h7 M10 12h5' },
  { page: 'progress', label: 'Progress', icon: 'M4 20v-6h3v6 M10 20V9h3v11 M16 20V4h3v16 M2 20h20' },
  { page: 'settings', label: 'Settings', icon: 'M5 3v5 M5 14v7 M12 3v10 M12 19v2 M19 3v2 M19 11v10 M2 8h6v6H2z M9 13h6v6H9z M16 5h6v6h-6z' },
] as const

export default function AppHeader({ activePage, onNavigate, onHome, children }: {
  activePage: string; onNavigate: (page: typeof navigation[number]['page']) => void; onHome: () => void; children: ReactNode
}) {
  return <header className="app-header">
    <button className="brand" type="button" aria-label="Hanzi – Home" onClick={onHome}><span lang="zh-CN" aria-hidden="true">汉</span><span>Hanzi</span></button>
    <nav aria-label="Main navigation">
      {navigation.map((item) => <button key={item.page} className="nav-button" type="button" aria-current={activePage === item.page ? 'page' : undefined} onClick={() => onNavigate(item.page)}><svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg><span>{item.label}</span></button>)}
    </nav>
    {children}
  </header>
}

import { useEffect, useState, type ReactNode } from 'react'
import { catalog, installCatalog } from '../data/catalog'
import { fetchPlatformCatalog } from '../lib/contentApi'

export default function ContentGate({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void fetchPlatformCatalog(controller.signal).then((result) => {
      if (controller.signal.aborted) return
      installCatalog(result?.data ?? catalog, result?.revision ?? null)
      setReady(true)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [attempt])
  if (ready) return children
  return <main className="auth-page"><h1>{failed ? 'Learning content unavailable' : 'Opening your workspace…'}</h1>{failed ? <><p role="alert">The current catalog could not be loaded. Your saved progress has not been opened or replaced.</p><div className="action-row"><button type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1) }}>Try again</button><button className="secondary-btn" type="button" onClick={onLogout}>Sign out</button></div></> : <p role="status">Loading the published learning catalog…</p>}</main>
}

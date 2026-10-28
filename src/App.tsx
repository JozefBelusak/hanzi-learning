import { lazy, Suspense, useEffect, useState } from 'react'
import LandingPage from './components/LandingPage'
import AuthPage from './components/AuthPage'
import { parseRoute, routeHash, useNavigation } from './lib/navigation'
import { canAccessPage, isPublicPage, roleHome } from './lib/access'
import { useAuth } from './lib/useAuth'
import { accountError } from './lib/supabase'
import './App.css'

const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'))

export default function App() {
  const auth = useAuth()
  const navigation = useNavigation()
  const { route, navigate } = navigation
  const [logoutError, setLogoutError] = useState<string | null>(null)
  useEffect(() => {
    if (!auth.ready || auth.signingOut || (auth.session && !auth.profile)) return
    if (!auth.profile && !isPublicPage(route.page)) {
      try { sessionStorage.setItem('hanzi:after-login', routeHash(route)) } catch { /* Navigation still works without storage. */ }
      navigate({ page: 'login' }, true)
    } else if (auth.profile && isPublicPage(route.page)) {
      let destination: ReturnType<typeof parseRoute> = { page: roleHome(auth.profile.role) }
      try {
        const saved = sessionStorage.getItem('hanzi:after-login')
        sessionStorage.removeItem('hanzi:after-login')
        if (saved) {
          const candidate = parseRoute(saved)
          if (routeHash(candidate) === saved && !isPublicPage(candidate.page) && canAccessPage(auth.profile.role, candidate.page)) destination = candidate
        }
      } catch { /* Use the role's default destination. */ }
      navigate(destination, true)
    } else if (auth.profile && !canAccessPage(auth.profile.role, route.page)) navigate({ page: roleHome(auth.profile.role) }, true)
  }, [auth.ready, auth.signingOut, auth.session, auth.profile, route, navigate])

  async function logout() {
    setLogoutError(null)
    try {
      await auth.signOut()
      try { sessionStorage.removeItem('hanzi:after-login') } catch { /* Optional navigation state. */ }
      navigate({ page: 'login' }, true)
    } catch (error) { setLogoutError(accountError(error)) }
  }
  if (!auth.ready || auth.signingOut) return <main className="auth-page"><p role="status">{auth.signingOut ? 'Signing out…' : 'Checking your session…'}</p></main>
  if (auth.session && !auth.profile) return <main className="auth-page"><h1>Account unavailable</h1><p role="alert">{auth.error}</p>{logoutError && <p role="alert">{logoutError}</p>}<div className="action-row"><button type="button" onClick={auth.retry}>Try again</button><button type="button" className="secondary-btn" onClick={() => void logout()}>Sign out</button></div></main>
  if (!auth.profile) {
    if (route.page === 'welcome') return <LandingPage onStart={() => navigate({ page: 'login' })} />
    if (route.page !== 'login' && route.page !== 'register') return <main className="auth-page"><p role="status">Redirecting to sign in…</p></main>
    return <AuthPage key={route.page} mode={route.page} auth={auth} onSwitch={() => navigate({ page: route.page === 'login' ? 'register' : 'login' }, true)} onBack={() => navigate({ page: 'welcome' })} />
  }
  if (isPublicPage(route.page) || !canAccessPage(auth.profile.role, route.page)) return <main className="auth-page"><p role="status">Opening your workspace…</p></main>
  return <Suspense fallback={<main className="auth-page"><p role="status">Opening your workspace…</p></main>}><AuthenticatedApp key={auth.profile.id} profile={auth.profile} navigation={navigation} onLogout={() => void logout()} onRefreshAccount={auth.retry} logoutError={logoutError} /></Suspense>
}

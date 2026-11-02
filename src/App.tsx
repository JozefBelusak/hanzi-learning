import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import LandingPage from './components/LandingPage'
import AuthPage from './components/AuthPage'
import OnboardingPage from './components/OnboardingPage'
import ContentGate from './components/ContentGate'
import { subscribeCatalog, getCatalogSnapshot } from './data/catalog'
import { parseRoute, routeHash, useNavigation } from './lib/navigation'
import { canAccessPage, isPublicPage, roleHome } from './lib/access'
import { useAuth } from './lib/useAuth'
import { accountError } from './lib/supabase'
import { hasCompletedOnboarding } from './lib/profile'
import { isGuestRoute, withoutGuest } from './lib/guest'
import './App.css'

const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'))
const GuestApp = lazy(() => import('./GuestApp'))

export default function App() {
  useSyncExternalStore(subscribeCatalog, getCatalogSnapshot)
  const auth = useAuth()
  const navigation = useNavigation()
  const { route, navigate } = navigation
  const [logoutError, setLogoutError] = useState<string | null>(null)
  useEffect(() => {
    if (!auth.ready || auth.signingOut || (auth.session && !auth.profile)) return
    if (!auth.profile && !isPublicPage(route.page) && !isGuestRoute(route)) {
      try { if (route.page !== 'onboarding') sessionStorage.setItem('hanzi:after-login', routeHash(route)) } catch { /* Navigation still works without storage. */ }
      navigate({ page: 'login' }, true)
    } else if (auth.profile && !hasCompletedOnboarding(auth.profile)) {
      if (route.page !== 'onboarding') {
        try { if (!isPublicPage(route.page) && canAccessPage(auth.profile.role, route.page)) sessionStorage.setItem('hanzi:after-login', routeHash(withoutGuest(route))) } catch { /* Optional navigation state. */ }
        navigate({ page: 'onboarding' }, true)
      }
    } else if (auth.profile && (isPublicPage(route.page) || route.page === 'onboarding' || isGuestRoute(route))) {
      let destination: ReturnType<typeof parseRoute> = isGuestRoute(route) ? withoutGuest(route) : { page: roleHome(auth.profile.role) }
      try {
        const saved = sessionStorage.getItem('hanzi:after-login')
        sessionStorage.removeItem('hanzi:after-login')
        if (saved) {
          const candidate = parseRoute(saved)
          if (routeHash(candidate) === saved && !candidate.guest && candidate.page !== 'onboarding' && !isPublicPage(candidate.page) && canAccessPage(auth.profile.role, candidate.page)) destination = candidate
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
  function enterGuest() { navigate({ page: 'home', guest: true }) }
  function leaveGuest(mode: 'login' | 'register') {
    try { sessionStorage.setItem('hanzi:after-login', routeHash(withoutGuest(route))) } catch { /* Optional return destination. */ }
    navigate({ page: mode })
  }
  if (!auth.ready || auth.signingOut) return <main className="auth-page"><p role="status">{auth.signingOut ? 'Signing out…' : 'Checking your session…'}</p></main>
  if (auth.session && !auth.profile) return <main className="auth-page"><h1>Account unavailable</h1><p role="alert">{auth.error}</p>{logoutError && <p role="alert">{logoutError}</p>}<div className="action-row"><button type="button" onClick={auth.retry}>Try again</button><button type="button" className="secondary-btn" onClick={() => void logout()}>Sign out</button></div></main>
  if (!auth.profile) {
    if (route.page === 'welcome') return <LandingPage onStart={() => navigate({ page: 'login' })} onGuest={enterGuest} />
    if (isGuestRoute(route)) return <Suspense fallback={<main className="auth-page"><p role="status">Opening preview…</p></main>}><GuestApp navigation={navigation} onAuth={leaveGuest} /></Suspense>
    if (route.page !== 'login' && route.page !== 'register') return <main className="auth-page"><p role="status">Redirecting to sign in…</p></main>
    return <AuthPage key={route.page} mode={route.page} auth={auth} onSwitch={() => navigate({ page: route.page === 'login' ? 'register' : 'login' }, true)} onBack={() => navigate({ page: 'welcome' })} onGuest={enterGuest} />
  }
  if (!hasCompletedOnboarding(auth.profile)) return <OnboardingPage key={auth.profile.id} profile={auth.profile} onSave={auth.saveProfile} onLogout={() => void logout()} logoutError={logoutError} />
  if (route.page === 'onboarding' || isPublicPage(route.page) || isGuestRoute(route) || !canAccessPage(auth.profile.role, route.page)) return <main className="auth-page"><p role="status">Opening your workspace…</p></main>
  return <ContentGate key={auth.profile.id} onLogout={() => void logout()}><Suspense fallback={<main className="auth-page"><p role="status">Opening your workspace…</p></main>}><AuthenticatedApp key={auth.profile.id} profile={auth.profile} navigation={navigation} onLogout={() => void logout()} onRefreshAccount={auth.retry} onSaveProfile={auth.saveProfile} logoutError={logoutError} /></Suspense></ContentGate>
}

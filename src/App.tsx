import { useEffect, useRef, useState } from 'react'
import LandingPage from './components/LandingPage'
import HomePage from './components/HomePage'
import TopicsPage from './components/TopicsPage'
import LearningPage from './components/LearningPage'
import FlashcardsPage from './components/FlashcardsPage'
import SpeechPage from './components/SpeechPage'
import WritingPage from './components/WritingPage'
import SentencesPage from './components/SentencesPage'
import ProgressPage from './components/ProgressPage'
import SettingsPage from './components/SettingsPage'
import { filterCards } from './data/categories'
import { loadVocabulary, refreshVocabulary } from './lib/vocabulary'
import { useStudy } from './lib/useStudy'
import { useNavigation } from './lib/navigation'
import type { Card } from './types/study'
import './App.css'

export default function App() {
  const { route, navigate, back, hash } = useNavigation()
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refreshRef = useRef<AbortController | null>(null)
  const study = useStudy()

  useEffect(() => {
    const controller = new AbortController()
    loadVocabulary(controller.signal)
      .then((loaded) => { if (!controller.signal.aborted) setCards(loaded) })
      .catch(() => { if (!controller.signal.aborted) setLoadError('Could not load the vocabulary. Please try again.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [loadAttempt])

  useEffect(() => () => refreshRef.current?.abort(), [hash])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const heading = document.querySelector<HTMLElement>('main h1')
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
  }, [hash, loading, study.ready])

  async function updateVocabulary() {
    if (refreshing) return
    const controller = new AbortController()
    refreshRef.current = controller
    setRefreshing(true)
    setNotice(null)
    try {
      const updated = await refreshVocabulary(controller.signal)
      if (!controller.signal.aborted) {
        setCards(updated)
        setRevision((value) => value + 1)
        setNotice('Vocabulary refreshed.')
      }
    } catch {
      if (!controller.signal.aborted) setNotice('Vocabulary refresh failed. You can keep practising your saved words.')
    } finally {
      if (refreshRef.current === controller) { setRefreshing(false); refreshRef.current = null }
    }
  }

  if (route.page === 'welcome') return <LandingPage onStart={() => navigate({ page: 'home' }, true)} />
  const learn = () => navigate({ page: 'topics' })
  const home = () => navigate({ page: 'home' })
  const selected = 'category' in route ? filterCards(cards, route.category) : cards
  const deckKey = `${'category' in route ? route.category : 'all'}:${revision}`
  const activePage = route.page === 'topics' || route.page === 'modes' || route.page === 'practice' ? 'topics' : route.page
  let content

  if (loading || !study.ready) {
    content = <main className="practice-page"><p role="status">Loading…</p></main>
  } else if (loadError || !cards.length) {
    content = <main className="practice-page"><h1>Vocabulary unavailable</h1><p role="alert">{loadError}</p><button type="button" onClick={() => { setLoading(true); setLoadError(null); setLoadAttempt((value) => value + 1) }}>Try again</button></main>
  } else if (route.page === 'practice') {
    const returnToModes = () => back({ page: 'modes', category: route.category })
    if (route.mode === 'flashcards') content = <FlashcardsPage key={deckKey} cards={selected} study={study.data} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'speech') content = <SpeechPage key={deckKey} cards={selected} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'writing') content = <WritingPage key={deckKey} cards={selected} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'sentences') content = <SentencesPage onBack={returnToModes} onAttempt={study.recordAttempt} />
  } else if (route.page === 'topics') {
    content = <TopicsPage onBack={() => back({ page: 'home' })} onSelect={(category) => navigate({ page: 'modes', category })} />
  } else if (route.page === 'modes') {
    content = <LearningPage cards={selected} category={route.category} disabled={refreshing} onBack={() => back({ page: 'topics' })} onSelectMode={(mode) => navigate({ page: 'practice', category: route.category, mode })} />
  } else if (route.page === 'progress') {
    content = <ProgressPage cards={cards} study={study.data} onBack={() => back({ page: 'home' })} />
  } else if (route.page === 'settings') {
    content = <SettingsPage study={study.data} onProfile={study.updateProfile} onImport={study.importBackup} onRefresh={() => void updateVocabulary()} refreshing={refreshing} notice={notice} />
  } else {
    content = <HomePage study={study.data} onLearn={learn} onProgress={() => navigate({ page: 'progress' })} />
  }

  const navigation = [{ page: 'home', label: 'Home' }, { page: 'topics', label: 'Learn' }, { page: 'progress', label: 'Progress' }, { page: 'settings', label: 'Settings' }] as const
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" type="button" aria-label="Hanzi – Home" onClick={home}><span lang="zh-CN" aria-hidden="true">汉</span><span>Hanzi</span></button>
        <nav aria-label="Main navigation">
          {navigation.map((item) => <button key={item.page} className="nav-button" type="button" aria-current={activePage === item.page ? 'page' : undefined} onClick={() => navigate({ page: item.page })}>{item.label}</button>)}
        </nav>
      </header>
      {study.storageError && <p className="global-notice" role="alert">{study.storageError}</p>}
      {content}
    </div>
  )
}

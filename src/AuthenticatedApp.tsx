import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getCatalogSnapshot, subscribeCatalog } from './data/catalog'
import ManagementPage from './components/ManagementPage'
import AccountMenu from './components/AccountMenu'
import AppHeader from './components/AppHeader'
import PublicLessonsPage from './components/PublicLessonsPage'
import ClassroomsPage from './components/ClassroomsPage'
import HomePage from './components/HomePage'
import TopicsPage from './components/TopicsPage'
import LearningPage from './components/LearningPage'
import FlashcardsPage from './components/FlashcardsPage'
import SpeechPage from './components/SpeechPage'
import WritingPage from './components/WritingPage'
import SentencesPage from './components/SentencesPage'
import ProgressPage from './components/ProgressPage'
import SettingsPage from './components/SettingsPage'
import CoursePage from './components/CoursePage'
import ExercisesPage from './components/ExercisesPage'
import LearningSessionPage from './components/LearningSessionPage'
import { filterCards } from './data/categories'
import { getActivity } from './data/learning'
import { activityStatus } from './lib/learning'
import { loadVocabulary, refreshVocabulary } from './lib/vocabulary'
import { useStudy } from './lib/useStudy'
import { parseRoute, type useNavigation } from './lib/navigation'
import { loadStudyData } from './lib/storage'
import type { Card } from './types/study'
import type { UserProfile } from './types/auth'
import type { LearningProfileInput } from './lib/profile'

export default function AuthenticatedApp({ profile, navigation: router, onLogout, onRefreshAccount, onSaveProfile, logoutError }: {
  profile: UserProfile; navigation: ReturnType<typeof useNavigation>; onLogout: () => void; onRefreshAccount: () => void; onSaveProfile: (input: LearningProfileInput) => Promise<void>; logoutError: string | null
}) {
  const { route, navigate, back, hash } = router
  const focusKey = hash.split('?')[0]
  const catalogSnapshot = useSyncExternalStore(subscribeCatalog, getCatalogSnapshot)
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refreshRef = useRef<AbortController | null>(null)
  const study = useStudy(profile)

  useEffect(() => {
    const controller = new AbortController()
    loadVocabulary(controller.signal)
      .then((loaded) => { if (!controller.signal.aborted) { setCards(loaded); setLoadError(null) } })
      .catch(() => { if (!controller.signal.aborted) setLoadError('Could not load the vocabulary. Please try again.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [loadAttempt, catalogSnapshot])

  useEffect(() => () => refreshRef.current?.abort(), [hash])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const heading = document.querySelector<HTMLElement>('main h1')
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
  }, [focusKey, loading, study.ready])

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

  const activity = 'activityId' in route && route.activityId ? getActivity(route.activityId) : undefined
  const practiceLevel = activity?.languageLevel ?? ('level' in route ? route.level ?? profile.language_level ?? 'beginner' : profile.language_level ?? 'beginner')
  const learn = () => navigate({ page: 'topics', ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })
  const home = () => navigate({ page: 'home' })
  const sessions = study.data.learningSessions ?? []
  const contextualCards = activity ? cards.filter((card) => activity.practiceWords.includes(card.hanzi)) : []
  const selected = contextualCards.length ? contextualCards : 'category' in route ? filterCards(cards.filter((card) => practiceLevel === 'all' || card.languageLevel === practiceLevel), route.category) : cards
  const deckKey = `${practiceLevel}:${'category' in route ? route.category : 'all'}:${activity?.id ?? ''}:${revision}`
  const activePage = route.page === 'lesson' ? 'course' : route.page === 'exercise' ? 'exercises' : route.page === 'topics' || route.page === 'modes' || route.page === 'practice' ? 'topics' : route.page
  let content

  if (loading || !study.ready) {
    content = <main className="practice-page"><p role="status">Loading…</p></main>
  } else if (loadError || (!cards.length && route.page === 'practice' && route.mode !== 'sentences')) {
    content = <main className="practice-page"><h1>Vocabulary unavailable</h1><p role="alert">{loadError}</p><button type="button" onClick={() => { setLoading(true); setLoadError(null); setLoadAttempt((value) => value + 1) }}>Try again</button></main>
  } else if (route.page === 'practice') {
    const returnToModes = () => activity ? back({ page: activity.kind === 'lesson' ? 'lesson' : 'exercise', activityId: activity.id }) : back({ page: 'modes', category: route.category, ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })
    if (route.mode === 'flashcards') content = <FlashcardsPage key={deckKey} cards={selected} study={study.data} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'speech') content = <SpeechPage key={deckKey} cards={selected} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'writing') content = <WritingPage key={deckKey} cards={selected} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'sentences') content = <SentencesPage key={practiceLevel} level={practiceLevel} onBack={returnToModes} onAttempt={study.recordAttempt} />
  } else if (route.page === 'course') {
    content = <CoursePage level={route.level ?? profile.language_level ?? 'beginner'} difficulty={route.difficulty ?? 'all'} onFilterChange={(filter) => navigate({ page: 'course', level: filter.languageLevel, difficulty: filter.difficulty })} sessions={sessions} onSelect={(activityId) => navigate({ page: 'lesson', activityId })} />
  } else if (route.page === 'exercises') {
    content = <ExercisesPage sessions={sessions} onSelect={(activityId) => navigate({ page: 'exercise', activityId })} onPractice={learn} />
  } else if ((route.page === 'lesson' || route.page === 'exercise') && activity) {
    const returnToList = () => {
      const previousHash = window.history.state?.hanziFrom
      const previous = typeof previousHash === 'string' ? parseRoute(previousHash) : null
      if (activity.kind === 'lesson' && previous?.page === 'course' && (previous.level ?? profile.language_level ?? 'beginner') === activity.languageLevel) back(previous)
      else if (activity.kind === 'lesson') back({ page: 'course', ...(activity.languageLevel !== 'beginner' ? { level: activity.languageLevel } : {}) })
      else back({ page: 'exercises' })
    }
    content = <LearningSessionPage key={activity.id} activity={activity} sessions={sessions} locked={activityStatus(activity, sessions) === 'locked'} onSaveSession={study.recordLearningSession} onBack={returnToList} onPractice={(mode) => navigate({ page: 'practice', category: activity.category, mode, activityId: activity.id })} />
  } else if (route.page === 'lesson' || route.page === 'exercise') {
    content = <main className="practice-page"><h1>Content not found</h1><p>This lesson or exercise is not in the published catalog.</p><button type="button" onClick={() => navigate({ page: route.page === 'lesson' ? 'course' : 'exercises' })}>Browse learning content</button></main>
  } else if (route.page === 'topics') {
    content = <TopicsPage cards={cards} level={practiceLevel} onLevelChange={(level) => navigate({ page: 'topics', level })} onBack={() => back({ page: 'home' })} onSelect={(category) => navigate({ page: 'modes', category, ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })} />
  } else if (route.page === 'modes') {
    content = <LearningPage level={practiceLevel} cards={selected} category={route.category} disabled={refreshing} onBack={() => back({ page: 'topics', ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })} onSelectMode={(mode) => navigate({ page: 'practice', category: route.category, mode, ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })} />
  } else if (route.page === 'progress') {
    content = <ProgressPage cards={cards} study={study.data} profile={profile} onEditProfile={() => navigate({ page: 'settings' })} onBack={() => back({ page: 'home' })} />
  } else if (route.page === 'settings') {
    content = <SettingsPage study={study.data} profile={profile} onSaveProfile={onSaveProfile} onImport={study.importBackup} onRefresh={() => void updateVocabulary()} refreshing={refreshing} notice={notice} onImportPrevious={async () => study.importBackup(JSON.stringify(await loadStudyData()))} />
  } else if (route.page === 'lessons' || route.page === 'public-lesson') {
    content = <PublicLessonsPage key={hash} lessonId={route.page === 'public-lesson' ? route.lessonId : undefined} onSelect={(lessonId) => navigate({ page: 'public-lesson', lessonId })} onBack={() => back({ page: 'lessons' })} />
  } else if (route.page === 'classes') {
    content = <ClassroomsPage profile={profile} />
  } else if (route.page === 'teach' || route.page === 'admin') {
    content = <ManagementPage key={route.page} profile={profile} admin={route.page === 'admin'} onRead={(lessonId) => navigate({ page: 'public-lesson', lessonId })} onRefreshAccount={onRefreshAccount} />
  } else {
    content = <HomePage study={study.data} profile={profile} onEditProfile={() => navigate({ page: 'settings' })} onPreferredPractice={(mode) => navigate({ page: 'practice', category: 'all', mode })} onLearn={learn} onCourse={() => navigate({ page: 'course' })} onLesson={(activityId) => navigate({ page: 'lesson', activityId })} onExercises={() => navigate({ page: 'exercises' })} onProgress={() => navigate({ page: 'progress' })} />
  }

  return (
    <div className="app-shell">
      <AppHeader activePage={activePage} onHome={home} onNavigate={(page) => navigate({ page })}>
        <AccountMenu key={hash} profile={profile} activePage={route.page} onNavigate={(page) => navigate({ page })} onLogout={onLogout} />
      </AppHeader>
      {logoutError && <p className="global-notice" role="alert">{logoutError}</p>}
      {study.storageError && <p className="global-notice" role="alert">{study.storageError}</p>}
      {content}
    </div>
  )
}

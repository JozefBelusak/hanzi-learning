import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getCatalogSnapshot, subscribeCatalog } from './data/catalog'
import ManagementPage from './components/ManagementPage'
import AccountMenu from './components/AccountMenu'
import AppHeader from './components/AppHeader'
import PublicLessonsPage from './components/PublicLessonsPage'
import ClassroomsPage from './components/ClassroomsPage'
import HomePage from './components/HomePage'
import DailyStopsPage from './components/DailyStopsPage'
import DailyStopPage from './components/DailyStopPage'
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
import { profileContentFilter, resolveContentFilter } from './lib/contentFilter'
import { dailyStopAvailable, localDay } from './lib/daily'
import { useLocalDay } from './lib/useLocalDay'

export default function AuthenticatedApp({ profile, navigation: router, onLogout, onRefreshAccount, onSaveProfile, logoutError }: {
  profile: UserProfile; navigation: ReturnType<typeof useNavigation>; onLogout: () => void; onRefreshAccount: () => void; onSaveProfile: (input: LearningProfileInput) => Promise<void>; logoutError: string | null
}) {
  const { route, navigate, back, hash } = router
  useLocalDay()
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
  const profileFilter = profileContentFilter(profile)
  const catalogFilter = resolveContentFilter(profileFilter, route.page === 'course' || route.page === 'exercises' || route.page === 'lessons' ? route : {})
  const practiceLevel = activity?.languageLevel ?? ('level' in route ? route.level ?? profile.language_level ?? 'beginner' : profile.language_level ?? 'beginner')
  const learn = () => navigate({ page: 'topics', ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })
  const home = () => navigate({ page: 'home' })
  const sessions = study.data.learningSessions ?? []
  const contextualCards = activity ? cards.filter((card) => activity.practiceWords.includes(card.hanzi)) : []
  const selected = contextualCards.length ? contextualCards : 'category' in route ? filterCards(cards.filter((card) => practiceLevel === 'all' || card.languageLevel === practiceLevel), route.category) : cards
  const deckKey = `${practiceLevel}:${'category' in route ? route.category : 'all'}:${activity?.id ?? ''}:${revision}`
  const activePage = route.page === 'today' || route.page === 'daily-stop' ? 'home' : route.page === 'lesson' ? 'course' : route.page === 'exercise' ? 'exercises' : route.page === 'topics' || route.page === 'modes' || route.page === 'practice' ? 'topics' : route.page
  let content

  if (loading || !study.ready) {
    content = <main className="practice-page"><p role="status">Loading…</p></main>
  } else if (loadError || (!cards.length && route.page === 'practice' && route.mode !== 'sentences')) {
    content = <main className="practice-page"><h1>Vocabulary unavailable</h1><p role="alert">{loadError}</p><button type="button" onClick={() => { setLoading(true); setLoadError(null); setLoadAttempt((value) => value + 1) }}>Try again</button></main>
  } else if (route.page === 'practice') {
    const returnToModes = () => {
      const previousHash = window.history.state?.hanziFrom
      const previous = typeof previousHash === 'string' ? parseRoute(previousHash) : null
      if (previous?.page === 'daily-stop') back(previous)
      else if (activity) back({ page: activity.kind === 'lesson' ? 'lesson' : 'exercise', activityId: activity.id })
      else back({ page: 'modes', category: route.category, ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })
    }
    if (route.mode === 'flashcards') content = <FlashcardsPage key={deckKey} cards={selected} study={study.data} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'speech') content = <SpeechPage key={deckKey} cards={selected} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'writing') content = <WritingPage key={deckKey} cards={selected} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'sentences') content = <SentencesPage key={practiceLevel} level={practiceLevel} onBack={returnToModes} onAttempt={study.recordAttempt} />
  } else if (route.page === 'today') {
    content = <DailyStopsPage study={study.data} profile={profile} cards={cards} onStart={study.startDailyRoute} onStop={(daily,stop) => navigate({page:'daily-stop',routeId:daily.id,stopId:stop.id})} onHome={home} onPreferences={() => navigate({page:'settings'})} onExercise={(activityId) => navigate({page:'exercise',activityId})} onVocabulary={(category) => navigate({page:'modes',category,level:profileFilter.languageLevel})} onBrowse={() => navigate({page:'exercises'})} />
  } else if (route.page === 'daily-stop') {
    const daily = study.data.dailyRoutes?.find((item) => item.id === route.routeId)
    const stop = daily?.stops.find((item) => item.id === route.stopId)
    const available = daily && stop && daily.day === localDay() && new Date() < new Date(daily.expiresAt) && dailyStopAvailable(stop,study.data)
    content = available ? <DailyStopPage key={`${daily.id}:${stop.id}`} route={daily} stop={stop} study={study.data} onBack={() => back({page:'today'})} onAttempt={study.recordAttempt} onSaveSession={study.recordLearningSession} onPractice={(mode,activityId) => { const activity = getActivity(activityId)!; navigate({page:'practice',category:activity.category,mode,activityId}) }} /> : <main className="daily-page"><h1>Stop unavailable</h1><p>This stop belongs to another day, is no longer available or is not in your saved route.</p><button type="button" onClick={() => navigate({page:'today'})}>Open today's stops</button></main>
  } else if (route.page === 'course') {
    content = <CoursePage level={catalogFilter.languageLevel} difficulty={catalogFilter.difficulty} profileFilter={profileFilter} onFilterChange={(filter) => navigate({ page: 'course', level: filter.languageLevel, difficulty: filter.difficulty })} sessions={sessions} onSelect={(activityId) => navigate({ page: 'lesson', activityId })} />
  } else if (route.page === 'exercises') {
    content = <ExercisesPage contentFilter={catalogFilter} profileFilter={profileFilter} onFilterChange={(filter) => navigate({ page: 'exercises', level: filter.languageLevel, difficulty: filter.difficulty })} sessions={sessions} onSelect={(activityId) => navigate({ page: 'exercise', activityId })} onPractice={learn} />
  } else if ((route.page === 'lesson' || route.page === 'exercise') && activity) {
    const returnToList = () => {
      const previousHash = window.history.state?.hanziFrom
      const previous = typeof previousHash === 'string' ? parseRoute(previousHash) : null
      if (previous?.page === 'today') back(previous)
      else if (previous?.page === (activity.kind === 'lesson' ? 'course' : 'exercises')) back(previous)
      else back({ page: activity.kind === 'lesson' ? 'course' : 'exercises', level: activity.languageLevel, difficulty: 'all' })
    }
    content = <LearningSessionPage key={activity.id} activity={activity} sessions={sessions} locked={activityStatus(activity, sessions) === 'locked'} onSaveSession={study.recordLearningSession} onBack={returnToList} onPractice={(mode) => navigate({ page: 'practice', category: activity.category, mode, activityId: activity.id })} />
  } else if (route.page === 'lesson' || route.page === 'exercise') {
    content = <main className="practice-page"><h1>Content not found</h1><p>This lesson or exercise is not in the published catalog.</p><button type="button" onClick={() => navigate({ page: route.page === 'lesson' ? 'course' : 'exercises' })}>Browse learning content</button></main>
  } else if (route.page === 'topics') {
    content = <TopicsPage cards={cards} level={practiceLevel} onLevelChange={(level) => navigate({ page: 'topics', level })} onBack={() => back({ page: 'home' })} onSelect={(category) => navigate({ page: 'modes', category, ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })} />
  } else if (route.page === 'modes') {
    content = <LearningPage level={practiceLevel} cards={selected} category={route.category} disabled={refreshing} onBack={() => back({ page: 'topics', ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })} onSelectMode={(mode) => navigate({ page: 'practice', category: route.category, mode, ...(practiceLevel !== 'beginner' ? { level: practiceLevel } : {}) })} />
  } else if (route.page === 'progress') {
    content = <ProgressPage cards={cards} study={study.data} profile={profile} onEditProfile={() => navigate({ page: 'settings' })} onToday={() => { study.startDailyRoute(); navigate({page:'today'}) }} onBack={() => back({ page: 'home' })} />
  } else if (route.page === 'settings') {
    content = <SettingsPage study={study.data} profile={profile} onSaveProfile={onSaveProfile} onImport={study.importBackup} onRefresh={() => void updateVocabulary()} refreshing={refreshing} notice={notice} onImportPrevious={async () => study.importBackup(JSON.stringify(await loadStudyData()))} />
  } else if (route.page === 'lessons' || route.page === 'public-lesson') {
    content = <PublicLessonsPage key={route.page === 'public-lesson' ? route.lessonId : 'lessons'} filter={catalogFilter} profileFilter={profileFilter} onFilterChange={(filter) => navigate({ page: 'lessons', level: filter.languageLevel, difficulty: filter.difficulty })} lessonId={route.page === 'public-lesson' ? route.lessonId : undefined} onSelect={(lessonId) => navigate({ page: 'public-lesson', lessonId })} onBack={() => {
      const previousHash = window.history.state?.hanziFrom
      const previous = typeof previousHash === 'string' ? parseRoute(previousHash) : null
      back(previous?.page === 'lessons' ? previous : { page: 'lessons' })
    }} />
  } else if (route.page === 'classes') {
    content = <ClassroomsPage profile={profile} />
  } else if (route.page === 'teach' || route.page === 'admin') {
    content = <ManagementPage key={route.page} profile={profile} admin={route.page === 'admin'} onRead={(lessonId) => navigate({ page: 'public-lesson', lessonId })} onRefreshAccount={onRefreshAccount} />
  } else {
    content = <HomePage study={study.data} onToday={() => { study.startDailyRoute(); navigate({page:'today'}) }} onLearn={learn} onExercises={() => navigate({ page: 'exercises' })} onProgress={() => navigate({ page: 'progress' })} />
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

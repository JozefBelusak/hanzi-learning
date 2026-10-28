import { useEffect, useRef, useState } from 'react'
import ManagementPage from './components/ManagementPage'
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
import type { useNavigation } from './lib/navigation'
import { canTeach, roleLabels } from './lib/access'
import { loadStudyData } from './lib/storage'
import type { Card } from './types/study'
import type { UserProfile } from './types/auth'

export default function AuthenticatedApp({ profile, navigation: router, onLogout, onRefreshAccount, logoutError }: {
  profile: UserProfile; navigation: ReturnType<typeof useNavigation>; onLogout: () => void; onRefreshAccount: () => void; logoutError: string | null
}) {
  const { route, navigate, back, hash } = router
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refreshRef = useRef<AbortController | null>(null)
  const study = useStudy(profile.id)

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

  const learn = () => navigate({ page: 'topics' })
  const home = () => navigate({ page: 'home' })
  const sessions = study.data.learningSessions ?? []
  const activity = 'activityId' in route && route.activityId ? getActivity(route.activityId) : undefined
  const contextualCards = activity ? cards.filter((card) => activity.practiceWords.includes(card.hanzi)) : []
  const selected = contextualCards.length ? contextualCards : 'category' in route ? filterCards(cards, route.category) : cards
  const deckKey = `${'category' in route ? route.category : 'all'}:${activity?.id ?? ''}:${revision}`
  const activePage = route.page === 'lesson' ? 'course' : route.page === 'exercise' ? 'exercises' : route.page === 'topics' || route.page === 'modes' || route.page === 'practice' ? 'topics' : route.page
  let content

  if (loading || !study.ready) {
    content = <main className="practice-page"><p role="status">Loading…</p></main>
  } else if (loadError || !cards.length) {
    content = <main className="practice-page"><h1>Vocabulary unavailable</h1><p role="alert">{loadError}</p><button type="button" onClick={() => { setLoading(true); setLoadError(null); setLoadAttempt((value) => value + 1) }}>Try again</button></main>
  } else if (route.page === 'practice') {
    const returnToModes = () => activity ? back({ page: activity.kind === 'lesson' ? 'lesson' : 'exercise', activityId: activity.id }) : back({ page: 'modes', category: route.category })
    if (route.mode === 'flashcards') content = <FlashcardsPage key={deckKey} cards={selected} study={study.data} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'speech') content = <SpeechPage key={deckKey} cards={selected} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'writing') content = <WritingPage key={deckKey} cards={selected} onBack={returnToModes} onAttempt={study.recordAttempt} />
    if (route.mode === 'sentences') content = <SentencesPage onBack={returnToModes} onAttempt={study.recordAttempt} />
  } else if (route.page === 'course') {
    content = <CoursePage sessions={sessions} onSelect={(activityId) => navigate({ page: 'lesson', activityId })} />
  } else if (route.page === 'exercises') {
    content = <ExercisesPage sessions={sessions} onSelect={(activityId) => navigate({ page: 'exercise', activityId })} onPractice={learn} />
  } else if ((route.page === 'lesson' || route.page === 'exercise') && activity) {
    content = <LearningSessionPage key={activity.id} activity={activity} sessions={sessions} locked={activityStatus(activity, sessions) === 'locked'} onSaveSession={study.recordLearningSession} onBack={() => back({ page: activity.kind === 'lesson' ? 'course' : 'exercises' })} onPractice={(mode) => navigate({ page: 'practice', category: activity.category, mode, activityId: activity.id })} />
  } else if (route.page === 'topics') {
    content = <TopicsPage onBack={() => back({ page: 'home' })} onSelect={(category) => navigate({ page: 'modes', category })} />
  } else if (route.page === 'modes') {
    content = <LearningPage cards={selected} category={route.category} disabled={refreshing} onBack={() => back({ page: 'topics' })} onSelectMode={(mode) => navigate({ page: 'practice', category: route.category, mode })} />
  } else if (route.page === 'progress') {
    content = <ProgressPage cards={cards} study={study.data} onBack={() => back({ page: 'home' })} />
  } else if (route.page === 'settings') {
    content = <SettingsPage study={study.data} onProfile={study.updateProfile} onImport={study.importBackup} onRefresh={() => void updateVocabulary()} refreshing={refreshing} notice={notice} onImportPrevious={async () => study.importBackup(JSON.stringify(await loadStudyData()))} />
  } else if (route.page === 'lessons' || route.page === 'public-lesson') {
    content = <PublicLessonsPage key={hash} lessonId={route.page === 'public-lesson' ? route.lessonId : undefined} onSelect={(lessonId) => navigate({ page: 'public-lesson', lessonId })} onBack={() => back({ page: 'lessons' })} />
  } else if (route.page === 'classes') {
    content = <ClassroomsPage profile={profile} />
  } else if (route.page === 'teach' || route.page === 'admin') {
    content = <ManagementPage key={route.page} profile={profile} admin={route.page === 'admin'} onRead={(lessonId) => navigate({ page: 'public-lesson', lessonId })} onRefreshAccount={onRefreshAccount} />
  } else {
    content = <HomePage study={study.data} onLearn={learn} onCourse={() => navigate({ page: 'course' })} onLesson={(activityId) => navigate({ page: 'lesson', activityId })} onExercises={() => navigate({ page: 'exercises' })} onProgress={() => navigate({ page: 'progress' })} />
  }

  const navigation = [
    { page: 'home', label: 'Home', icon: 'M3 10 12 3 21 10 M5 9v12h5v-7h4v7h5V9' },
    { page: 'course', label: 'Course', icon: 'M5 4v16 M19 4v16 M5 7h14 M5 17h14 M12 7v10 M2 4h6 M16 20h6' },
    { page: 'exercises', label: 'Exercises', icon: 'M9 6h12 M9 12h12 M9 18h12 M2 5l2 2 3-3 M2 11l2 2 3-3 M2 17l2 2 3-3' },
    { page: 'topics', label: 'Practice', icon: 'M7 3h13v15H7z M4 6H2v15h13v-2 M10 8h7 M10 12h5' },
    { page: 'progress', label: 'Progress', icon: 'M4 20v-6h3v6 M10 20V9h3v11 M16 20V4h3v16 M2 20h20' },
    { page: 'settings', label: 'Settings', icon: 'M5 3v5 M5 14v7 M12 3v10 M12 19v2 M19 3v2 M19 11v10 M2 8h6v6H2z M9 13h6v6H9z M16 5h6v6h-6z' },
  ] as const
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" type="button" aria-label="Hanzi – Home" onClick={home}><span lang="zh-CN" aria-hidden="true">汉</span><span>Hanzi</span></button>
        <nav aria-label="Main navigation">
          {navigation.map((item) => <button key={item.page} className="nav-button" type="button" aria-current={activePage === item.page ? 'page' : undefined} onClick={() => navigate({ page: item.page })}><svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg><span>{item.label}</span></button>)}
        </nav>
      </header>
      <div className="account-bar" aria-label="Your account"><span>{profile.display_name}</span><span className="account-role">{roleLabels[profile.role]}</span><button type="button" className="text-btn" onClick={() => navigate({ page: 'lessons' })}>Public lessons</button><button type="button" className="text-btn" onClick={() => navigate({ page: 'classes' })}>Your classrooms</button>{canTeach(profile.role) && <button type="button" className="text-btn" onClick={() => navigate({ page: 'teach' })}>Lecturer workspace</button>}{profile.role === 'admin' && <button type="button" className="text-btn" onClick={() => navigate({ page: 'admin' })}>Administration</button>}<button type="button" className="text-btn" onClick={onLogout}>Sign out</button></div>
      {logoutError && <p className="global-notice" role="alert">{logoutError}</p>}
      {study.storageError && <p className="global-notice" role="alert">{study.storageError}</p>}
      {content}
    </div>
  )
}

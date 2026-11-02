import { useEffect, useState, type ReactNode } from 'react'
import AppHeader from './components/AppHeader'
import CoursePage from './components/CoursePage'
import ExercisesPage from './components/ExercisesPage'
import TopicsPage from './components/TopicsPage'
import LearningPage from './components/LearningPage'
import LearningSessionPage from './components/LearningSessionPage'
import { catalog, getActiveCatalog, getActivity, installCatalog, lessons } from './data/catalog'
import { filterCards } from './data/categories'
import { parseRoute, type AppRoute, type useNavigation } from './lib/navigation'
import { isGuestRoute } from './lib/guest'
import type { PracticeMode } from './types/study'
import './components/GuestApp.css'

type Props = { navigation: ReturnType<typeof useNavigation>; onAuth: (mode: 'login' | 'register') => void }
const modes: Record<PracticeMode, { title: string; description: string }> = {
  flashcards: { title: 'Flashcards', description: 'Recall words in either direction and schedule reviews based on your recall.' },
  speech: { title: 'Speaking', description: 'Listen, record your voice and compare recognized Mandarin text with the expected word.' },
  writing: { title: 'Writing', description: 'Follow stroke order, trace Chinese characters and practise writing from memory.' },
  sentences: { title: 'Sentence building', description: 'Arrange words into sentences and explore explanations of Chinese grammar.' },
}

function GuestWorkspace({ navigation, onAuth }: Props) {
  const { route, navigate, back, hash } = navigation
  const focusKey = hash.split('?')[0]
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const heading = document.querySelector<HTMLElement>('main h1')
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
  }, [focusKey])
  const browse = (next: AppRoute) => navigate({ ...next, guest: true })
  const level = 'level' in route ? route.level ?? 'beginner' : 'beginner'
  const words = getActiveCatalog().vocabulary.filter((word) => !word.archived)
  const selected = filterCards(words.filter((word) => level === 'all' || word.languageLevel === level), 'category' in route ? route.category : 'all')
  const signIn = () => onAuth('login')
  const home = () => browse({ page: 'home' })
  const topics = () => browse({ page: 'topics', ...(level !== 'beginner' ? { level } : {}) })
  const activePage = route.page === 'lesson' ? 'course' : route.page === 'exercise' ? 'exercises' : route.page === 'modes' || route.page === 'practice' ? 'topics' : route.page
  const prompt = (title: string, description: string, sample?: ReactNode) => <main className="practice-page guest-access-page"><h1>{title}</h1>{sample}<section className="card-surface guest-access-card"><h2>Continue with an account</h2><p>{description}</p><p>No answers or progress are recorded in guest preview.</p><div className="action-row"><button type="button" onClick={signIn}>Sign in to continue</button><button className="secondary-btn" type="button" onClick={() => onAuth('register')}>Create your account</button></div></section></main>
  let content
  if (route.page === 'course') {
    content = <CoursePage sessions={[]} previewOnly level={route.level ?? 'all'} difficulty={route.difficulty ?? 'all'} onFilterChange={(filter) => browse({ page: 'course', level: filter.languageLevel, difficulty: filter.difficulty })} onSelect={(activityId) => browse({ page: 'lesson', activityId })} />
  } else if (route.page === 'exercises') {
    content = <ExercisesPage sessions={[]} previewOnly onSelect={(activityId) => browse({ page: 'exercise', activityId })} onPractice={topics} />
  } else if (route.page === 'lesson' || route.page === 'exercise') {
    const activity = getActivity(route.activityId)
    const returnToList = () => {
      const previous = typeof window.history.state?.hanziFrom === 'string' ? parseRoute(window.history.state.hanziFrom) : null
      const parent: AppRoute = activity?.kind === 'lesson' || route.page === 'lesson' ? { page: 'course', level: activity?.languageLevel ?? 'all', guest: true } : { page: 'exercises', guest: true }
      back(previous && isGuestRoute(previous) && previous.page === parent.page ? previous : parent)
    }
    content = activity && activity.publication === 'published' && activity.kind === route.page
      ? <LearningSessionPage activity={activity} previewOnly onSignIn={signIn} onBack={returnToList} />
      : <main className="practice-page"><h1>Preview unavailable</h1><p>This item is not in the public app preview. Sign in to load the current published catalog.</p><button type="button" onClick={signIn}>Sign in</button></main>
  } else if (route.page === 'topics') {
    content = <TopicsPage cards={words} level={level} onLevelChange={(next) => browse({ page: 'topics', level: next })} onBack={home} onSelect={(category) => browse({ page: 'modes', category, level })} />
  } else if (route.page === 'modes') {
    content = <LearningPage cards={selected} category={route.category} level={level} disabled={false} previewOnly onBack={() => back({ page: 'topics', level, guest: true })} onSelectMode={(mode) => browse({ page: 'practice', category: route.category, mode, level })} />
  } else if (route.page === 'practice') {
    const mode = modes[route.mode]
    const sample = selected[0]
    content = prompt(`${mode.title} preview`, `${mode.description} Sign in to start practising.`, <><button type="button" className="back-button" onClick={() => route.activityId ? back({ page: getActivity(route.activityId)?.kind === 'exercise' ? 'exercise' : 'lesson', activityId: route.activityId, guest: true }) : back({ page: 'modes', category: route.category, level, guest: true })}>Back</button>{sample && <article className="card-surface guest-word-sample" aria-label="Vocabulary preview"><span>Example word</span><strong lang="zh-CN">{sample.hanzi}</strong><p>{sample.pinyin}</p><p>{sample.meaning}</p></article>}</>)
  } else if (route.page === 'progress') {
    content = prompt('Your progress', 'Sign in to track results, build a review schedule and follow your learning goals.')
  } else if (route.page === 'settings') {
    content = prompt('Profile and preferences', 'Create an account to set your language level, learning goals and preferred practice modes.')
  } else {
    content = <main className="home-page guest-home"><h1>Explore Hanzi</h1><p>Take a look around before creating an account.</p><section className="home-study"><div><span className="home-course-label">Chinese, one stop at a time</span><h2>Find your learning path</h2><p>Browse lessons from Beginner to Advanced, explore grammar and discover ways to practise Mandarin.</p><button type="button" onClick={() => browse({ page: 'course', level: 'all' })}>Explore courses</button><span className="home-course-progress">{lessons.length} lessons · {words.length.toLocaleString('en-GB')} vocabulary entries</span></div><span className="home-character" lang="zh-CN" aria-hidden="true">学</span></section><section className="home-pathways" aria-label="Explore the app"><button className="home-pathway" type="button" onClick={() => browse({ page: 'exercises' })}><span><strong>Browse exercises</strong><span>Preview situations, grammar and lesson examples.</span></span></button><button className="home-pathway" type="button" onClick={topics}><span><strong>Explore practice modes</strong><span>Discover flashcards, speaking, character writing and sentences.</span></span></button></section></main>
  }
  return <div className="app-shell guest-shell"><AppHeader activePage={activePage} onHome={home} onNavigate={(page) => browse(page === 'course' ? { page, level: 'all' } : { page })}><div className="guest-account"><span>Guest</span><button type="button" className="secondary-btn" onClick={signIn}>Sign in</button></div></AppHeader><aside className="guest-banner" aria-label="Guest preview"><div><strong>Guest preview</strong><p>Explore the app. Sign in to start lessons, practise and save progress.</p></div><button type="button" onClick={() => onAuth('register')}>Create account</button></aside>{content}</div>
}

export default function GuestApp(props: Props) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      // Never expose the last signed-in user's in-memory server catalog. Guest
      // views use only the shipped seed and never mount progress/storage hooks.
      installCatalog(catalog, null)
      setReady(true)
    })
    return () => { active = false }
  }, [])
  return ready ? <GuestWorkspace {...props} /> : <main className="auth-page"><p role="status">Opening preview…</p></main>
}

import { useState } from 'react'
import { currentDailyRoute, dailyPreferenceKey, dailyRouteProgress, dailyStopAvailable, dailyStopProgress, todayRoutes } from '../lib/daily'
import { routePace } from '../lib/routePace'
import { levelLabel, difficultyLabel } from '../data/taxonomy'
import { contentRepository } from '../data/catalog'
import { sentences } from '../data/sentences'
import type { StudyData, Card, CategoryId } from '../types/study'
import type { UserProfile } from '../types/auth'
import type { DailyRoute, DailyStop } from '../types/daily'
import GoalRecommendations from './GoalRecommendations'
import './DailyStops.css'

export function DailyStopItems({ stop }: { stop: DailyStop }) {
  if (stop.kind === 'activity') return null
  return <ul className="daily-stop-items">{stop.targetIds.map((id) => {
    const word = stop.mode === 'sentences' ? null : contentRepository.getVocabulary(id)
    const sentence = stop.mode === 'sentences' ? sentences.find((item) => item.id === id) : null
    return <li key={id}>{word ? <><span lang="zh-CN">{word.hanzi}</span><small>{word.pinyin}</small></> : sentence?.meaning ?? 'Unavailable item'}</li>
  })}</ul>
}

export default function DailyStopsPage({ study, profile, cards, onStart, onStop, onHome, onPreferences, onExercise, onVocabulary, onBrowse }: {
  study: StudyData; profile: UserProfile; cards: Card[]; onStart: (next?: boolean) => boolean; onStop: (route: DailyRoute, stop: DailyStop) => void;
  onHome: () => void; onPreferences: () => void; onExercise: (id: string) => void; onVocabulary: (category: CategoryId) => void; onBrowse: () => void
}) {
  const [planningError, setPlanningError] = useState<string | null>(null)
  function start(next = false) {
    setPlanningError(onStart(next) ? null : 'No new stops could be planned. Check your route preferences or browse the available learning content.')
  }
  const routes = todayRoutes(study), route = currentDailyRoute(study)
  const summary = route ? dailyRouteProgress(route,study) : null
  const changed = route && route.preferenceKey !== dailyPreferenceKey(profile)
  const unavailable = route?.stops.some((stop) => !dailyStopAvailable(stop,study))
  return <main className="daily-page">
    <button type="button" className="back-button" onClick={onHome}>Back to Home</button>
    <header className="daily-heading"><div><span className="daily-eyebrow">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</span><h1>Today's stops</h1><p>{route ? `${levelLabel(route.languageLevel)} · ${difficultyLabel(route.difficulty)} preference · Section ${routes.length}` : `${levelLabel(profile.language_level ?? 'beginner')} · ${routePace(profile.daily_goal).label}`}</p></div><button type="button" className="text-btn" onClick={onPreferences}>Route preferences</button></header>
    {planningError && <p role="alert" className="error-message">{planningError}</p>}
    {!route ? <section className="card-surface"><h2>Plan a little learning for today</h2><p>We’ll pick words, a practice skill and a learning activity using your preferences and earlier results.</p><button type="button" onClick={() => start()}>Plan today's stops</button><p className="daily-help">If your level has no available content, change your route preferences or browse the catalog.</p></section> : <>
      <section className="daily-overview" aria-label="Today's route progress"><strong>{summary!.done} / {summary!.total} stops completed</strong><p>{summary!.complete ? 'Section complete. Plan your next stops whenever you want to continue.' : 'Start with any stop. Completed work is saved automatically.'}</p><progress aria-label="Route section progress" value={summary!.done} max={summary!.total} /></section>
      {changed && <p className="status-message">Your preferences changed. You can finish this section or build a fresh route using your new settings.</p>}
      <ol className="daily-stops" aria-label="Today's learning stops">{route.stops.map((stop,index) => {
        const progress = dailyStopProgress(route,stop,study), available = dailyStopAvailable(stop,study)
        return <li key={stop.id} className={progress.complete ? 'is-complete' : ''}><span className="daily-station" aria-hidden="true">{index+1}</span><article className="card-surface daily-stop"><div className="daily-stop-heading"><h2>{stop.title}</h2><span>{progress.complete ? 'Completed' : `${progress.done} / ${progress.total}`}</span></div><p>{stop.reason}</p><DailyStopItems stop={stop} />
          <small>{stop.kind === 'activity' ? 'Complete the review to finish this stop. Feedback remains in the activity.' : stop.mode === 'flashcards' ? 'Rate each selected word once. Every rating counts as practice.' : stop.mode === 'speech' ? 'Compare an answer for each word. Typed recall also counts; this does not measure tone quality.' : stop.mode === 'writing' ? 'Complete each character. Guided writing counts as practice too.' : 'Check each selected sentence. Hints and incorrect answers still count as practice.'}</small>
          {!available && !progress.complete && <p className="status-message">This content is no longer available. Build a fresh route to get replacement stops.</p>}
          {!progress.complete && available && <button type="button" onClick={() => onStop(route,stop)}>{progress.done ? 'Continue stop' : 'Start stop'}</button>}
        </article></li>
      })}</ol>
      {(summary!.complete || changed || unavailable) && <section className="card-surface daily-next" aria-label="Next route section"><span lang="zh-CN" aria-hidden="true">行</span><h2>{summary!.complete ? 'You’ve reached the end of this section' : 'Choose a fresh set of stops'}</h2><p>{summary!.complete ? 'Take a break, or continue. Your next stops will use your latest results and review schedule.' : 'Your previous route and learning history will be kept.'}</p><div className="action-row"><button type="button" onClick={() => start(true)}>{summary!.complete ? 'Plan next stops' : 'Build a fresh route'}</button><button type="button" className="secondary-btn" onClick={onHome}>Back to Home</button></div></section>}
      {routes.length > 1 && <details className="daily-history"><summary>Earlier sections today</summary>{routes.slice(0,-1).map((past,index) => { const progress = dailyRouteProgress(past,study); return <p key={past.id}>Section {index+1}: {progress.done} / {progress.total} stops completed</p> })}</details>}
    </>}
    <p className="daily-help">Matching practice counts even outside this route. Each section counts new work from when it was planned. Progress is saved on this device for your account.</p>
    <details className="daily-recommendations"><summary>Explore more recommendations for your goals</summary><GoalRecommendations profile={profile} cards={cards} onExercise={onExercise} onVocabulary={onVocabulary} onBrowse={onBrowse} /></details>
  </main>
}

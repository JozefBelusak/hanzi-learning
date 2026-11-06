import { studySummary } from '../lib/study'
import { currentDailyRoute, dailyRouteProgress, dailyStopProgress } from '../lib/daily'
import type { StudyData } from '../types/study'
import './DailyStops.css'

export default function HomePage({ study, onToday, onLearn, onExercises, onProgress }: { study: StudyData; onToday: () => void; onLearn: () => void; onExercises: () => void; onProgress: () => void }) {
  const summary = studySummary(study.attempts,undefined,study.learningSessions)
  const route = currentDailyRoute(study)
  const progress = route ? dailyRouteProgress(route,study) : null
  const stations = route ? route.stops.map((stop) => dailyStopProgress(route,stop,study).complete) : [false,false,false]
  return <main className="home-page">
    <h1>Home</h1>
    {study.displayName && <p className="home-greeting">Hi, {study.displayName}.</p>}
    <section className="home-study daily-home-card" aria-label="Today's stops">
      <div><span className="home-course-label">A little Mandarin, every day</span><h2>Today's stops</h2>
        <p>{progress?.complete ? 'This section is complete. Open your route to choose the next stops.' : 'Your next words, a little practice and a learning activity. Pick up where you left off.'}</p>
        <button type="button" onClick={onToday}>Open today's stops</button>
        <span className="home-course-progress">{progress ? `${progress.done} / ${progress.total} stops completed in this section` : 'A short route selected for your level and goals'}</span>
      </div>
      <svg className="daily-home-track" viewBox="0 0 120 220" aria-hidden="true"><path d="M60 20v180" />{stations.map((complete,index) => <circle key={index} cx="60" cy={stations.length === 1 ? 110 : 40+140*index/(stations.length-1)} r="12" className={complete ? 'is-done' : ''} />)}<text x="90" y="120" lang="zh-CN">行</text></svg>
    </section>
    <section className="home-pathways" aria-label="Learn your way">
      <button className="home-pathway" type="button" aria-label="Themed exercises" onClick={onExercises}><span><strong>Themed exercises</strong><span>Choose a situation to work on.</span></span></button>
      <button className="home-pathway" type="button" aria-label="Start practice" onClick={onLearn}><span><strong>Free practice</strong><span>Pick your own words and skills.</span></span></button>
    </section>
    <section className="home-progress"><div><strong>{summary.streak}</strong><span>{summary.streak === 1 ? 'day of learning' : 'days in a row'}</span></div><div><strong>{summary.practiced}</strong><span>words practised</span></div><button type="button" className="text-btn" onClick={onProgress}>View progress</button></section>
  </main>
}

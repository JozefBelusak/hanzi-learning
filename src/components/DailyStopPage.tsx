import { useState } from 'react'
import type { DailyRoute, DailyStop } from '../types/daily'
import type { AttemptInput, StudyData, PracticeMode } from '../types/study'
import type { LearningSession } from '../types/learning'
import { getActiveCatalog, contentRepository } from '../data/catalog'
import { dailyStopProgress } from '../lib/daily'
import { DailyStopItems } from './DailyStopsPage'
import FlashcardsPage from './FlashcardsPage'
import SpeechPage from './SpeechPage'
import WritingPage from './WritingPage'
import SentencesPage from './SentencesPage'
import LearningSessionPage from './LearningSessionPage'

export default function DailyStopPage({ route, stop, study, onBack, onAttempt, onSaveSession, onPractice }: {
  route: DailyRoute; stop: DailyStop; study: StudyData; onBack: () => void; onAttempt: (input: AttemptInput) => void;
  onSaveSession: (session: LearningSession) => void; onPractice: (mode: PracticeMode, activityId: string) => void
}) {
  const progress = dailyStopProgress(route,stop,study)
  const [initial] = useState(() => ({ complete:progress.complete, remaining:progress.remainingIds }))
  const cards = getActiveCatalog().vocabulary.filter((word) => initial.remaining.includes(word.id))
  if (initial.complete) return <main className="daily-page"><button type="button" className="back-button" onClick={onBack}>Back to today's stops</button><h1>{stop.title}</h1><p>This stop is already complete. You can plan your next stops from today's route.</p><DailyStopItems stop={stop} /></main>
  return <>
    <section className={`daily-session-banner${progress.complete ? ' is-complete' : ''}`} aria-label="Current daily stop"><div><strong>{stop.title}</strong><span role="status">{progress.complete ? 'Stop complete. Your progress is saved.' : `${progress.done} / ${progress.total} completed`}</span></div><button className="secondary-btn" type="button" onClick={onBack}>Back to today's stops</button></section>
    {stop.kind === 'activity' ? <LearningSessionPage activity={contentRepository.getActivity(stop.activityId,stop.revision)!} sessions={study.learningSessions ?? []} onSaveSession={onSaveSession} onBack={onBack} returnLabel="Back to today's stops" onPractice={(mode) => onPractice(mode,stop.activityId)} /> : stop.mode === 'flashcards' ? <FlashcardsPage reviewAll cards={cards} study={study} onAttempt={onAttempt} onBack={onBack} /> : stop.mode === 'speech' ? <SpeechPage cards={cards} onAttempt={onAttempt} onBack={onBack} /> : stop.mode === 'writing' ? <WritingPage cards={cards} onAttempt={onAttempt} onBack={onBack} /> : <SentencesPage level={route.languageLevel} sentenceIds={initial.remaining} onAttempt={onAttempt} onBack={onBack} />}
  </>
}

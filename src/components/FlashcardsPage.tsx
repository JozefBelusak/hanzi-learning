import { useEffect, useRef, useState } from 'react'
import type { AttemptInput, Card, FlashcardRating, StudyData } from '../types/study'
import { dueCards, scheduleReview } from '../lib/study'
import { isSpeechAbort, speakChinese, stopSpeaking } from '../lib/speech'

type Props = {
  cards: Card[]
  study: StudyData
  onBack: () => void
  onAttempt: (attempt: AttemptInput) => void
}

const ratings: { value: FlashcardRating; label: string }[] = [
  { value: 'again', label: 'Again' },
  { value: 'hard', label: 'Hard' },
  { value: 'good', label: 'Good' },
  { value: 'easy', label: 'Easy' },
]

function intervalLabel(days: number): string {
  if (days === 0) return '10 min'
  if (days < 1) return `${Math.round(days * 24)} h`
  const amount = new Intl.NumberFormat('en-GB').format(days)
  const unit = days === 1 ? 'day' : 'days'
  return `${amount} ${unit}`
}

export default function FlashcardsPage({ cards, study, onBack, onAttempt }: Props) {
  const [queue, setQueue] = useState(() => dueCards(cards, study.progress).map((card) => card.id))
  const [index, setIndex] = useState(0)
  const [isRevealed, setIsRevealed] = useState(false)
  const [direction, setDirection] = useState<'meaning' | 'hanzi'>('meaning')
  const [session, setSession] = useState({ total: 0, correct: 0 })
  const [audioError, setAudioError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioOperation = useRef<AbortController | null>(null)
  const currentCard = cards.find((card) => card.id === queue[index])

  useEffect(() => () => {
    audioOperation.current?.abort()
    audioOperation.current = null
    stopSpeaking()
  }, [])

  function cancelAudio() {
    audioOperation.current?.abort()
    audioOperation.current = null
    stopSpeaking()
    setIsPlaying(false)
    setAudioError(null)
  }

  function rateAnswer(rating: FlashcardRating) {
    if (!currentCard || !isRevealed) return
    const correct = rating !== 'again'
    onAttempt({
      mode: 'flashcards',
      cardId: currentCard.id,
      correct,
      rating,
      input: 'self',
      expectedText: direction === 'meaning' ? currentCard.hanzi : currentCard.meaning,
    })
    setSession((previous) => ({
      total: previous.total + 1,
      correct: previous.correct + Number(correct),
    }))
    cancelAudio()
    setIsRevealed(false)
    setIndex((previous) => previous + 1)
  }

  function practiceAll() {
    cancelAudio()
    setQueue(cards.map((card) => card.id))
    setIndex(0)
    setIsRevealed(false)
  }

  function changeDirection(nextDirection: 'meaning' | 'hanzi') {
    cancelAudio()
    setDirection(nextDirection)
    setIsRevealed(false)
  }

  async function play() {
    if (!currentCard) return
    cancelAudio()
    const controller = new AbortController()
    audioOperation.current = controller
    setIsPlaying(true)
    try {
      await speakChinese(currentCard.hanzi, { signal: controller.signal })
    } catch (error) {
      if (audioOperation.current === controller && !isSpeechAbort(error)) {
        setAudioError('A Chinese voice is not available on this device.')
      }
    } finally {
      if (audioOperation.current === controller) {
        audioOperation.current = null
        setIsPlaying(false)
      }
    }
  }

  return (
    <main className="practice-page flashcards-page">
      <header className="practice-header">
        <button className="secondary-btn" type="button" onClick={onBack}>Back</button>
        <span>{currentCard ? `${index + 1} / ${queue.length}` : 'Done'}</span>
      </header>
      <div className="page-title">
        <h1>Flashcards</h1>
      </div>
      <div className="segmented-control" aria-label="Practice direction">
        <button
          type="button"
          aria-pressed={direction === 'meaning'}
          className={direction === 'meaning' ? 'active' : ''}
          onClick={() => changeDirection('meaning')}
        >
          Meaning first
        </button>
        <button
          type="button"
          aria-pressed={direction === 'hanzi'}
          className={direction === 'hanzi' ? 'active' : ''}
          onClick={() => changeDirection('hanzi')}
        >
          Chinese first
        </button>
      </div>
      {currentCard ? (
        <>
          <article className="flashcard card-surface">
            {direction === 'meaning' ? (
              <h2 lang="en">{currentCard.meaning}</h2>
            ) : (
              <div className="hanzi" lang="zh-CN">{currentCard.hanzi}</div>
            )}
            {isRevealed ? (
              <div className="flashcard-answer" aria-live="polite">
                {direction === 'meaning' ? (
                  <div className="hanzi" lang="zh-CN">{currentCard.hanzi}</div>
                ) : (
                  <h2 lang="en">{currentCard.meaning}</h2>
                )}
                <p className="pinyin">{currentCard.pinyin}</p>
                <button
                  type="button"
                  className="text-btn"
                  disabled={isPlaying}
                  onClick={() => void play()}
                >
                  {isPlaying ? 'Playing…' : 'Listen to the word'}
                </button>
              </div>
            ) : (
              <button
                className="reveal-button"
                type="button"
                onClick={() => setIsRevealed(true)}
              >
                Show answer
              </button>
            )}
          </article>
          {audioError && <p role="status" className="status-message">{audioError}</p>}
          {isRevealed && (
            <div className="rating-actions" aria-label="Rate your answer">
              {ratings.map((rating) => {
                const review = scheduleReview(
                  study.progress[currentCard.id],
                  rating.value !== 'again',
                  new Date().toISOString(),
                  rating.value,
                )
                return (
                  <button
                    className={`rating-${rating.value}`}
                    key={rating.value}
                    type="button"
                    aria-label={rating.label}
                    aria-describedby={`rating-${rating.value}-interval`}
                    onClick={() => rateAnswer(rating.value)}
                  >
                    {rating.label}
                    <span className="rating-interval" id={`rating-${rating.value}-interval`}>{intervalLabel(review.intervalDays)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <section className="card-surface completion-card">
          <h2>{session.total ? 'Review complete' : 'All caught up for today'}</h2>
          {session.total > 0 && <p>You recalled {session.correct} of {session.total} {session.total === 1 ? 'answer' : 'answers'}.</p>}
          <div className="action-row">
            <button type="button" onClick={onBack}>Back to learning</button>
            <button className="secondary-btn" type="button" onClick={practiceAll}>
              Practise all words
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

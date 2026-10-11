import { useState } from 'react'
import { sentences, type SentenceExercise } from '../data/sentences'
import {
  createSentenceTokens,
  isSentenceOrderCorrect,
  sentenceText,
  shuffleSentenceTokens,
} from '../lib/sentences'
import type { AttemptInput } from '../types/study'

type SentencesPageProps = {
  onBack: () => void
  onAttempt: (attempt: AttemptInput) => void
}

type SentencePracticeProps = {
  exercise: SentenceExercise
  onAttempt: (attempt: AttemptInput) => void
  onNext: () => void
  isLast: boolean
}

function SentencePractice({
  exercise,
  onAttempt,
  onNext,
  isLast,
}: SentencePracticeProps) {
  const [tokens] = useState(() =>
    shuffleSentenceTokens(createSentenceTokens(exercise)),
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [feedback, setFeedback] = useState<boolean | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [hintUsed, setHintUsed] = useState(false)

  const selectedTokens = selectedIds.map(
    (id) => tokens.find((token) => token.id === id)!,
  )
  const availableTokens = tokens.filter((token) => !selectedIds.includes(token.id))
  const complete = selectedIds.length === tokens.length
  const solved = feedback === true
  const targetText = `${exercise.tokens.join('')}${exercise.punctuation}`

  function selectToken(id: string) {
    if (solved || selectedIds.includes(id)) return
    setSelectedIds((previous) => [...previous, id])
    setFeedback(null)
  }

  function removeToken(id: string) {
    if (solved) return
    setSelectedIds((previous) => previous.filter((selected) => selected !== id))
    setFeedback(null)
  }

  function undoToken() {
    setSelectedIds((previous) => previous.slice(0, -1))
    setFeedback(null)
  }

  function resetSentence() {
    setSelectedIds([])
    setFeedback(null)
  }

  function checkSentence() {
    if (!complete || feedback !== null) return

    const correct = isSentenceOrderCorrect(exercise, tokens, selectedIds)
    setFeedback(correct)
    onAttempt({
      mode: 'sentences',
      cardId: exercise.id,
      correct,
      input: 'sentence',
      assisted: hintUsed,
      expectedText: targetText,
      responseText: `${sentenceText(tokens, selectedIds)}${exercise.punctuation}`,
    })
  }

  return (
    <>
      <article className="sentence-card">
        <h2 className="sentence-translation">{exercise.meaning}</h2>
        <p>Arrange the words to build the sentence. Click a selected word to put it back.</p>

        <div
          className="sentence-construction"
          role="group"
          aria-label="Your sentence"
        >
          {selectedTokens.length === 0 ? (
            <span className="sentence-slot">Add words here…</span>
          ) : (
            selectedTokens.map((token, index) => (
              <button
                key={token.id}
                className="sentence-token is-selected"
                type="button"
                lang="zh-CN"
                onClick={() => removeToken(token.id)}
                disabled={solved}
                aria-label={`Remove ${token.text}, position ${index + 1}`}
              >
                {token.text}
              </button>
            ))
          )}
          {complete && <span lang="zh-CN">{exercise.punctuation}</span>}
        </div>

        <div className="sentence-bank" role="group" aria-label="Available words">
          {availableTokens.map((token) => (
            <button
              key={token.id}
              className="sentence-token"
              type="button"
              lang="zh-CN"
              onClick={() => selectToken(token.id)}
              disabled={solved}
              aria-label={`Add ${token.text}`}
            >
              {token.text}
            </button>
          ))}
        </div>

        <div className="sentence-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={checkSentence}
            disabled={!complete || feedback !== null}
          >
            Check sentence
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={undoToken}
            disabled={selectedIds.length === 0 || solved}
          >
            Undo
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={resetSentence}
            disabled={selectedIds.length === 0 || solved}
          >
            Start over
          </button>
        </div>

        <div aria-live="polite" aria-atomic="true">
          {feedback !== null && (
            <div
              className={`sentence-feedback ${feedback ? 'is-correct' : 'is-incorrect'}`}
            >
              <strong>
                {feedback ? 'The sentence is correct.' : 'This word order is not correct yet.'}
              </strong>
              <p>
                {feedback
                  ? exercise.acceptedOrders?.length
                    ? 'This sentence also allows the time expression at the beginning.'
                    : 'See below for the role of each part.'
                  : 'Remove a word and adjust the order.'}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setShowHint((previous) => !previous)
            setHintUsed(true)
          }}
          aria-expanded={showHint}
          aria-controls="sentence-hint"
        >
          {showHint ? 'Hide hint' : 'Show hint'}
        </button>

        {showHint && (
          <aside id="sentence-hint" className="sentence-hint">
            <p lang="zh-CN">{targetText}</p>
            <p>{exercise.pinyin}</p>
            {exercise.acceptedOrders?.map((order) => (
              <p key={order.join('')}>
                Accepted alternative: <span lang="zh-CN">{order.join('')}{exercise.punctuation}</span>
              </p>
            ))}
          </aside>
        )}
      </article>

      {(feedback !== null || showHint) && (
        <section className="sentence-grammar" aria-label="Grammar explanation">
          <h2>{exercise.grammarTitle}</h2>
          <p>{exercise.grammarNote}</p>
          <div className="sentence-grammar-parts">
            {exercise.grammarParts.map((part) => (
              <div key={part.label} className="sentence-grammar-part">
                <span>{part.label}</span>
                <strong>{part.text}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <button className="secondary-btn sentence-next" type="button" onClick={onNext}>
        {isLast ? 'Restart examples' : 'Next sentence'}
      </button>
    </>
  )
}

function SentencesPage({ onBack, onAttempt }: SentencesPageProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const currentSentence = sentences[currentIndex]

  return (
    <main className="sentence-page">
      <header className="sentence-header">
        <button type="button" className="secondary-btn" onClick={onBack}>Back</button>
        <p>Sentence {currentIndex + 1} / {sentences.length}</p>
      </header>

      <h1>Sentence building</h1>

      <SentencePractice
        key={currentSentence.id}
        exercise={currentSentence}
        onAttempt={onAttempt}
        onNext={() => setCurrentIndex((index) => (index + 1) % sentences.length)}
        isLast={currentIndex === sentences.length - 1}
      />
      <details className="practice-help">
        <summary>How this exercise works</summary>
        <p>This demo has ten examples of word order, questions and negation. Answers are checked against the accepted versions of each sentence.</p>
        <p>The hint shows the answer. Attempts made with a hint are saved as assisted practice and excluded from your unassisted accuracy.</p>
      </details>
    </main>
  )
}

export default SentencesPage

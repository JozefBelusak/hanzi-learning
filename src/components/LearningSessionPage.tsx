import { useEffect, useRef, useState } from 'react'
import { getLatestSession, gradeAnswer, sessionScore } from '../lib/learning'
import { isSpeechAbort, speakChinese, speechErrorMessage, stopSpeaking } from '../lib/speech'
import type { LearningActivity, LearningAnswer, LearningQuestion, LearningSession } from '../types/learning'
import type { PracticeMode } from '../types/study'
import ToneGuide from './ToneGuide'
import './LearningSessionPage.css'

type Props = {
  activity: LearningActivity
  sessions: LearningSession[]
  onSaveSession: (session: LearningSession) => void
  onBack: () => void
  onPractice: (mode: PracticeMode) => void
  locked?: boolean
}

type WordToken = { id: number; text: string }

// Occurrence IDs keep repeated words separate; the same question always has the same bank.
function questionTokens(question: LearningQuestion): WordToken[] {
  if (question.type !== 'order') return []
  const tokens = question.tokens.map((text, id) => ({ id, text }))
  let seed = [...question.id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 17)
  for (let index = tokens.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const other = seed % (index + 1)
    ;[tokens[index], tokens[other]] = [tokens[other], tokens[index]]
  }
  return tokens
}

function selectedOccurrences(question: LearningQuestion, response: string[]): number[] {
  if (question.type !== 'order') return []
  const used = new Set<number>()
  return response.flatMap((text) => {
    const index = question.tokens.findIndex((token, occurrence) => token === text && !used.has(occurrence))
    if (index < 0) return []
    used.add(index)
    return [index]
  })
}

function answerText(question: LearningQuestion, response?: string[]): string {
  if (question.type === 'order') return (response ?? question.acceptedOrders[0] ?? []).join(' ')
  const id = response?.[0] ?? question.answer
  return question.options.find((option) => option.id === id)?.text ?? id
}

type TaskProps = {
  question: LearningQuestion
  questionNumber: number
  total: number
  answer?: LearningAnswer
  previouslyHinted: boolean
  onHint: () => void
  onCheck: (answer: LearningAnswer) => void
  onNext: () => void
  onPrevious: () => void
  onPlay: (text: string) => void
  playingText: string | null
}

function QuestionTask({ question, questionNumber, total, answer, previouslyHinted, onHint, onCheck, onNext, onPrevious, onPlay, playingText }: TaskProps) {
  const [choice, setChoice] = useState(answer?.response[0] ?? '')
  const [selectedIds, setSelectedIds] = useState(() => selectedOccurrences(question, answer?.response ?? []))
  const [showHint, setShowHint] = useState(false)
  const [hintUsed, setHintUsed] = useState(Boolean(answer?.assisted || previouslyHinted))
  const promptRef = useRef<HTMLHeadingElement>(null)
  const tokens = questionTokens(question)
  const selected = selectedIds.map((id) => tokens.find((token) => token.id === id)!)
  const ready = question.type === 'choice' ? Boolean(choice) : selectedIds.length === tokens.length
  const correct = answer ? gradeAnswer(question, answer.response) : null
  const assisted = Boolean(answer?.assisted || previouslyHinted)

  useEffect(() => { promptRef.current?.focus() }, [])

  function checkAnswer() {
    if (!ready || answer) return
    onCheck({
      questionId: question.id,
      response: question.type === 'choice' ? [choice] : selected.map((token) => token.text),
      assisted: hintUsed,
    })
  }

  return (
    <>
      <section className="session-task" aria-label="Practice task">
        <div className="session-task-topline"><span>Question {questionNumber} of {total}</span><span>{question.type === 'choice' ? 'Choose an answer' : 'Build a sentence'}</span></div>
        <h2 ref={promptRef} tabIndex={-1}>{question.prompt}</h2>
        {question.audioText && (
          <button type="button" className="secondary-btn session-listen" onClick={() => onPlay(question.audioText!)}>
            {playingText === question.audioText ? 'Stop audio' : 'Listen to Mandarin'}
          </button>
        )}
        {question.type === 'choice' ? (
          <div className="session-options" role="group" aria-label="Answer choices">
            {question.options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={`session-option${choice === option.id ? ' is-selected' : ''}${answer && option.id === question.answer ? ' is-answer' : ''}`}
                aria-pressed={choice === option.id}
                disabled={Boolean(answer)}
                onClick={() => setChoice(option.id)}
              >
                <span>{option.text}</span>{option.pinyin && <small>{option.pinyin}</small>}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p>Choose words in order. Select a word in your sentence to put it back.</p>
            <div className="session-sentence" role="group" aria-label="Your sentence">
              {!selected.length && <span className="session-empty-sentence">Build your sentence here…</span>}
              {selected.map((token, index) => (
                <button
                  type="button" key={token.id} lang="zh-CN" className="session-token is-selected"
                  disabled={Boolean(answer)} aria-label={`Remove ${token.text}, position ${index + 1}`}
                  onClick={() => setSelectedIds((previous) => previous.filter((id) => id !== token.id))}
                >{token.text}</button>
              ))}
            </div>
            <div className="session-token-bank" role="group" aria-label="Available words">
              {tokens.filter((token) => !selectedIds.includes(token.id)).map((token) => (
                <button
                  type="button" key={token.id} lang="zh-CN" className="session-token"
                  disabled={Boolean(answer)} aria-label={`Add ${token.text}`}
                  onClick={() => setSelectedIds((previous) => [...previous, token.id])}
                >{token.text}</button>
              ))}
            </div>
            <div className="session-token-tools">
              <button type="button" className="text-btn" disabled={!selected.length || Boolean(answer)} onClick={() => setSelectedIds((previous) => previous.slice(0, -1))}>Undo</button>
              <button type="button" className="text-btn" disabled={!selected.length || Boolean(answer)} onClick={() => setSelectedIds([])}>Clear sentence</button>
            </div>
          </>
        )}
        <div className="session-task-actions">
          {!answer && <button type="button" className="session-check" disabled={!ready} onClick={checkAnswer}>Check answer</button>}
          {answer && <button type="button" className="session-check" onClick={onNext}>{questionNumber === total ? 'See results' : 'Next question'}</button>}
          {questionNumber > 1 && <button type="button" className="secondary-btn" onClick={onPrevious}>Previous</button>}
        </div>
        {question.hint && !answer && (
          <div className="session-hint-area">
            <button type="button" className="text-btn" aria-expanded={showHint} aria-controls="session-question-hint" onClick={() => {
              setShowHint((value) => !value)
              setHintUsed(true)
              onHint()
            }}>{showHint ? 'Hide hint' : 'Show hint'}</button>
            {showHint && <div id="session-question-hint" className="session-hint"><p>{question.hint}</p><small>This answer will count as assisted, even if you hide the hint.</small></div>}
            {hintUsed && !showHint && <small className="session-assistance-note">Hint used · this answer counts as assisted.</small>}
          </div>
        )}
      </section>
      <aside className={`session-feedback${answer ? correct ? ' is-correct' : ' is-incorrect' : ''}`} aria-label="Answer feedback">
        <span className="session-panel-label">Feedback</span>
        <div aria-live="polite" aria-atomic="true">
          {answer ? (
            <>
              <span className="session-feedback-symbol" aria-hidden="true">{correct ? '✓' : '↺'}</span>
              <h2>{correct ? assisted ? 'Correct with a hint' : 'You got it' : 'A useful one to revisit'}</h2>
              <p className="session-submitted-answer">Your answer: <strong>{answerText(question, answer.response)}</strong></p>
              {!correct && <p className="session-expected-answer">An accepted answer: <strong>{answerText(question)}</strong></p>}
              <p>{question.explanation}</p>
              {assisted && <p className="session-assistance-note">This is saved as assisted practice. Try it again without a hint to count towards your independent result.</p>}
            </>
          ) : (
            <>
              <h2>Give it a try</h2>
              <p>Your answer and an explanation will appear here after you check.</p>
              <p>Each checked answer is saved, so you can leave and continue later.</p>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

function LearningSessionWorkspace({ activity, sessions, onSaveSession, onBack, onPractice, locked = false }: Props) {
  const [session, setSession] = useState<LearningSession | null>(() => getLatestSession(activity.id, sessions) ?? null)
  const [notesOpen, setNotesOpen] = useState(() => locked || !getLatestSession(activity.id, sessions))
  const [currentIndex, setCurrentIndex] = useState(() => {
    const latest = getLatestSession(activity.id, sessions)
    const unanswered = activity.questions.findIndex((question) => !latest?.answers.some((answer) => answer.questionId === question.id))
    return unanswered < 0 ? Math.max(0, activity.questions.length - 1) : unanswered
  })
  const [playingText, setPlayingText] = useState<string | null>(null)
  const [audioError, setAudioError] = useState('')
  const playbackRef = useRef<AbortController | null>(null)
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null)
  const question = activity.questions[currentIndex]
  const finished = Boolean(session?.finishedAt)
  const started = Boolean(session) && !locked
  const score = session ? sessionScore(activity, session) : null

  useEffect(() => () => {
    playbackRef.current?.abort()
    playbackRef.current = null
    stopSpeaking()
  }, [])

  useEffect(() => { if (finished) resultsHeadingRef.current?.focus() }, [finished])

  function stopAudio() {
    playbackRef.current?.abort()
    playbackRef.current = null
    stopSpeaking()
    setPlayingText(null)
  }

  async function playAudio(text: string) {
    const wasPlaying = playingText === text
    stopAudio()
    setAudioError('')
    if (wasPlaying) return
    const controller = new AbortController()
    playbackRef.current = controller
    setPlayingText(text)
    try {
      await speakChinese(text, { rate: 0.8, signal: controller.signal })
    } catch (error) {
      if (!isSpeechAbort(error) && playbackRef.current === controller) setAudioError(speechErrorMessage(error))
    } finally {
      if (playbackRef.current === controller) {
        playbackRef.current = null
        setPlayingText(null)
      }
    }
  }

  function save(updated: LearningSession) {
    setSession(updated)
    onSaveSession(updated)
  }

  function startSession() {
    if (locked || !activity.questions.length) return
    stopAudio()
    const now = new Date().toISOString()
    save({ id: crypto.randomUUID(), activityId: activity.id, startedAt: now, updatedAt: now, answers: [] })
    setCurrentIndex(0)
    setNotesOpen(false)
  }

  function check(answer: LearningAnswer) {
    if (!session || locked || finished || session.answers.some((saved) => saved.questionId === answer.questionId)) return
    const savedAnswer = { ...answer, assisted: answer.assisted || Boolean(session.hintedQuestionIds?.includes(answer.questionId)) }
    save({ ...session, updatedAt: new Date().toISOString(), answers: [...session.answers, savedAnswer] })
  }

  function recordHint(questionId: string) {
    if (!session || locked || finished || session.hintedQuestionIds?.includes(questionId)) return
    save({ ...session, updatedAt: new Date().toISOString(), hintedQuestionIds: [...(session.hintedQuestionIds ?? []), questionId] })
  }

  function nextQuestion() {
    if (!session) return
    stopAudio()
    if (currentIndex < activity.questions.length - 1) setCurrentIndex((index) => index + 1)
    else if (activity.questions.every((item) => session.answers.some((answer) => answer.questionId === item.id))) {
      const now = new Date().toISOString()
      save({ ...session, updatedAt: now, finishedAt: now })
      setNotesOpen(false)
    }
  }

  function leave() {
    stopAudio()
    onBack()
  }

  function practise(mode: PracticeMode) {
    stopAudio()
    onPractice(mode)
  }

  const weakerQuestions = finished && session ? activity.questions.filter((item) => {
    const answer = session.answers.find((saved) => saved.questionId === item.id)
    return !answer || answer.assisted || session.hintedQuestionIds?.includes(item.id) || !gradeAnswer(item, answer.response)
  }) : []

  return (
    <main className="learning-session-page">
      <header className="session-header">
        <button type="button" className="back-button" onClick={leave}>{activity.kind === 'lesson' ? 'Back to course' : 'Back to exercises'}</button>
        <div><span className={`session-kind session-line-${activity.line}`}>{activity.kind === 'lesson' ? 'Course lesson' : 'Independent exercise'}</span><span>{activity.minutes} min</span></div>
      </header>
      <div className="session-title"><h1>{activity.title}</h1><p>{activity.description}</p></div>
      {started && !finished && (
        <div className="session-route-progress">
          <div><span>{session!.answers.length} of {activity.questions.length} answers saved</span><span>Continue at your own pace</span></div>
          <progress max={activity.questions.length} value={session!.answers.length} aria-label="Saved answers" />
        </div>
      )}
      {audioError && <p className="session-audio-error" role="status">{audioError}</p>}
      <div className="session-workspace">
        <aside className="session-notes" aria-label="Lesson notes">
          <button
            type="button"
            className="session-notes-toggle"
            aria-expanded={notesOpen}
            aria-controls="session-lesson-notes"
            onClick={() => { stopAudio(); setNotesOpen((value) => !value) }}
          >
            <span>{notesOpen ? 'Hide lesson notes' : 'Show lesson notes'}</span>
            <span aria-hidden="true">{notesOpen ? '−' : '+'}</span>
          </button>
          <div id="session-lesson-notes" className={`session-notes-content${notesOpen ? ' is-open' : ' is-collapsed'}`}>
          <span className="session-panel-label">Learn</span>
          <h2>What you will practise</h2>
          <ul className="session-objectives">{activity.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
          {activity.id === 'lesson-tones' && <ToneGuide />}
          <div className="session-explanation">{activity.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          {activity.examples.length > 0 && (
            <section className="session-examples" aria-label="Mandarin examples">
              <h3>Examples</h3>
              {activity.examples.map((example) => (
                <div className="session-example" key={`${example.hanzi}-${example.meaning}`}>
                  <strong lang="zh-CN">{example.hanzi}</strong><span>{example.pinyin}</span><p>{example.meaning}</p>
                  <button type="button" className="text-btn" aria-label={`${playingText === example.hanzi ? 'Stop' : 'Listen to'} ${example.hanzi}`} onClick={() => void playAudio(example.hanzi)}>{playingText === example.hanzi ? 'Stop' : 'Listen'} <span aria-hidden="true">♪</span></button>
                </div>
              ))}
              <small className="session-voice-note">Examples use your device's Mandarin voice.</small>
            </section>
          )}
          {activity.fact && (
            <details className="session-nerd-notes">
              <summary>Nerd notes</summary>
              <h3>{activity.fact.title}</h3><p>{activity.fact.text}</p>
              <a href={activity.fact.sourceUrl} target="_blank" rel="noreferrer">{activity.fact.sourceLabel}</a>
            </details>
          )}
          </div>
        </aside>
        {!started ? (
          <>
            <section className="session-intro">
              <span className="session-stop-symbol" aria-hidden="true">站</span>
              <h2>{locked ? 'Preview this stop' : activity.kind === 'lesson' ? 'Ready for the next stop?' : 'Put it all together'}</h2>
              <p>Read the notes, listen to the examples, then work through {activity.questions.length} short questions.</p>
              {locked ? <p className="session-lock-note">Complete the earlier stops on this course line to start this lesson. You can explore its notes now.</p> : (
                <button type="button" className="session-check" disabled={!activity.questions.length} onClick={startSession}>{activity.kind === 'lesson' ? 'Start lesson' : 'Start exercise'}</button>
              )}
            </section>
            <aside className="session-feedback" aria-label="Session overview"><h2>How it works</h2><p>Choose answers and build sentences. Every checked answer includes an explanation.</p><p>A hint helps you learn; it counts as assisted practice. An independent result of at least 80% passes this session.</p><p>You can practise speaking and writing with this topic's words after the questions.</p></aside>
          </>
        ) : finished && session && score ? (
          <>
            <section className="session-results" aria-label="Session results">
              <span className={`session-result-symbol${score.passed ? ' is-passed' : ''}`} aria-hidden="true">{score.passed ? '✓' : '↺'}</span>
              <h2 ref={resultsHeadingRef} tabIndex={-1}>{score.passed ? activity.kind === 'lesson' ? 'Stop completed' : 'Exercise completed' : activity.kind === 'lesson' ? 'Keep exploring this stop' : 'Keep practising this topic'}</h2>
              <div className="session-result-score"><strong>{score.percent}%</strong><span>correct without a hint</span></div>
              <p>{score.correct} of {score.total} questions answered correctly without a hint.</p>
              <p>{score.passed ? 'You can continue your journey or practise the words in another way.' : 'Review the explanations and try again. Your previous results stay saved.'}</p>
              <div className="session-result-actions"><button type="button" className="session-check" onClick={leave}>{activity.kind === 'lesson' ? 'Return to course map' : 'Return to exercises'}</button><button type="button" className="secondary-btn" onClick={startSession}>Try questions again</button></div>
              <div className="session-practice-links"><h3>Use these words</h3><button type="button" className="secondary-btn" onClick={() => practise('speech')}>Speaking</button><button type="button" className="secondary-btn" onClick={() => practise('writing')}>Writing</button><button type="button" className="secondary-btn" onClick={() => practise('flashcards')}>Flashcards</button></div>
              <small className="session-voice-note">This result checks choices and word order. Speaking practice currently compares recognized text; acoustic tone assessment is not included.</small>
            </section>
            <aside className="session-feedback" aria-label="Questions to revisit">
              <span className="session-panel-label">Review</span><h2>{weakerQuestions.length ? 'Worth another look' : 'A clear run'}</h2>
              {!weakerQuestions.length && <p>You answered every question correctly without a hint.</p>}
              <ul className="session-review-list">{weakerQuestions.map((item) => {
                const answer = session.answers.find((saved) => saved.questionId === item.id)
                return <li key={item.id}><span>{answer?.assisted || session.hintedQuestionIds?.includes(item.id) ? 'Hint used' : 'Answer to revisit'}</span><strong>{item.prompt}</strong><p>Accepted answer: {answerText(item)}</p><p>{item.explanation}</p></li>
              })}</ul>
            </aside>
          </>
        ) : question ? (
          <QuestionTask
            key={`${session!.id}-${question.id}`}
            question={question}
            questionNumber={currentIndex + 1}
            total={activity.questions.length}
            answer={session!.answers.find((saved) => saved.questionId === question.id)}
            previouslyHinted={Boolean(session!.hintedQuestionIds?.includes(question.id))}
            onHint={() => recordHint(question.id)}
            onCheck={check}
            onNext={nextQuestion}
            onPrevious={() => { stopAudio(); setCurrentIndex((index) => Math.max(0, index - 1)) }}
            onPlay={(text) => void playAudio(text)}
            playingText={playingText}
          />
        ) : <section className="session-intro"><h2>Questions are not available yet</h2><p>You can still read the notes and listen to the examples.</p></section>}
      </div>
    </main>
  )
}

export default function LearningSessionPage(props: Props) {
  return <LearningSessionWorkspace key={props.activity.id} {...props} />
}

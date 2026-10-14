import { useEffect, useMemo, useRef, useState } from 'react'
import HanziWriter from 'hanzi-writer'
import CharacterPicker from './CharacterPicker'
import type { AttemptInput, Card } from '../types/study'
import {
  createWritingTarget,
  loadStrokeData,
  writingCharacters,
  type WritingCharacter,
} from '../lib/writing'

type WritingPageProps = {
  cards: Card[]
  onBack: () => void
  onAttempt: (attempt: AttemptInput) => void
}

type WritingMode = 'guide' | 'recall'
type ExerciseState = 'loading' | 'ready' | 'animating' | 'complete' | 'error'

function WritingExercise({
  choice,
  mode,
  onAttempt,
}: {
  choice: WritingCharacter
  mode: WritingMode
  onAttempt: WritingPageProps['onAttempt']
}) {
  const [round, setRound] = useState(0)
  const [state, setState] = useState<ExerciseState>('loading')
  const [feedback, setFeedback] = useState('Loading the stroke template…')
  const [strokeCount, setStrokeCount] = useState(0)
  const [finishedStrokes, setFinishedStrokes] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [usedHint, setUsedHint] = useState(false)
  const boardRef = useRef<HTMLDivElement>(null)
  const writerRef = useRef<HanziWriter | null>(null)
  const attemptCallback = useRef(onAttempt)
  const hintRef = useRef(false)
  const nextStrokeRef = useRef(0)
  const generationRef = useRef(0)

  useEffect(() => {
    attemptCallback.current = onAttempt
  }, [onAttempt])

  useEffect(() => {
    const host = boardRef.current
    if (!host) return

    let active = true
    let completed = false
    const generation = ++generationRef.current
    const target = createWritingTarget(host)
    const size = host.clientWidth || 320
    const writer = new HanziWriter(host, {
      width: size,
      height: size,
      padding: size * 0.08,
      charDataLoader: loadStrokeData,
      rendererOverride: { createRenderTarget: target.createRenderTarget, HanziWriterRenderer: target.HanziWriterRenderer },
      showCharacter: false,
      showOutline: mode === 'guide',
      strokeColor: '#204e42',
      outlineColor: '#dfe7db',
      drawingColor: '#204e42',
      highlightColor: '#cc804b',
      // Maximum brush size in character coordinates. The custom renderer tapers
      // the actual input path and uses pen pressure where the device provides it.
      drawingWidth: 72,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 280,
      acceptBackwardsStrokes: false,
    })
    writerRef.current = writer
    const observer = new ResizeObserver(() => {
      const width = host.clientWidth
      if (width > 0) writer.updateDimensions({ width, height: width, padding: width * 0.08 })
    })
    observer.observe(host)

    async function initialize() {
      try {
        const data = await loadStrokeData(choice.character)
        if (!active) return
        await writer.setCharacter(choice.character)
        if (!active) return

        setStrokeCount(data.strokes.length)
        setFinishedStrokes(0)
        setMistakes(0)
        setUsedHint(false)
        hintRef.current = false
        nextStrokeRef.current = 0
        setState('ready')
        setFeedback(mode === 'guide'
          ? 'Trace the outline in the correct order and direction.'
          : 'Write the character from memory. Start with the first stroke.')
        const startedAt = Date.now()

        void writer.quiz({
          showHintAfterMisses: mode === 'guide' ? 3 : false,
          acceptBackwardsStrokes: false,
          onMistake(result) {
            if (!active || completed) return
            setMistakes(result.totalMistakes)
            setFeedback(result.isBackwards
              ? 'The stroke runs backwards. Start at the other end.'
              : 'The stroke shape or order does not match. Try again.')
          },
          onCorrectStroke(result) {
            if (!active || completed) return
            nextStrokeRef.current = result.strokeNum + 1
            setFinishedStrokes(data.strokes.length - result.strokesRemaining)
            setFeedback(result.strokesRemaining
              ? `Correct. ${result.strokesRemaining} ${result.strokesRemaining === 1 ? 'stroke' : 'strokes'} remaining.`
              : 'Character complete.')
          },
          onComplete(summary) {
            if (!active || completed) return
            completed = true
            setState('complete')
            setMistakes(summary.totalMistakes)

            const assisted = mode === 'guide' || hintRef.current
            attemptCallback.current({
              mode: 'writing',
              cardId: choice.card.id,
              correct: summary.totalMistakes === 0,
              input: 'writing',
              expectedText: choice.character,
              responseText: choice.character,
              mistakes: summary.totalMistakes,
              assisted,
              durationMs: Date.now() - startedAt,
            })

            if (!assisted) {
              setFeedback(summary.totalMistakes === 0
                ? 'Written without corrections. Your result is saved.'
                : `Completed with ${summary.totalMistakes} ${summary.totalMistakes === 1 ? 'correction' : 'corrections'}. Your result is saved; try the character again.`)
            } else {
              setFeedback('Guided practice saved. Try writing from memory without a hint.')
            }
          },
        })
      } catch (error) {
        if (!active) return
        setState('error')
        setFeedback(error instanceof Error ? error.message : 'The stroke template could not be loaded.')
      }
    }

    void initialize()

    return () => {
      active = false
      generationRef.current = generation + 1
      observer.disconnect()
      writer.cancelQuiz()
      void writer.pauseAnimation()
      target.dispose()
      if (writerRef.current === writer) writerRef.current = null
    }
  }, [choice.character, choice.card.id, mode, round])

  function retry() {
    setState('loading')
    setFeedback('Preparing a new attempt…')
    setFinishedStrokes(0)
    setMistakes(0)
    setUsedHint(false)
    setRound((value) => value + 1)
  }

  async function showStrokeHint() {
    const writer = writerRef.current
    if (!writer || state !== 'ready') return
    hintRef.current = true
    setUsedHint(true)
    setFeedback('The next stroke is highlighted. This attempt counts as guided practice.')
    await writer.highlightStroke(nextStrokeRef.current)
  }

  async function animate() {
    const writer = writerRef.current
    if (!writer || state === 'loading' || state === 'animating' || state === 'error') return
    const generation = generationRef.current
    writer.cancelQuiz()
    setState('animating')
    setFeedback('Watch the direction and order of the strokes.')

    try {
      await writer.animateCharacter()
      if (generationRef.current !== generation) return
      setState('complete')
      setFeedback('Stroke order complete. Select Try again to write the character yourself.')
    } catch {
      if (generationRef.current !== generation) return
      setState('error')
      setFeedback('The animation could not be played. Try again.')
    }
  }

  return (
    <section className="card-surface writing-exercise" aria-label={`Practice writing ${choice.character}`}>
      <div className="writing-word">
        <p>
          <strong lang="zh-CN">{choice.card.hanzi}</strong>
          <span className="pinyin">{choice.card.pinyin}</span>
        </p>
        <p>{choice.card.meaning}</p>
      </div>

      <div
        ref={boardRef}
        className="writing-board"
        role="group"
        aria-label={`Writing board for ${choice.character}; draw with your finger, pen or mouse`}
        aria-describedby="writing-instructions"
      />

      <div className="writing-counts">
        <span>Strokes: {finishedStrokes} / {strokeCount || '–'}</span>
        <span>Mistakes: {mistakes}</span>
        {usedHint && <span>Hint used</span>}
      </div>

      <p
        className={`status-message ${state === 'error' ? 'error' : ''}`}
        role={state === 'error' ? 'alert' : 'status'}
      >
        {feedback}
      </p>

      <div className="action-row writing-tools">
        <button
          className="secondary-button"
          type="button"
          onClick={() => void animate()}
          disabled={state === 'loading' || state === 'animating' || state === 'error'}
        >
          {state === 'animating' ? 'Playing…' : 'Show stroke order'}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void showStrokeHint()}
          disabled={state !== 'ready'}
        >
          Hint next stroke
        </button>
        <button type="button" onClick={retry} disabled={state === 'loading'}>
          Try again
        </button>
      </div>
    </section>
  )
}

export default function WritingPage({ cards, onBack, onAttempt }: WritingPageProps) {
  const characters = useMemo(() => writingCharacters(cards), [cards])
  const [selected, setSelected] = useState(() => characters[0]?.character ?? '')
  const [mode, setMode] = useState<WritingMode>('guide')
  const [pickerOpen, setPickerOpen] = useState(false)
  const choice = characters.find((item) => item.character === selected) ?? characters[0]
  const currentIndex = choice ? characters.indexOf(choice) : 0

  function move(direction: number) {
    const next = (currentIndex + direction + characters.length) % characters.length
    setSelected(characters[next].character)
  }

  return (
    <main className="practice-page writing-page">
      <header className="practice-header">
        <button className="secondary-button" type="button" onClick={onBack}>Back</button>
        {choice && <span>Character {currentIndex + 1} / {characters.length}</span>}
      </header>

      <div className="page-title">
        <h1>Writing</h1>
      </div>

      {!choice ? (
        <section className="card-surface empty-state">
          <h2>This topic has no Chinese characters.</h2>
          <p>Go back to learning and choose another topic.</p>
        </section>
      ) : (
        <>
          <div className="writing-selection">
            <button
              type="button"
              className="choose-character-button secondary-button"
              aria-label="Choose character"
              aria-haspopup="dialog"
              onClick={() => setPickerOpen(true)}
            >
              <span className="choose-character-current" lang="zh-CN" aria-hidden="true">{choice.character}</span>
              Choose character
            </button>
            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                aria-label="Previous character"
                onClick={() => move(-1)}
                disabled={characters.length < 2}
              >
                Previous
              </button>
              <button
                className="secondary-button"
                type="button"
                aria-label="Next character"
                onClick={() => move(1)}
                disabled={characters.length < 2}
              >
                Next
              </button>
            </div>
          </div>

          <div className="segmented-control" aria-label="Writing mode">
            <button
              type="button"
              aria-pressed={mode === 'guide'}
              className={mode === 'guide' ? 'active' : ''}
              onClick={() => setMode('guide')}
            >
              With outline
            </button>
            <button
              type="button"
              aria-pressed={mode === 'recall'}
              className={mode === 'recall' ? 'active' : ''}
              onClick={() => setMode('recall')}
            >
              From memory
            </button>
          </div>

          <WritingExercise
            key={`${choice.character}-${mode}`}
            choice={choice}
            mode={mode}
            onAttempt={onAttempt}
          />
          <details className="practice-help">
            <summary>Writing help</summary>
            <p id="writing-instructions">Draw with your finger, pen or mouse. Follow the stroke order; the shape and direction of each stroke are checked.</p>
            <p>With outline is guided practice. From memory hides the outline. Accuracy counts independent attempts without a hint.</p>
            <p>Showing the stroke order ends the current attempt. When it finishes, select Try again to start a new one.</p>
          </details>
          {pickerOpen && (
            <CharacterPicker
              characters={characters}
              selected={choice.character}
              onSelect={(character) => {
                setSelected(character)
                setPickerOpen(false)
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </>
      )}
    </main>
  )
}

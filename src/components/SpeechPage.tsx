import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  isSpeechAbort,
  isSpeechRecognitionSupported,
  normalizeSpeechText,
  recognizeSpeech,
  speakChinese,
  speechErrorMessage,
  speechTextMatches,
} from '../lib/speech'
import type { AttemptInput, Card } from '../types/study'

type SpeechPageProps = {
  onBack: () => void
  cards: Card[]
  onAttempt: (attempt: AttemptInput) => void
}

type Status =
  | 'idle'
  | 'preparing-recording'
  | 'recording'
  | 'finishing-recording'
  | 'recognizing'
  | 'speaking'
type Operation = { cardId: string; controller: AbortController }
type SpeechResult = { cardId: string; text: string; input: 'recognition' | 'manual'; matched: boolean }

const statusMessages: Record<Status, string> = {
  idle: '',
  'preparing-recording': 'Preparing the microphone. Allow recording if prompted.',
  recording: 'Recording. Read the word, then stop recording.',
  'finishing-recording': 'Processing your recording…',
  recognizing: 'Listening… Say the Chinese word aloud.',
  speaking: 'Playing the example pronunciation…',
}

function SpeechPage({ onBack, cards, onAttempt }: SpeechPageProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SpeechResult | null>(null)
  const [manualText, setManualText] = useState('')

  const currentCard = cards[currentIndex] ?? cards[0]
  const mountedRef = useRef(false)
  const currentCardIdRef = useRef(currentCard?.id)
  const operationRef = useRef<Operation | null>(null)
  const recordingRef = useRef<{ recorder: MediaRecorder; stream: MediaStream } | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const audioUrlRef = useRef<string | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  const attachAudioPlayer = useCallback((player: HTMLAudioElement | null) => {
    if (!player) audioPlayerRef.current?.pause()
    audioPlayerRef.current = player
  }, [])

  const releaseRecorder = useCallback(() => {
    clearTimeout(recordTimerRef.current)
    recordTimerRef.current = undefined
    const recording = recordingRef.current
    recordingRef.current = null
    if (!recording) return
    recording.recorder.ondataavailable = null
    recording.recorder.onstop = null
    recording.recorder.onerror = null
    try {
      if (recording.recorder.state !== 'inactive') recording.recorder.stop()
    } catch { /* Tracks still have to be released if the recorder has failed. */ }
    recording.stream.getTracks().forEach((track) => track.stop())
  }, [])

  const cancelOperation = useCallback((updateState = true) => {
    const operation = operationRef.current
    operationRef.current = null
    operation?.controller.abort()
    releaseRecorder()
    if (updateState && mountedRef.current) setStatus('idle')
  }, [releaseRecorder])

  const replaceAudio = useCallback((nextUrl: string | null) => {
    audioPlayerRef.current?.pause()
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = nextUrl
    setAudioUrl(nextUrl)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const visibilityChanged = () => { if (document.hidden) cancelOperation() }
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', visibilityChanged)
      cancelOperation(false)
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [cancelOperation])

  useEffect(() => {
    currentCardIdRef.current = currentCard?.id
  }, [currentCard?.id])

  const busy = status !== 'idle'
  const canRecord = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const canRecognize = isSpeechRecognitionSupported()
  const visibleResult = result?.cardId === currentCard?.id ? result : null

  function beginOperation(nextStatus: Status): Operation | null {
    if (!currentCard || operationRef.current) return null
    audioPlayerRef.current?.pause()
    setError(null)
    const operation = { cardId: currentCard.id, controller: new AbortController() }
    operationRef.current = operation
    setStatus(nextStatus)
    return operation
  }

  function isCurrent(operation: Operation): boolean {
    return mountedRef.current && operationRef.current === operation &&
      currentCardIdRef.current === operation.cardId && !operation.controller.signal.aborted
  }

  function finishOperation(operation: Operation) {
    if (operationRef.current !== operation) return
    operationRef.current = null
    if (mountedRef.current) setStatus('idle')
  }

  function recordResult(card: Card, text: string, input: 'recognition' | 'manual') {
    const matched = speechTextMatches(text, card.hanzi)
    setResult({ cardId: card.id, text, input, matched })
    onAttempt({
      mode: 'speech',
      cardId: card.id,
      correct: matched,
      input,
      expectedText: card.hanzi,
      responseText: text,
    })
  }

  async function startRecognition() {
    const card = currentCard
    const operation = beginOperation('recognizing')
    if (!operation || !card) return
    replaceAudio(null)
    setResult(null)
    try {
      const text = await recognizeSpeech(operation.controller.signal)
      if (isCurrent(operation)) recordResult(card, text, 'recognition')
    } catch (failure) {
      if (isCurrent(operation) && !isSpeechAbort(failure)) setError(speechErrorMessage(failure))
    } finally {
      finishOperation(operation)
    }
  }

  async function playReference(rate = 0.9) {
    const card = currentCard
    const operation = beginOperation('speaking')
    if (!operation || !card) return
    try {
      await speakChinese(card.hanzi, { signal: operation.controller.signal, rate })
    } catch (failure) {
      if (isCurrent(operation) && !isSpeechAbort(failure)) setError(speechErrorMessage(failure))
    } finally {
      finishOperation(operation)
    }
  }

  async function startRecording() {
    if (!canRecord) {
      setError('Recording is not available on this device.')
      return
    }
    const operation = beginOperation('preparing-recording')
    if (!operation) return
    replaceAudio(null)
    setResult(null)
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!isCurrent(operation)) {
        stream.getTracks().forEach((track) => track.stop())
        finishOperation(operation)
        return
      }
      const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
        ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
        : undefined
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recordingRef.current = { recorder, stream }
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => {
        if (!isCurrent(operation)) return
        cancelOperation()
        setError('Recording was interrupted. Check your microphone and try again.')
      }
      recorder.onstop = () => {
        if (recordingRef.current?.recorder !== recorder) return
        releaseRecorder()
        if (!isCurrent(operation)) { finishOperation(operation); return }
        const recording = new Blob(chunks, { type: recorder.mimeType })
        if (recording.size) replaceAudio(URL.createObjectURL(recording))
        else setError('The recording is empty. Try again.')
        finishOperation(operation)
      }
      recorder.start()
      setStatus('recording')
      recordTimerRef.current = setTimeout(() => {
        if (isCurrent(operation)) stopRecording()
      }, 30_000)
    } catch (failure) {
      stream?.getTracks().forEach((track) => track.stop())
      if (isCurrent(operation)) {
        releaseRecorder()
        setError(speechErrorMessage(failure))
      }
      finishOperation(operation)
    }
  }

  function stopRecording() {
    const recording = recordingRef.current
    if (!recording || recording.recorder.state === 'inactive') return
    clearTimeout(recordTimerRef.current)
    setStatus('finishing-recording')
    try { recording.recorder.stop() } catch {
      cancelOperation()
      setError('The recording could not be completed. Try again.')
    }
  }

  function showNextCard() {
    if (operationRef.current || !cards.length) return
    replaceAudio(null)
    setError(null)
    setResult(null)
    setManualText('')
    setCurrentIndex((index) => (index + 1) % cards.length)
  }

  function submitManualAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operationRef.current || !currentCard) return
    const text = manualText.trim()
    if (!normalizeSpeechText(text)) {
      setError('Enter the Chinese word in simplified characters.')
      return
    }
    setError(null)
    recordResult(currentCard, text, 'manual')
    setManualText('')
  }

  function goBack() {
    cancelOperation()
    audioPlayerRef.current?.pause()
    onBack()
  }

  if (!currentCard) {
    return (
      <main className="speech-page">
        <button type="button" onClick={goBack}>Back</button>
        <p>There are no words in this selection.</p>
      </main>
    )
  }

  return (
    <main className="speech-page">
      <header className="speech-header">
        <button type="button" className="secondary-btn" onClick={goBack}>Back</button>
        <p>Word {Math.min(currentIndex + 1, cards.length)} / {cards.length}</p>
      </header>
      <div className="practice-heading">
        <h1>Speaking</h1>
      </div>
      <article className="speech-card">
        <div className="hanzi" lang="zh-CN">{currentCard.hanzi}</div>
        <p className="pinyin">{currentCard.pinyin}</p>
        <p>{currentCard.meaning}</p>
        <div className="speech-actions">
          <button
            type="button"
            className="secondary-btn"
            disabled={busy}
            onClick={() => void playReference()}
          >
            Listen
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={busy}
            onClick={() => void playReference(0.65)}
          >
            Slower
          </button>
        </div>
      </article>
      <section className="speech-tools" aria-label="Speaking practice">
        <div className="speech-actions">
          <button
            type="button"
            disabled={busy || !canRecognize}
            onClick={() => void startRecognition()}
          >
            Recognize my word
          </button>
          {status === 'recording' ? (
            <button type="button" className="secondary-btn" onClick={stopRecording}>
              Stop recording
            </button>
          ) : (
            <button
              type="button"
              className="secondary-btn"
              disabled={busy || !canRecord}
              onClick={() => void startRecording()}
            >
              Record my voice
            </button>
          )}
        </div>
        {busy && (
          <div className="status-note" role="status">
            <p>{statusMessages[status]}</p>
            <button type="button" className="secondary-btn" onClick={() => cancelOperation()}>
              Cancel
            </button>
          </div>
        )}
        {!canRecognize && (
          <p className="status-note">Speech recognition is not available here. You can submit a typed answer.</p>
        )}
        {!canRecord && (
          <p className="status-note">Recording and playing back your voice are not available here.</p>
        )}
      </section>
      {error && <p className="error-message" role="alert">{error}</p>}
      {audioUrl && (
        <section className="feedback-panel">
          <h2>Your recording</h2>
          <audio ref={attachAudioPlayer} src={audioUrl} controls />
          <p>Listen to your voice and compare it with the example.</p>
        </section>
      )}
      {visibleResult && (
        <section
          className={`feedback-panel ${visibleResult.matched ? 'is-correct' : 'is-incorrect'}`}
          aria-live="polite"
        >
          <p>{visibleResult.input === 'recognition' ? 'Recognized word' : 'Typed answer'}</p>
          <h2 lang="zh-CN">{visibleResult.text}</h2>
          <p>
            {visibleResult.matched
              ? 'The text matches the prompt.'
              : 'The text does not match the prompt. Check the characters and try again.'}
          </p>
          {visibleResult.input === 'recognition' && <p>Text matching does not assess pronunciation or tones.</p>}
        </section>
      )}
      <div className="practice-next">
        <button type="button" onClick={showNextCard} disabled={busy}>Next word</button>
      </div>
      <details className="practice-help manual-entry" open={!canRecognize || undefined}>
        <summary>Submit a typed answer</summary>
        <form onSubmit={submitManualAnswer}>
          <label htmlFor="manual-speech-answer">Answer in Chinese characters</label>
          <div className="speech-actions">
            <input
              id="manual-speech-answer"
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder="Enter a Chinese word…"
              lang="zh-CN"
              autoComplete="off"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !manualText.trim()}>Compare</button>
          </div>
        </form>
      </details>
      <details className="practice-help">
        <summary>How speaking is checked</summary>
        <p>The recognized word is compared with the prompt in simplified Chinese characters. Text matching does not assess pronunciation quality or tone accuracy.</p>
        <p>Recognition uses your device or browser’s speech service and may need an internet connection. You can play back your recording to compare it yourself; it is not automatically scored.</p>
        <p>Typed answers are saved separately and excluded from speech recognition results.</p>
      </details>
    </main>
  )
}

export default SpeechPage

import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { TextToSpeech } from '@capacitor-community/text-to-speech'

type RecognitionResultEvent = {
  results: { [index: number]: { [index: number]: { transcript: string } } }
}

export type BrowserSpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition
}

export function createSpeechRecognition(): BrowserSpeechRecognition | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as SpeechWindow
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  if (!Recognition) return null
  const recognition = new Recognition()
  recognition.lang = 'zh-CN'
  recognition.continuous = false
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  return recognition
}

export function isSpeechRecognitionSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true
  if (typeof window === 'undefined') return false
  const speechWindow = window as SpeechWindow
  return Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition)
}

export function normalizeSpeechText(text: string): string {
  return text.normalize('NFKC').replace(/[\p{P}\s]/gu, '')
}

export function speechTextMatches(response: string, expected: string): boolean {
  const normalized = normalizeSpeechText(response)
  return normalized.length > 0 && normalized === normalizeSpeechText(expected)
}

class SpeechError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'SpeechError'
  }
}

export function isSpeechAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function speechErrorMessage(error: unknown): string {
  const code = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  if (/not-allowed|service-not-allowed|permission|NotAllowedError/i.test(code)) {
    return 'Allow microphone access in your app or browser settings.'
  }
  if (/no-speech|no match|no speech input/i.test(code)) {
    return 'No word was recognized. Move closer to the microphone and try again.'
  }
  if (/unsupported|not available|unavailable/i.test(code)) {
    return 'Speech recognition is not available on this device. You can submit a typed answer.'
  }
  if (/voice-missing/i.test(code)) {
    return 'A Chinese voice is not available. Add a Mandarin voice to your device and try again.'
  }
  if (/audio-capture|NotFoundError/i.test(code)) {
    return 'The microphone is not available. Check its connection and your device settings.'
  }
  if (/network|server/i.test(code)) {
    return 'Recognition needs an available speech service. Check your connection and try again.'
  }
  if (/timeout/i.test(code)) return 'The speech operation took too long. Try again.'
  return 'The speech operation could not be completed. Try again or submit a typed answer.'
}

// Every operation has one outcome; cancellation also covers pending permissions.
function runOperation<T>(
  signal: AbortSignal | undefined,
  timeoutMs: number,
  run: (complete: (value: T) => void, fail: (error: unknown) => void, active: () => boolean) => void | Promise<void>,
  dispose: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let active = true
    const close = () => {
      if (!active) return false
      active = false
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      try { dispose() } catch { /* Cleanup must not replace the operation result. */ }
      return true
    }
    const complete = (value: T) => { if (close()) resolve(value) }
    const fail = (error: unknown) => { if (close()) reject(error) }
    const abort = () => fail(new DOMException('Operation cancelled', 'AbortError'))
    const timer = setTimeout(() => fail(new SpeechError('timeout')), timeoutMs)
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    void Promise.resolve().then(() => {
      if (active) return run(complete, fail, () => active)
    }).catch(fail)
  })
}

export function recognizeSpeech(signal?: AbortSignal): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    let started = false
    return runOperation<string>(signal, 30_000, async (complete, fail, active) => {
      const availability = await SpeechRecognition.available()
      if (!active()) return
      if (!availability.available) { fail(new SpeechError('unsupported')); return }
      let permission = await SpeechRecognition.checkPermissions()
      if (!active()) return
      if (permission.speechRecognition !== 'granted') {
        permission = await SpeechRecognition.requestPermissions()
        if (!active()) return
      }
      if (permission.speechRecognition !== 'granted') {
        fail(new SpeechError('permission')); return
      }
      started = true
      const result = await SpeechRecognition.start({
        language: 'zh-CN', maxResults: 1, partialResults: false, popup: false,
      })
      if (!active()) return
      started = false // A final native result has already ended microphone capture.
      const text = result.matches?.[0]?.trim() ?? ''
      if (normalizeSpeechText(text)) complete(text)
      else fail(new SpeechError('no-speech'))
    }, () => {
      // Plugin 7's Android stop() can leave its promise pending: never await it.
      if (started) void SpeechRecognition.stop().catch(() => undefined)
    })
  }

  let recognition: BrowserSpeechRecognition | null = null
  return runOperation<string>(signal, 25_000, (complete, fail) => {
    recognition = createSpeechRecognition()
    if (!recognition) { fail(new SpeechError('unsupported')); return }
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript.trim() ?? ''
      if (normalizeSpeechText(text)) complete(text)
      else fail(new SpeechError('no-speech'))
    }
    recognition.onerror = (event) => fail(new SpeechError(event.error))
    recognition.onend = () => fail(new SpeechError('no-speech'))
    recognition.start()
  }, () => {
    if (!recognition) return
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    recognition.abort()
  })
}

// Prefer mainland Mandarin, then another Mandarin voice; never fall back to English.
function mandarinVoiceRank(language: string): number {
  const tag = language.toLowerCase().replaceAll('_', '-')
  if (/^yue|-(hk|mo)(-|$)/.test(tag)) return Infinity
  if (/^(zh-cn|zh-hans|cmn-cn)/.test(tag)) return 0
  if (/^(zh-sg|cmn)/.test(tag)) return 1
  if (/^(zh-tw|zh-hant)/.test(tag) || tag === 'zh') return 2
  return Infinity
}

function browserVoices(signal?: AbortSignal): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve, reject) => {
    const synthesis = window.speechSynthesis
    const cleanup = () => {
      clearTimeout(timer)
      synthesis.removeEventListener('voiceschanged', loaded)
      signal?.removeEventListener('abort', abort)
    }
    const loaded = () => {
      const voices = synthesis.getVoices()
      if (voices.length) { cleanup(); resolve(voices) }
    }
    const abort = () => { cleanup(); reject(new DOMException('Operation cancelled', 'AbortError')) }
    const timer = setTimeout(() => { cleanup(); resolve(synthesis.getVoices()) }, 1_500)
    if (signal?.aborted) { abort(); return }
    const voices = synthesis.getVoices()
    if (voices.length) { cleanup(); resolve(voices); return }
    synthesis.addEventListener('voiceschanged', loaded)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export function stopSpeaking(): void {
  if (Capacitor.isNativePlatform()) void TextToSpeech.stop().catch(() => undefined)
  else if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
}

export function speakChinese(
  text: string,
  options: { signal?: AbortSignal; rate?: number } = {},
): Promise<void> {
  let started = false
  let utterance: SpeechSynthesisUtterance | null = null
  return runOperation<void>(options.signal, 30_000, async (complete, fail, active) => {
    if (Capacitor.isNativePlatform()) {
      const { languages } = await TextToSpeech.getSupportedLanguages()
      if (!active()) return
      const language = [...languages].sort((a, b) => mandarinVoiceRank(a) - mandarinVoiceRank(b))
        .find((candidate) => Number.isFinite(mandarinVoiceRank(candidate)))
      if (!language) { fail(new SpeechError('voice-missing')); return }
      started = true
      await TextToSpeech.speak({ text, lang: language, rate: options.rate ?? 0.9, pitch: 1, volume: 1 })
      if (active()) complete()
      return
    }
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      fail(new SpeechError('voice-missing')); return
    }
    const voices = await browserVoices(options.signal)
    if (!active()) return
    const voice = [...voices].sort((a, b) => mandarinVoiceRank(a.lang) - mandarinVoiceRank(b.lang))
      .find((candidate) => Number.isFinite(mandarinVoiceRank(candidate.lang)))
    if (!voice) { fail(new SpeechError('voice-missing')); return }
    utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = voice.lang
    utterance.voice = voice
    utterance.rate = options.rate ?? 0.9
    utterance.onend = () => complete()
    utterance.onerror = () => fail(new SpeechError('voice-playback'))
    started = true
    window.speechSynthesis.speak(utterance)
  }, () => {
    if (utterance) { utterance.onend = null; utterance.onerror = null }
    if (started) stopSpeaking()
  })
}

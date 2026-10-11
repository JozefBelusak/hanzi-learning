import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recognizeSpeech,
  speakChinese,
  speechErrorMessage,
  speechTextMatches,
  type BrowserSpeechRecognition,
} from './speech'

const platform = vi.hoisted(() => ({ native: false }))
const nativeRecognition = vi.hoisted(() => ({
  available: vi.fn(), checkPermissions: vi.fn(), requestPermissions: vi.fn(), start: vi.fn(), stop: vi.fn(),
}))
const nativeTts = vi.hoisted(() => ({ getSupportedLanguages: vi.fn(), speak: vi.fn(), stop: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => platform.native } }))
vi.mock('@capacitor-community/speech-recognition', () => ({ SpeechRecognition: nativeRecognition }))
vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: nativeTts }))

class FakeRecognition implements BrowserSpeechRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = true
  interimResults = true
  maxAlternatives = 0
  onresult: BrowserSpeechRecognition['onresult'] = null
  onerror: BrowserSpeechRecognition['onerror'] = null
  onend: BrowserSpeechRecognition['onend'] = null
  start = vi.fn()
  abort = vi.fn()
  constructor() { FakeRecognition.last = this }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  platform.native = false
  FakeRecognition.last = null
  vi.stubGlobal('window', { SpeechRecognition: FakeRecognition })
  nativeRecognition.available.mockResolvedValue({ available: true })
  nativeRecognition.checkPermissions.mockResolvedValue({ speechRecognition: 'granted' })
  nativeRecognition.requestPermissions.mockResolvedValue({ speechRecognition: 'granted' })
  nativeRecognition.start.mockResolvedValue({ matches: ['水'] })
  nativeRecognition.stop.mockResolvedValue(undefined)
  nativeTts.getSupportedLanguages.mockResolvedValue({ languages: ['zh-CN'] })
  nativeTts.speak.mockResolvedValue(undefined)
  nativeTts.stop.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('text comparison', () => {
  it('normalizes spacing, punctuation and compatibility characters without accepting different words', () => {
    expect(speechTextMatches(' 你，好！ ', '你好')).toBe(true)
    expect(speechTextMatches('Ａ。', 'A')).toBe(true)
    expect(speechTextMatches('你好', '你')).toBe(false)
    expect(speechTextMatches('。 ', '')).toBe(false)
    expect(speechTextMatches('學', '学')).toBe(false)
  })
})

describe('browser recognition', () => {
  it('returns a final transcript and releases the recognizer', async () => {
    const response = recognizeSpeech()
    await vi.advanceTimersByTimeAsync(0)
    const recognition = FakeRecognition.last!
    expect(recognition.lang).toBe('zh-CN')
    expect(recognition.interimResults).toBe(false)
    recognition.onresult?.({ results: [[{ transcript: ' 我。 ' }]] })
    expect(await response).toBe('我。')
    expect(recognition.abort).toHaveBeenCalledOnce()
    expect(recognition.onresult).toBeNull()
    expect(recognition.onend).toBeNull()
  })

  it('rejects an ended session with no result instead of treating it as a wrong answer', async () => {
    const failure = recognizeSpeech().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    FakeRecognition.last!.onend?.()
    expect(speechErrorMessage(await failure)).toContain('No word was recognized')
  })

  it('cancels and detaches callbacks when leaving the page', async () => {
    const controller = new AbortController()
    const failure = recognizeSpeech(controller.signal).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect(await failure).toMatchObject({ name: 'AbortError' })
    expect(FakeRecognition.last!.abort).toHaveBeenCalledOnce()
    expect(FakeRecognition.last!.onresult).toBeNull()
  })

  it('times out and releases an unresponsive recognizer', async () => {
    const failure = recognizeSpeech().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(25_000)
    expect(speechErrorMessage(await failure)).toContain('too long')
    expect(FakeRecognition.last!.abort).toHaveBeenCalledOnce()
  })
})

describe('native adapters', () => {
  it('does not start listening if a pending permission request finishes after cancellation', async () => {
    platform.native = true
    nativeRecognition.checkPermissions.mockResolvedValue({ speechRecognition: 'prompt' })
    let grant!: (value: { speechRecognition: string }) => void
    nativeRecognition.requestPermissions.mockImplementation(() => new Promise((resolve) => { grant = resolve }))
    const controller = new AbortController()
    const failure = recognizeSpeech(controller.signal).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(nativeRecognition.requestPermissions).toHaveBeenCalledOnce()
    controller.abort()
    expect(await failure).toMatchObject({ name: 'AbortError' })
    grant({ speechRecognition: 'granted' })
    await vi.advanceTimersByTimeAsync(0)
    expect(nativeRecognition.start).not.toHaveBeenCalled()
  })

  it('uses final native results instead of partial recognition hypotheses', async () => {
    platform.native = true
    const response = recognizeSpeech()
    await vi.advanceTimersByTimeAsync(0)
    expect(await response).toBe('水')
    expect(nativeRecognition.start).toHaveBeenCalledWith({ language: 'zh-CN', maxResults: 1, partialResults: false, popup: false })
    expect(nativeRecognition.stop).not.toHaveBeenCalled()
  })

  it('cancels listening without waiting for the Android plugin stop promise', async () => {
    platform.native = true
    nativeRecognition.start.mockImplementation(() => new Promise(() => undefined))
    nativeRecognition.stop.mockImplementation(() => new Promise(() => undefined))
    const controller = new AbortController()
    const failure = recognizeSpeech(controller.signal).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(nativeRecognition.start).toHaveBeenCalledOnce()
    controller.abort()
    expect(await failure).toMatchObject({ name: 'AbortError' })
    expect(nativeRecognition.stop).toHaveBeenCalledOnce()
  })

  it('prefers a Mandarin voice and rejects devices with only other languages', async () => {
    platform.native = true
    nativeTts.getSupportedLanguages.mockResolvedValue({ languages: ['en-US', 'zh-HK', 'zh-TW', 'zh-CN'] })
    const playback = speakChinese('你好')
    await vi.advanceTimersByTimeAsync(0)
    await playback
    expect(nativeTts.speak).toHaveBeenCalledWith(expect.objectContaining({ text: '你好', lang: 'zh-CN' }))
    nativeTts.getSupportedLanguages.mockResolvedValue({ languages: ['en-US', 'zh-HK', 'zh-Hant-HK'] })
    const failure = speakChinese('你好').catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(speechErrorMessage(await failure)).toContain('A Chinese voice is not available')
  })
})

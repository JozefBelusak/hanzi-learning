import { describe, expect, it } from 'vitest'
import { detectVoiceEnvironment, voiceSetupGuide } from './voiceSetup'
import { describeSpeechError } from './speech'

describe('voice setup routing', () => {
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  it('distinguishes Edge, Firefox, Opera, Brave and Chrome without changing voice support', () => {
    for (const [suffix, browser] of [['Chrome/140.0 Safari/537.36 Edg/140.0', 'edge'], ['Firefox/145.0', 'firefox'], ['Chrome/140.0 Safari/537.36 OPR/120.0', 'opera'], ['Chrome/140.0 Safari/537.36', 'chrome']] as const) {
      expect(detectVoiceEnvironment({ userAgent: windows + suffix })).toEqual({ browser, system: 'windows' })
    }
    expect(detectVoiceEnvironment({ userAgent: windows + 'Chrome/140.0', brave: true }).browser).toBe('brave')
    expect(detectVoiceEnvironment({ userAgent: windows + 'Chrome/140.0', brands: [{ brand: 'Brave' }] }).browser).toBe('brave')
  })
  it('chooses the operating-system voice guide, including iPad desktop mode and Android app', () => {
    const samples = [
      { input: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/26.0 Safari/605.1' }, browser: 'safari', system: 'macos', host: 'support.apple.com' },
      { input: { userAgent: 'Mozilla/5.0 (Macintosh) Version/26.0 Safari/605.1', platform: 'MacIntel', maxTouchPoints: 5 }, browser: 'safari', system: 'ios', host: 'support.apple.com' },
      { input: { userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1 EdgiOS/140.0' }, browser: 'edge', system: 'ios', host: 'support.apple.com' },
      { input: { userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/140.0', native: true }, browser: 'native', system: 'android', host: 'support.google.com' },
    ] as const
    for (const sample of samples) {
      const environment = detectVoiceEnvironment(sample.input)
      expect(environment).toEqual({ browser: sample.browser, system: sample.system })
      expect(new URL(voiceSetupGuide(environment).url).host).toBe(sample.host)
    }
    expect(voiceSetupGuide({ browser: 'firefox', system: 'windows' }).settings).toBe('ms-settings:speech')
  })
  it('keeps unknown devices configurable and never sends permission/network failures to voice installation', () => {
    expect(detectVoiceEnvironment({ userAgent: '' })).toEqual({ browser: 'unknown', system: 'unknown' })
    expect(describeSpeechError(new Error('voice-missing')).voiceMissing).toBe(true)
    for (const error of ['permission', 'network', 'unsupported', 'voice-playback']) expect(describeSpeechError(new Error(error)).voiceMissing).toBe(false)
  })
})

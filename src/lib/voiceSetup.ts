export const browserNames = { edge: 'Microsoft Edge', firefox: 'Firefox', brave: 'Brave', opera: 'Opera', chrome: 'Chrome', safari: 'Safari', native: 'Hanzi app', unknown: 'Your browser' }
export const systemNames = { windows: 'Windows', macos: 'macOS', ios: 'iPhone / iPad', android: 'Android', linux: 'Linux', unknown: 'Other device' }
export type VoiceEnvironment = { browser: keyof typeof browserNames; system: keyof typeof systemNames }

// Best-effort local hints only. Actual playback always checks exposed voices.
export function detectVoiceEnvironment(input: { userAgent: string; platform?: string; maxTouchPoints?: number; brands?: { brand: string }[]; brave?: boolean; native?: boolean }): VoiceEnvironment {
  const ua = input.userAgent
  const system = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) || input.platform === 'MacIntel' && (input.maxTouchPoints ?? 0) > 1 ? 'ios' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'macos' : /Linux/i.test(ua) ? 'linux' : 'unknown'
  const brands = (input.brands ?? []).map((item) => item.brand).join(' ')
  const browser = input.native ? 'native' : /Edg(?:e|A|iOS)?\//i.test(ua) || /Microsoft Edge/i.test(brands) ? 'edge' : /Firefox|FxiOS/i.test(ua) ? 'firefox' : /OPR\/|Opera|OPiOS/i.test(ua) || /Opera/i.test(brands) ? 'opera' : input.brave || /Brave/i.test(brands) ? 'brave' : /Chrome|CriOS/i.test(ua) ? 'chrome' : /Safari/i.test(ua) ? 'safari' : 'unknown'
  return { browser, system }
}

export function voiceSetupGuide(environment: VoiceEnvironment) {
  const restart = `Restart ${browserNames[environment.browser]} after the download, then return here.`
  const guides = {
    windows: {
      steps: ['Open Settings → Time & language → Speech.', 'Under Manage voices, choose Add voices and install Chinese (Simplified, China).', restart],
      url: 'https://support.microsoft.com/en-us/accessibility/windows/narrator/appendix-a-supported-languages-and-voices',
      label: 'Windows voice installation guide', settings: 'ms-settings:speech',
    },
    macos: {
      steps: ['Open System Settings → Accessibility → Read & Speak (Spoken Content on older versions).', 'Open the system voice options and download a Chinese Mandarin voice.', restart],
      url: 'https://support.apple.com/guide/mac-help/mchlp2290/mac', label: 'macOS voice installation guide', settings: null,
    },
    ios: {
      steps: ['Open Settings → Accessibility → Read & Speak (Spoken Content on older versions) → Voices.', 'Choose Chinese → Mandarin and download a voice.', restart],
      url: 'https://support.apple.com/guide/iphone/iph96b214f0/ios', label: 'iPhone / iPad voice guide', settings: null,
    },
    android: {
      steps: ['Open device Settings and search for Text-to-speech output.', 'Open the preferred speech engine settings → Install voice data, then download Chinese Mandarin.', restart],
      url: 'https://support.google.com/accessibility/android/answer/6006983?hl=en', label: 'Android voice installation guide', settings: null,
    },
    linux: {
      steps: ['Check your distribution’s speech service and available Mandarin voices.', 'Your browser must expose a Mandarin voice to this app; availability varies by distribution and browser.', restart],
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices', label: 'About browser voice availability', settings: null,
    },
    unknown: {
      steps: ['Choose your device below to see its setup steps.', 'Install a Mandarin text-to-speech voice in the device settings.', restart],
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices', label: 'About browser voice availability', settings: null,
    },
  }
  return guides[environment.system]
}

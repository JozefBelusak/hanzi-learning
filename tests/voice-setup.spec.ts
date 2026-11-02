import { expect, test, accountStudyKey } from './fixtures'
import type { Page } from '@playwright/test'
import { lessons } from '../src/data/learning'

async function mockVoices(page: Page, browser = 'edge') {
  await page.addInitScript((browserName) => {
    const suffixes: Record<string, string> = { edge: 'Chrome/140.0 Safari/537.36 Edg/140.0', firefox: 'Firefox/145.0', opera: 'Chrome/140.0 Safari/537.36 OPR/120.0', brave: 'Chrome/140.0 Safari/537.36' }
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${suffixes[browserName]}` })
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined })
    if (browserName === 'brave') Object.defineProperty(navigator, 'brave', { configurable: true, value: { isBrave: async () => true } })
    let available = false
    const events = new EventTarget()
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      text: string
      lang = ''; voice = null; rate = 1; onend = null; onerror = null
      constructor(text: string) { this.text = text }
    } })
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: available ? 'zh-CN' : 'en-US', name: 'Test voice', voiceURI: 'test', default: true, localService: true }],
      speak: (utterance: SpeechSynthesisUtterance) => { queueMicrotask(() => utterance.onend?.(new Event('end') as SpeechSynthesisEvent)) },
      cancel: () => undefined,
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    } })
    Object.assign(window, { enableMandarinVoice: () => { available = true; events.dispatchEvent(new Event('voiceschanged')) } })
  }, browser)
}

for (const [browser, label] of [['edge', 'Microsoft Edge'], ['firefox', 'Firefox'], ['opera', 'Opera'], ['brave', 'Brave']]) {
  test(`${label}: missing playback voice offers the detected Windows guide and a system-settings link`, async ({ page }) => {
    await mockVoices(page, browser)
    await page.goto('/#/practice/food/speech')
    await page.getByRole('button', { name: 'Listen', exact: true }).click()
    const help = page.getByRole('button', { name: 'Set up voice', exact: true })
    await expect(help).toHaveAttribute('aria-expanded', 'false')
    await help.click()
    const guide = page.getByRole('region', { name: 'Mandarin voice setup', exact: true })
    await expect(guide).toContainText(`${label} · Windows`)
    await expect(guide.getByRole('link', { name: 'Open speech settings' })).toHaveAttribute('href', 'ms-settings:speech')
    await expect(guide.getByRole('link', { name: 'Windows voice installation guide' })).toHaveAttribute('href', /support\.microsoft\.com/)
    await expect(guide).toContainText('Chinese (Simplified, China)')
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').attempts ?? [], accountStudyKey)).toEqual([])
  })
}

test('voice testing reports missing audio, then checks a newly exposed Mandarin voice without grading a speech attempt', async ({ page }) => {
  await mockVoices(page)
  await page.goto('/#/practice/food/speech')
  await page.getByRole('button', { name: 'Listen', exact: true }).click()
  await page.getByRole('button', { name: 'Set up voice', exact: true }).click()
  await page.getByRole('button', { name: 'Test Mandarin voice', exact: true }).click()
  await expect(page.getByText(/No Mandarin audio yet/)).toBeVisible()
  await page.evaluate(() => (window as unknown as { enableMandarinVoice: () => void }).enableMandarinVoice())
  await page.getByRole('button', { name: 'Test Mandarin voice', exact: true }).click()
  await expect(page.getByText('Mandarin voice is ready. Try Listen again.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Listen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Set up voice', exact: true })).toHaveCount(0)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').attempts ?? [], accountStudyKey)).toEqual([])
})

test('manual device correction selects the matching Android instructions and fits a phone screen', async ({ page }) => {
  await mockVoices(page)
  await page.setViewportSize({ width: 360, height: 850 })
  await page.goto('/#/practice/food/speech')
  await page.getByRole('button', { name: 'Listen', exact: true }).click()
  await page.getByRole('button', { name: 'Set up voice', exact: true }).click()
  await page.getByText('Change detected device', { exact: true }).click()
  await page.getByLabel('Operating system', { exact: true }).selectOption('android')
  await expect(page.getByRole('link', { name: 'Android voice installation guide' })).toHaveAttribute('href', /support\.google\.com/)
  await expect(page.getByRole('link', { name: 'Open speech settings' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'playwright-report/mandarin-voice-help-360.png', fullPage: true })
})

test('the same setup is available for flashcard audio and public guest lesson examples', async ({ page }) => {
  await mockVoices(page)
  await page.goto('/#/practice/food/flashcards')
  await page.getByRole('button', { name: 'Show answer', exact: true }).click()
  await page.getByRole('button', { name: 'Listen to the word', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Set up voice', exact: true })).toBeVisible()
  // The signed-in account redirects guest links to its workspace; sign out first.
  await page.getByRole('button', { name: 'Your account', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.goto(`/#/guest/course/${lessons[0].id}`)
  await page.getByRole('region', { name: 'Mandarin examples', exact: true }).getByRole('button').first().click()
  await page.getByRole('button', { name: 'Set up voice', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Mandarin voice setup', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Practice task', exact: true })).toHaveCount(0)
})

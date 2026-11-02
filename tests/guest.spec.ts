import { expect, test, accountStudyKey, completeOnboarding } from './fixtures'
import { lessons, exercises } from '../src/data/learning'

test.use({ account: null })
const password = 'Correct-password-123'
async function observeProgressStorage(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const accesses: string[] = []
    Object.assign(window, { guestProgressAccesses: accesses })
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      const original = Storage.prototype[method]
      Storage.prototype[method] = function (key: string, value?: string) {
        if (/hanzi-learning-(study|vocabulary)/.test(key)) accesses.push(`${method}:${key}`)
        return method === 'setItem' ? original.call(this, key, value!) : original.call(this, key)
      } as typeof original
    }
  })
}

test('browses course and exercise previews without touching progress storage or account-only APIs', async ({ page, backend }) => {
  await observeProgressStorage(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Browse as guest', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Explore Hanzi', exact: true })).toBeVisible()
  await expect(page.getByLabel('Guest preview', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Explore courses', exact: true }).click()
  await page.getByRole('radio', { name: 'Beginner', exact: true }).check()
  await page.locator('.course-preview').getByRole('button', { name: 'Preview lesson', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lesson preview', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mandarin examples', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start lesson', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Practice task', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lesson preview', exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Exercises', exact: true }).click()
  await page.getByRole('button', { name: `Preview ${exercises[0].title}`, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Exercise preview', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { guestProgressAccesses: string[] }).guestProgressAccesses)).toEqual([])
  expect(backend.requests.filter((request) => request.path.startsWith('/rest/v1/'))).toEqual([])
})

test('all practice modes are previews; sign-in resumes the requested real activity', async ({ page }) => {
  await observeProgressStorage(page)
  for (const mode of ['flashcards', 'speech', 'writing', 'sentences']) {
    await page.goto(`/#/guest/practice/food/${mode}?level=advanced`)
    await expect(page.locator('.guest-access-card')).toBeVisible()
    await expect(page.locator('.speech-card, .flashcard, .writing-canvas, .sentence-bank')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Recognize my word|Record my voice|Check sentence|Check answer/ })).toHaveCount(0)
  }
  expect(await page.evaluate(() => (window as unknown as { guestProgressAccesses: string[] }).guestProgressAccesses)).toEqual([])
  await page.goto('/#/guest/practice/food/speech?level=advanced')
  await page.getByRole('button', { name: 'Sign in to continue', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('student@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/practice\/food\/speech\?level=advanced$/)
  await expect(page.locator('.speech-card')).toBeVisible()
  await expect(page.getByLabel('Guest preview', { exact: true })).toHaveCount(0)
})

test('registration from a guest lesson still requires onboarding before starting questions', async ({ page }) => {
  const lesson = lessons[0]
  await page.goto(`/#/guest/course/${lesson.id}`)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByLabel('Your name', { exact: true }).fill('Preview learner')
  await page.getByLabel('Email', { exact: true }).fill('preview@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByRole('button', { name: 'Go to sign in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('preview@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/onboarding$/)
  await expect(page.getByRole('button', { name: 'Start lesson', exact: true })).toHaveCount(0)
  await completeOnboarding(page)
  await expect(page).toHaveURL(new RegExp(`#\\/course\\/${lesson.id}$`))
  await page.getByRole('button', { name: 'Start lesson', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Practice task', exact: true })).toBeVisible()
})

test('guest URLs cannot open privileged workspaces or real practice without signing in', async ({ page }) => {
  for (const route of ['guest/admin', 'guest/teach', 'guest/classes', 'guest/lessons', 'practice/all/writing']) {
    await page.goto(`/#/${route}`)
    await expect(page).toHaveURL(/#\/login$/)
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
    await expect(page.locator('.writing-canvas')).toHaveCount(0)
  }
})

test('signing out and browsing as guest does not reveal the last account catalog or saved progress', async ({ page, backend }) => {
  backend.platform.data.activities[0].title = 'An account-only edited lesson title'
  await page.goto('/#/login')
  await page.getByLabel('Email', { exact: true }).fill('student@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'An account-only edited lesson title', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Your account', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const saved = await page.evaluate((key) => localStorage.getItem(key), accountStudyKey)
  await page.getByRole('button', { name: 'Browse as guest', exact: true }).click()
  await page.getByRole('button', { name: 'Explore courses', exact: true }).click()
  await page.getByRole('radio', { name: 'Beginner', exact: true }).check()
  await expect(page.getByText('An account-only edited lesson title', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Your account', exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Continue with an account', exact: true })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), accountStudyKey)).toBe(saved)
})

for (const width of [320, 768, 1280]) {
  test(`${width}px: guest browsing and sign-in prompts fit the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Browse as guest', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Explore Hanzi', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `playwright-report/guest-home-${width}.png`, fullPage: true })
    await page.goto('/#/guest/practice/all/writing?level=advanced')
    await expect(page.locator('.guest-access-card')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `playwright-report/guest-practice-${width}.png`, fullPage: true })
  })
}

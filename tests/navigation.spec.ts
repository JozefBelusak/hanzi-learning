import { expect, test, type Page } from '@playwright/test'

async function openHome(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start learning', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveURL(/#\/home$/)
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
}

function navigation(page: Page) {
  return page.getByRole('navigation', { name: 'Main navigation' })
}

async function checkViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('learning has separate steps and both in-app and browser Back preserve their order', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openHome(page)
  await expect(page.getByRole('heading', { name: 'Choose a topic', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Food and drinks/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Start practice', exact: true }).click()
  await expect(page).toHaveURL(/#\/topics$/)
  await expect(page.getByRole('heading', { name: 'Choose a topic', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Flashcards/ })).toHaveCount(0)

  await page.getByRole('button', { name: /Food and drinks/ }).click()
  await expect(page).toHaveURL(/#\/topics\/food$/)
  await expect(page.getByRole('heading', { name: 'Food and drinks', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Flashcards/ }).click()
  await expect(page).toHaveURL(/#\/practice\/food\/flashcards$/)
  await expect(page.locator('.flashcard')).toBeVisible()

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/#\/topics\/food$/)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/#\/topics$/)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/#\/home$/)

  await navigation(page).getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('button', { name: /Food and drinks/ }).click()
  await page.getByRole('button', { name: /Speaking/ }).click()
  await expect(page).toHaveURL(/#\/practice\/food\/speech$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/topics\/food$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/topics$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/home$/)
  expect(errors).toEqual([])
})

test('direct practice routes survive reload and primary navigation leaves the exercise cleanly', async ({ page }) => {
  await page.goto('/#/practice/food/flashcards')
  await expect(page.locator('.flashcard')).toBeVisible()
  await expect(page.locator('.practice-header')).toContainText('1 / 8')
  await page.reload()
  await expect(page.locator('.flashcard')).toBeVisible()
  await expect(page).toHaveURL(/#\/practice\/food\/flashcards$/)
  await navigation(page).getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh vocabulary', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Daily goal · attempts')).toHaveCount(0)
  await navigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh vocabulary', exact: true })).toBeVisible()
  await expect(page.getByLabel('Daily goal · attempts')).toBeVisible()
  await navigation(page).getByRole('button', { name: 'Practice', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose a topic', exact: true })).toBeVisible()
})

test('profile and backup settings stay functional after leaving the statistics screen', async ({ page }) => {
  await openHome(page)
  await navigation(page).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('What should we call you?', { exact: true }).fill('Jožko')
  await page.getByLabel('Daily goal · attempts', { exact: true }).fill('7')
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect.poll(async () => page.evaluate(() => {
    const study = JSON.parse(localStorage.getItem('hanzi-learning-study-v1') ?? '{}')
    return { displayName: study.displayName, dailyGoal: study.dailyGoal }
  })).toEqual({ displayName: 'Jožko', dailyGoal: 7 })
  await page.reload()
  await expect(page.getByLabel('What should we call you?', { exact: true })).toHaveValue('Jožko')
  await expect(page.getByLabel('Daily goal · attempts', { exact: true })).toHaveValue('7')
  const backup = { version: 1, displayName: 'Imported profile', dailyGoal: 13, progress: {}, attempts: [
    { id: 'english-import', createdAt: '2026-10-01T12:00:00.000Z', mode: 'speech', cardId: 'wo', correct: true, input: 'manual', expectedText: '我', responseText: '我' },
  ] }
  const upload = { name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }
  await page.getByLabel('Import progress backup', { exact: true }).setInputFiles(upload)
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('hanzi-learning-study-v1') ?? '{}').attempts.length)).toBe(1)
  await expect(page.getByLabel('What should we call you?', { exact: true })).toHaveValue('Imported profile')
  await expect(page.getByLabel('Daily goal · attempts', { exact: true })).toHaveValue('13')
  await page.getByLabel('Import progress backup', { exact: true }).setInputFiles(upload)
  await expect(page.getByRole('status')).toContainText('Backup history was merged.')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hanzi-learning-study-v1') ?? '{}').attempts.length)).toBe(1)
  await navigation(page).getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(page.locator('.history-list')).toContainText('我')
  await expect(page.locator('.history-list')).toContainText('manual entry')
})

for (const viewport of [{ label: 'desktop', width: 1280, height: 900 }, { label: 'mobile', width: 360, height: 800 }]) {
  test(`${viewport.label}: screens fit their viewport and topic/mode selection works with the keyboard`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openHome(page)
    await checkViewport(page)
    await page.screenshot({ path: `playwright-report/english-${viewport.label}-home.png`, fullPage: true })

    const start = page.getByRole('button', { name: 'Start practice', exact: true })
    await start.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/topics$/)
    await checkViewport(page)
    await page.screenshot({ path: `playwright-report/english-${viewport.label}-topics.png`, fullPage: true })
    const topic = page.getByRole('button', { name: /Food and drinks/ })
    await topic.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/topics\/food$/)
    await checkViewport(page)
    await page.screenshot({ path: `playwright-report/english-${viewport.label}-modes.png`, fullPage: true })
    const flashcards = page.getByRole('button', { name: /Flashcards/ })
    await flashcards.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.flashcard')).toBeVisible()
    await page.getByRole('button', { name: 'Show answer', exact: true }).click()
    for (const rating of ['Again', 'Hard', 'Good', 'Easy']) {
      await expect(page.getByRole('button', { name: rating, exact: true })).toBeVisible()
    }
    await checkViewport(page)
    await page.screenshot({ path: `playwright-report/english-${viewport.label}-flashcards.png`, fullPage: true })
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.getByRole('button', { name: /Speaking/ }).click()
    await expect(page.getByRole('heading', { name: 'Speaking', exact: true })).toBeVisible()
    await expect(page.locator('.speech-card')).toBeVisible()
    await checkViewport(page)
    await page.screenshot({ path: `playwright-report/english-${viewport.label}-speech.png`, fullPage: true })
    for (const screen of ['Progress', 'Settings']) {
      await navigation(page).getByRole('button', { name: screen, exact: true }).click()
      await expect(page.getByRole('heading', { name: screen, exact: true })).toBeVisible()
      await checkViewport(page)
      await page.screenshot({ path: `playwright-report/english-${viewport.label}-${screen === 'Progress' ? 'progress' : 'settings'}.png`, fullPage: true })
    }
  })
}

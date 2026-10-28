import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import type { StudyData } from '../src/types/study'

async function openLearning(page: Page) {
  await page.goto('/#/home')
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start practice', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose a topic', exact: true })).toBeVisible()
}

async function openMode(page: Page, category: RegExp, mode: RegExp) {
  await page.getByRole('button', { name: category }).click()
  await page.getByRole('button', { name: mode }).click()
}

async function openProgress(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Progress', exact: true }).click()
}

async function storedStudy(page: Page): Promise<StudyData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hanzi-learning-study-v1:00000000-0000-4000-8000-000000000001') ?? '{"attempts":[],"progress":{}}'))
}

test('category selection changes the deck and flashcard progress survives a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openLearning(page)
  await openMode(page, /Food and drinks/, /Flashcards/)
  await expect(page.locator('.practice-header')).toContainText('1 / 8')
  await page.getByRole('button', { name: /Show answer/ }).click()
  const learnedHanzi = (await page.locator('.flashcard-answer .hanzi').textContent())!.trim()
  await page.getByRole('button', { name: 'Good', exact: true }).click()
  await expect.poll(async () => (await storedStudy(page)).attempts.length).toBe(1)
  const first = (await storedStudy(page)).attempts[0]
  expect(first).toMatchObject({ mode: 'flashcards', correct: true, input: 'self', expectedText: learnedHanzi })
  expect((await storedStudy(page)).progress[first.cardId]).toMatchObject({ intervalDays: 1, repetitions: 1 })

  await page.reload()
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Practice', exact: true }).click()
  await page.getByRole('button', { name: /Food and drinks/ }).click()
  await page.getByRole('button', { name: /Flashcards/ }).click()
  await expect(page.locator('.practice-header')).toContainText('1 / 7')
  await openProgress(page)
  await expect(page.locator('.stat-card').filter({ hasText: 'Total attempts' })).toContainText('1')
  await expect(page.locator('.history-list')).toContainText(learnedHanzi)
  expect(errors).toEqual([])
})

test('all four flashcard ratings persist their own review interval', async ({ page }) => {
  await openLearning(page)
  await openMode(page, /Food and drinks/, /Flashcards/)
  const ratings = [
    { label: 'Again', value: 'again', intervalDays: 0, delayMinutes: 10, correct: false },
    { label: 'Hard', value: 'hard', intervalDays: 0.5, delayMinutes: 720, correct: true },
    { label: 'Good', value: 'good', intervalDays: 1, delayMinutes: 1440, correct: true },
    { label: 'Easy', value: 'easy', intervalDays: 3, delayMinutes: 4320, correct: true },
  ]
  for (const [index, rating] of ratings.entries()) {
    await page.getByRole('button', { name: 'Show answer', exact: true }).click()
    const expectedText = (await page.locator('.flashcard-answer .hanzi').textContent())!.trim()
    await page.getByRole('button', { name: rating.label, exact: true }).click()
    await expect.poll(async () => (await storedStudy(page)).attempts.length).toBe(index + 1)
    const state = await storedStudy(page)
    const attempt = state.attempts[index]
    expect(attempt).toMatchObject({ mode: 'flashcards', input: 'self', rating: rating.value, correct: rating.correct, expectedText })
    const progress = state.progress[attempt.cardId]
    expect(progress.intervalDays).toBe(rating.intervalDays)
    expect(new Date(progress.dueAt).getTime() - new Date(attempt.createdAt).getTime())
      .toBe(rating.delayMinutes * 60_000)
  }
  await page.reload()
  await expect.poll(async () => (await storedStudy(page)).attempts.length).toBe(4)
})

test('sentence demo records independent and hinted results separately', async ({ page }) => {
  await openLearning(page)
  await openMode(page, /All words/, /Sentence building/)
  for (const word of ['我', '喝', '水']) {
    await page.getByRole('button', { name: `Add ${word}`, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Check sentence', exact: true }).click()
  await expect(page.locator('.sentence-feedback')).toContainText('The sentence is correct.')
  await expect(page.getByRole('button', { name: 'Check sentence', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Next sentence', exact: true }).click()
  await page.getByRole('button', { name: 'Show hint', exact: true }).click()
  await page.getByRole('button', { name: 'Hide hint', exact: true }).click()
  for (const word of ['我', '是', '学生']) {
    await page.getByRole('button', { name: `Add ${word}`, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Check sentence', exact: true }).click()
  await expect.poll(async () => (await storedStudy(page)).attempts.length).toBe(2)
  const attempts = (await storedStudy(page)).attempts
  expect(attempts[0]).toMatchObject({ mode: 'sentences', correct: true, assisted: false })
  expect(attempts[1]).toMatchObject({ mode: 'sentences', correct: true, assisted: true })
  await openProgress(page)
  const statistics = page.locator('.mode-stat').filter({ hasText: 'Sentences · word order' })
  await expect(statistics).toContainText('1 unassisted attempt')
  await expect(statistics).toContainText('100%')
  await expect(page.locator('.history-list')).toContainText('assisted')
})

test('manual speech fallback is available and cannot inflate recognized speech accuracy', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true })
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true })
  })
  await openLearning(page)
  await openMode(page, /All words/, /Speaking/)
  await expect(page.getByRole('button', { name: 'Recognize my word', exact: true })).toBeDisabled()
  const expected = (await page.locator('.speech-card .hanzi').textContent())!.trim()
  const manual = page.locator('.manual-entry')
  if (!(await manual.getByLabel('Answer in Chinese characters', { exact: true }).isVisible())) {
    await page.getByText('Submit a typed answer', { exact: true }).click()
  }
  await manual.getByLabel('Answer in Chinese characters', { exact: true }).fill(expected)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.feedback-panel')).toContainText('The text matches the prompt.')
  await expect.poll(async () => (await storedStudy(page)).attempts.length).toBe(1)
  expect((await storedStudy(page)).attempts[0]).toMatchObject({ mode: 'speech', input: 'manual', correct: true })
  await openProgress(page)
  const statistics = page.locator('.mode-stat').filter({ hasText: 'Speaking · text match' })
  await expect(statistics).toContainText('0 unassisted attempts')
  await expect(statistics).toContainText('—')
})

test('bundled public vocabulary works on the first launch with external network unavailable', async ({ page }) => {
  await page.route('https://**/*', (route) => route.abort('internetdisconnected'))
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }))
  await openLearning(page)
  await expect(page.getByRole('button', { name: /All words/ })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh vocabulary', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Vocabulary refresh failed.')
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Practice', exact: true }).click()
  await openMode(page, /Numbers and quantities/, /Flashcards/)
  await expect(page.locator('.flashcard')).toBeVisible()
  await page.getByRole('button', { name: /Show answer/ }).click()
  await expect(page.locator('.flashcard-answer .hanzi')).toBeVisible()
})

test('mobile sentence interactions fit the viewport and remain keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openLearning(page)
  await openMode(page, /All words/, /Sentence building/)
  const first = page.getByRole('button', { name: 'Add 我', exact: true })
  await first.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Remove 我, position 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(first).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

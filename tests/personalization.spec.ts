import { expect, test, accountStudyKey } from './fixtures'
import type { Page } from '@playwright/test'
import { lessons } from '../src/data/learning'

async function openRecommendations(page: Page) {
  await page.goto('/#/today')
  await page.getByText('Explore more recommendations for your goals', { exact: true }).click()
}

for (const pageName of ['course', 'exercises', 'lessons'] as const) {
  test(`${pageName}: profile filters apply by default, can be cleared and survive reload and detail Back`, async ({ page, backend }) => {
    Object.assign(backend.users[0], { language_level: 'elementary', difficulty: 'gentle' })
    for (const [index, languageLevel] of ['elementary', 'advanced', 'beginner'].entries()) backend.lessons.push({
      id: `10000000-0000-4000-8000-00000000000${index}`, source: 'lecturer', author_id: backend.users[1].id, title: `Public sample ${index}`, summary: '', content: '你好', published: true,
      languageLevel: languageLevel as 'elementary' | 'advanced' | 'beginner', difficulty: index === 0 ? 'gentle' : 'balanced', created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
    })
    await page.goto(`/#/${pageName}`)
    await expect(page.getByRole('radio', { name: 'Elementary', exact: true })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Gentle', exact: true })).toBeChecked()
    const items = pageName === 'course' ? page.locator('.course-station') : pageName === 'exercises' ? page.locator('.exercise-card') : page.locator('.published-lesson-list > article')
    await expect(items).toHaveCount(1)
    await page.getByRole('radio', { name: 'Gentle', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Balanced', exact: true })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Balanced', exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#/${pageName}\\?level=all&difficulty=all$`))
    await page.reload()
    await expect(page.getByRole('radio', { name: 'All difficulties', exact: true })).toBeChecked()
    await expect(page.getByRole('radio', { name: pageName === 'course' ? 'All paths' : 'All levels', exact: true })).toBeChecked()
    await expect(pageName === 'course' ? page.locator('.course-path-card') : items).toHaveCount(pageName === 'course' ? 4 : pageName === 'exercises' ? 12 : 3)
    await page.getByRole('radio', { name: 'Advanced', exact: true }).check()
    await page.getByRole('radio', { name: 'Balanced', exact: true }).check()
    const listHash = await page.evaluate(() => location.hash)
    if (pageName === 'course') {
      await page.locator('.course-preview').getByRole('button', { name: 'Preview lesson', exact: true }).click()
      await page.getByRole('button', { name: 'Back to course', exact: true }).click()
    } else if (pageName === 'exercises') {
      await page.locator('.exercise-card').first().getByRole('button').click()
      await page.getByRole('button', { name: 'Back to exercises', exact: true }).click()
    } else {
      await page.getByRole('button', { name: 'Read lesson', exact: true }).click()
      await page.getByRole('button', { name: 'Back to public lessons', exact: true }).click()
    }
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(listHash)
    await expect(page.getByRole('radio', { name: 'Balanced', exact: true })).toBeChecked()
    if (pageName === 'lessons') {
      await page.getByRole('radio', { name: 'Challenging', exact: true }).check()
      await expect(page.getByText('No public lessons match this level and difficulty.', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Show all public lessons', exact: true }).click()
      await expect(items).toHaveCount(3)
    }
    await page.getByRole('button', { name: 'Use profile preferences', exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Elementary', exact: true })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Gentle', exact: true })).toBeChecked()
    expect(backend.users[0]).toMatchObject({ language_level: 'elementary', difficulty: 'gentle' })
    expect(backend.requests.filter((request) => request.path === '/rest/v1/rpc/save_learning_profile')).toHaveLength(0)
  })
}

test('empty profile matches offer all content, and a difficulty filter never offers a locked course as the next lesson', async ({ page, backend }) => {
  Object.assign(backend.users[0], { difficulty: 'challenging' })
  await page.goto('/#/exercises')
  await expect(page.getByRole('heading', { name: 'No exercises found', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show all exercises', exact: true }).click()
  await expect(page.locator('.exercise-card')).toHaveCount(12)
  await page.goto('/#/course')
  await expect(page.getByRole('region', { name: 'Course prerequisites', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recommended lesson', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show all difficulties', exact: true }).click()
  await expect(page.locator('.course-station')).toHaveCount(7)
  await page.reload()
  await expect(page.getByRole('radio', { name: 'All difficulties', exact: true })).toBeChecked()
  await expect(page.getByRole('region', { name: 'Recommended lesson', exact: true })).toBeVisible()
})

test('changing goals changes recommendations; changing level and difficulty retains saved attempts, reviews and course answers', async ({ page, backend }) => {
  Object.assign(backend.users[0], { learning_goals: ['travel'] })
  await openRecommendations(page)
  const recommendations = page.getByRole('region', { name: 'Recommendations for your goals', exact: true })
  const grammar = page.getByRole('region', { name: 'Recommended grammar', exact: true })
  const vocabulary = page.getByRole('region', { name: 'Recommended vocabulary', exact: true })
  const exercises = page.getByRole('region', { name: 'Recommended exercises', exact: true })
  await expect(exercises.locator('h4').first()).toHaveText('A stop at the café')
  const before = { grammar: await grammar.locator('summary').allTextContents(), vocabulary: await vocabulary.locator('article > strong').allTextContents(), exercises: await exercises.locator('h4').allTextContents() }
  await page.getByRole('button', { name: 'Route preferences', exact: true }).click()
  await page.getByLabel('Travel', { exact: true }).uncheck()
  await page.getByLabel('Study and exams', { exact: true }).check()
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Preferences saved')
  await openRecommendations(page)
  await expect(recommendations).toBeVisible()
  await expect(exercises.locator('h4').first()).toHaveText('Meet a new classmate')
  expect(await grammar.locator('summary').allTextContents()).not.toEqual(before.grammar)
  expect(await vocabulary.locator('article > strong').allTextContents()).not.toEqual(before.vocabulary)
  expect(await exercises.locator('h4').allTextContents()).not.toEqual(before.exercises)
  await vocabulary.getByRole('button').first().click()
  await expect(page.getByText(/words · Beginner/, { exact: false })).toBeVisible()
  await page.goto('/#/practice/food/flashcards')
  await page.getByRole('button', { name: 'Show answer', exact: true }).click()
  await page.getByRole('button', { name: 'Good', exact: true }).click()
  const lesson = lessons[0]
  await page.goto(`/#/course/${lesson.id}`)
  await page.getByRole('button', { name: 'Start lesson', exact: true }).click()
  const question = lesson.questions[0]
  if (question.type !== 'choice') throw new Error('Expected a choice question')
  await page.locator('.session-option').filter({ has: page.getByText(question.options.find((option) => option.id === question.answer)!.text, { exact: true }) }).click()
  await page.getByRole('button', { name: 'Check answer', exact: true }).click()
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').learningSessions?.[0]?.answers.length, accountStudyKey)).toBe(1)
  const history = await page.evaluate((key) => { const data = JSON.parse(localStorage.getItem(key)!); return { attempts: data.attempts, progress: data.progress, learningSessions: data.learningSessions } }, accountStudyKey)
  await page.goto('/#/settings')
  await page.getByLabel('Chinese language level', { exact: true }).selectOption('intermediate')
  await page.getByLabel('Preferred difficulty', { exact: true }).selectOption('challenging')
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Preferences saved')
  await openRecommendations(page)
  await expect(recommendations).toContainText('Intermediate · Challenging activities')
  await page.goto('/#/exercises')
  await expect(page.getByRole('radio', { name: 'Intermediate', exact: true })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Challenging', exact: true })).toBeChecked()
  await page.reload()
  const after = await page.evaluate((key) => { const data = JSON.parse(localStorage.getItem(key)!); return { attempts: data.attempts, progress: data.progress, learningSessions: data.learningSessions } }, accountStudyKey)
  expect(after).toEqual(history)
  await page.goto(`/#/course/${lesson.id}`)
  await expect(page.getByRole('heading', { name: lesson.questions[1].prompt, exact: true })).toBeVisible()
})

test('completing a filtered subset never claims that the entire course path is complete', async ({ page, backend }) => {
  Object.assign(backend.users[0], { difficulty: 'gentle' })
  const lesson = lessons[0]
  const session = { id: 'finished-gentle-lesson', activityId: lesson.id, contentRevision: lesson.revision, startedAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:05:00Z', finishedAt: '2026-11-02T10:05:00Z', answers: lesson.questions.map((question) => ({ questionId: question.id, assisted: false, response: question.type === 'choice' ? [question.answer] : question.acceptedOrders[0] })) }
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify({ version: 1, displayName: 'Student', dailyGoal: 10, attempts: [], progress: {}, learningSessions: [session] })), { key: accountStudyKey, session })
  await page.goto('/#/course')
  await expect(page.getByRole('heading', { name: 'Matching lessons completed', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Path completed', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show full path', exact: true }).click()
  await expect(page.locator('.course-progress')).toContainText('1 / 7')
  await expect(page.getByRole('button', { name: /Lesson 2:.*Ready to start/ })).toBeVisible()
})

for (const width of [360, 1280]) {
  test(`${width}px: personalized recommendations fit and open grammar without creating attempts`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openRecommendations(page)
    await expect(page.getByRole('region', { name: 'Recommendations for your goals', exact: true })).toBeVisible()
    const grammar = page.getByRole('region', { name: 'Recommended grammar', exact: true })
    await grammar.locator('summary').first().focus()
    await page.keyboard.press('Enter')
    await expect(grammar.locator('details').first()).toHaveAttribute('open', '')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').attempts, accountStudyKey)).toEqual([])
    await page.screenshot({ path: `playwright-report/personalization-${width}.png`, fullPage: true, animations: 'disabled' })
  })
}

import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { exercises, lessons } from '../src/data/learning'
import type { LearningActivity, LearningQuestion, LearningSession } from '../src/types/learning'

async function storedSessions(page: Page): Promise<LearningSession[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hanzi-learning-study-v1:00000000-0000-4000-8000-000000000001') ?? '{}').learningSessions ?? [])
}

async function chooseAnswer(page: Page, question: LearningQuestion, correct = true) {
  const task = page.getByRole('region', { name: 'Practice task', exact: true })
  await expect(task.getByRole('heading', { name: question.prompt, exact: true })).toBeVisible()
  if (question.type === 'choice') {
    const option = question.options.find((item) => correct ? item.id === question.answer : item.id !== question.answer)!
    await task.locator('.session-option').filter({ has: page.getByText(option.text, { exact: true }) }).click()
  } else {
    const sequence = correct ? question.acceptedOrders[0] : [...question.acceptedOrders[0]].reverse()
    for (const token of sequence) await task.getByRole('button', { name: `Add ${token}`, exact: true }).first().click()
  }
  await task.getByRole('button', { name: 'Check answer', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Answer feedback', exact: true })).toContainText(question.explanation)
}

async function completeActivity(page: Page, activity: LearningActivity, wrongQuestion = -1, startingIndex = 0) {
  for (let index = startingIndex; index < activity.questions.length; index += 1) {
    await chooseAnswer(page, activity.questions[index], index !== wrongQuestion)
    await page.getByRole('button', { name: index === activity.questions.length - 1 ? 'See results' : 'Next question', exact: true }).click()
  }
  await expect(page.getByRole('region', { name: 'Session results', exact: true })).toBeVisible()
  await expect.poll(async () => (await storedSessions(page)).find((session) => session.activityId === activity.id)?.finishedAt).toBeTruthy()
}

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('a locked lesson can be previewed directly but cannot start or save answers', async ({ page }) => {
  const lockedLesson = lessons[lessons.length - 1]
  await page.goto(`/#/course/${lockedLesson.id}`)
  await expect(page.getByRole('heading', { name: lockedLesson.title, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Preview this stop', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start lesson', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Mandarin examples', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Preview this stop', exact: true })).toBeVisible()
  expect(await storedSessions(page)).toEqual([])
  await page.getByRole('button', { name: 'Back to course', exact: true }).click()
  await expect(page).toHaveURL(/#\/course$/)
  await expect(page.getByRole('heading', { name: 'Your Chinese journey', exact: true })).toBeVisible()
})

test('independent lesson reviews unlock the tram map in order and require both fork branches', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/#/course')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('.course-progress')).toContainText(`0 / ${lessons.length}`)
  await expect(page.getByRole('button', { name: /Lesson 2:.*Not yet unlocked/ })).toBeVisible()

  for (const [index, lesson] of lessons.slice(0, -1).entries()) {
    const station = page.getByRole('button', { name: new RegExp(`Lesson ${index + 1}:`) })
    await station.click()
    await page.locator('.course-preview').getByRole('button', { name: 'Start lesson', exact: true }).click()
    await page.getByRole('button', { name: 'Start lesson', exact: true }).click()
    await completeActivity(page, lesson, index === 0 ? lesson.questions.length - 1 : -1)
    await expect(page.getByRole('heading', { name: 'Stop completed', exact: true })).toBeVisible()
    if (index === 0) await expect(page.locator('.session-result-score')).toContainText('80%')
    await page.getByRole('button', { name: 'Return to course map', exact: true }).click()
    await expect(page.getByRole('button', { name: new RegExp(`Lesson ${index + 1}:.*Completed`) })).toBeVisible()
    if (index === 2) {
      await expect(page.getByRole('button', { name: /Lesson 4:.*Ready to start/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /Lesson 5:.*Ready to start/ })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: new RegExp(`Lesson ${lessons.length}:.*${index < lessons.length - 2 ? 'Not yet unlocked' : 'Ready to start'}`) })).toBeVisible()
  }
  await expect(page.locator('.course-progress')).toContainText(`5 / ${lessons.length}`)
  await page.reload()
  await expect(page.getByRole('button', { name: /Lesson 6:.*Ready to start/ })).toBeVisible()
  expect((await storedSessions(page)).filter((session) => session.finishedAt)).toHaveLength(5)
  expect(errors).toEqual([])
})

test('standalone exercises combine question types, resume after reload, and return from contextual speaking', async ({ page }) => {
  test.setTimeout(60_000)
  const exercise = exercises.find((item) => item.questions.some((question) => question.type === 'order'))!
  await page.goto('/#/exercises')
  await page.getByLabel('Search exercises', { exact: true }).fill(exercise.title)
  await expect(page.locator('.exercise-card')).toHaveCount(1)
  await expect(page.getByRole('status')).toContainText('1 exercise found')
  await page.getByRole('button', { name: `Start ${exercise.title}`, exact: true }).click()
  await page.getByRole('button', { name: 'Start exercise', exact: true }).click()
  await chooseAnswer(page, exercise.questions[0])
  await expect.poll(async () => (await storedSessions(page))[0]?.answers.length).toBe(1)
  expect((await storedSessions(page))[0].activityId).toBe(exercise.id)
  await page.reload()
  await expect(page.getByRole('heading', { name: exercise.questions[1].prompt, exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Saved answers', exact: true })).toHaveAttribute('value', '1')
  await completeActivity(page, exercise, -1, 1)
  await expect(page.getByRole('heading', { name: 'Exercise completed', exact: true })).toBeVisible()
  await expect(page.locator('.session-result-score')).toContainText('100%')

  await page.getByRole('button', { name: 'Speaking', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/practice\\/${exercise.category}\\/speech\\/from\\/${exercise.id}$`))
  await expect(page.getByRole('heading', { name: 'Speaking', exact: true })).toBeVisible()
  const practiceHanzi = (await page.locator('.speech-card .hanzi').textContent())!.trim()
  expect(exercise.practiceWords).toContain(practiceHanzi)
  await page.reload()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`#\\/exercises\\/${exercise.id}$`))
  await expect(page.getByRole('heading', { name: 'Exercise completed', exact: true })).toBeVisible()
  await expect(page.locator('.session-result-score')).toContainText('100%')
  await page.getByRole('button', { name: 'Return to exercises', exact: true }).click()
  const card = page.locator('.exercise-card').filter({ has: page.getByRole('heading', { name: exercise.title, exact: true }) })
  await expect(card).toContainText('Best independent result')
  await expect(card).toContainText(`${exercise.questions.length} / ${exercise.questions.length} · 100%`)
  expect((await storedSessions(page)).filter((session) => session.activityId.startsWith('lesson-'))).toEqual([])
})

test('hiding a hint and reloading before an answer cannot turn assisted work into an independent result', async ({ page }) => {
  const exercise = exercises[0]
  const question = exercise.questions[0]
  expect(question.hint).toBeTruthy()
  await page.goto(`/#/exercises/${exercise.id}`)
  await page.getByRole('button', { name: 'Start exercise', exact: true }).click()
  await page.getByRole('button', { name: 'Show hint', exact: true }).click()
  await page.getByRole('button', { name: 'Hide hint', exact: true }).click()
  await expect.poll(async () => (await storedSessions(page))[0]?.hintedQuestionIds).toContain(question.id)
  await page.reload()
  await expect(page.locator('.session-assistance-note')).toContainText('Hint used')
  await chooseAnswer(page, question)
  await expect(page.getByRole('heading', { name: 'Correct with a hint', exact: true })).toBeVisible()
  await expect.poll(async () => (await storedSessions(page))[0]?.answers[0]?.assisted).toBe(true)
  await page.getByRole('button', { name: 'Next question', exact: true }).click()
  await completeActivity(page, exercise, -1, 1)
  await expect(page.locator('.session-result-score')).toContainText('80%')
  await expect(page.getByRole('complementary', { name: 'Questions to revisit', exact: true })).toContainText('Hint used')
})

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`${viewport.width}px: the map and exercise workspace fit and support keyboard interaction`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/#/course')
    await expect(page.getByRole('heading', { name: 'Your Chinese journey', exact: true })).toBeVisible()
    await fitsViewport(page)
    const station = page.getByRole('button', { name: /Lesson 1:/ })
    await station.focus()
    await page.keyboard.press('Enter')
    await expect(station).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: `playwright-report/course-${viewport.width}.png`, fullPage: true, animations: 'disabled' })
    await page.locator('.course-preview').getByRole('button', { name: 'Start lesson', exact: true }).click()
    await page.getByRole('button', { name: 'Start lesson', exact: true }).click()
    await fitsViewport(page)
    const question = lessons[0].questions[0]
    if (question.type !== 'choice') throw new Error('The first lesson needs its written-tone choice task')
    const option = question.options.find((item) => item.id === question.answer)!
    const answer = page.locator('.session-option').filter({ has: page.getByText(option.text, { exact: true }) })
    await answer.focus()
    await page.keyboard.press('Enter')
    await expect(answer).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Check answer', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'You got it', exact: true })).toBeVisible()
    await fitsViewport(page)
    await page.screenshot({ path: `playwright-report/lesson-workspace-${viewport.width}.png`, fullPage: true, animations: 'disabled' })
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Exercises', exact: true }).click()
    await fitsViewport(page)
    const topicFilters = page.getByRole('group', { name: 'Topic', exact: true })
    const topicButton = topicFilters.getByRole('button', { name: 'People and family', exact: true })
    await topicButton.focus()
    await page.keyboard.press('Enter')
    await expect(topicButton).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.exercise-card')).toHaveCount(exercises.filter((exercise) => exercise.category === exercises[0].category).length)
    await topicFilters.getByRole('button', { name: 'All topics', exact: true }).click()
    await expect(page.locator('.exercise-card')).toHaveCount(exercises.length)
    await fitsViewport(page)
    await page.screenshot({ path: `playwright-report/exercises-${viewport.width}.png`, fullPage: true, animations: 'disabled' })
  })
}

test('a conflicting session backup reports an import error without losing saved work or crashing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`/#/course/${lessons[0].id}`)
  await page.getByRole('button', { name: 'Start lesson', exact: true }).click()
  const question = lessons[0].questions[0]
  if (question.type !== 'choice') throw new Error('Expected a choice question')
  const option = question.options.find((item) => item.id === question.answer)!
  await page.locator('.session-option').filter({ has: page.getByText(option.text, { exact: true }) }).click()
  await page.getByRole('button', { name: 'Check answer', exact: true }).click()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('hanzi-learning-study-v1:00000000-0000-4000-8000-000000000001') ?? '{}').learningSessions?.[0]?.answers.length)).toBe(1)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hanzi-learning-study-v1:00000000-0000-4000-8000-000000000001')!))
  const backup = { ...saved, learningSessions: [{ ...saved.learningSessions[0], startedAt: '2026-10-01T10:00:00.000Z' }] }
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Import progress backup', { exact: true }).setInputFiles({ name: 'conflicting-progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByRole('status')).toContainText('conflicting learning sessions')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hanzi-learning-study-v1:00000000-0000-4000-8000-000000000001')!))).toEqual(saved)
  expect(errors).toEqual([])
})

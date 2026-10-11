import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { StudyAttempt } from '../src/types/study'

const strokeData: { medians: number[][][] } = JSON.parse(
  readFileSync(new URL('../src/data/strokes/八.json', import.meta.url), 'utf8'),
)

async function openWriting(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start learning', exact: true }).click()
  const device = (page.viewportSize()?.width ?? 1280) < 700 ? 'mobile' : 'desktop'
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
  await page.screenshot({ path: `playwright-report/english-writing-${device}-home.png`, fullPage: true })
  await page.getByRole('button', { name: 'Start practice', exact: true }).click()
  await page.getByRole('button', { name: /Numbers and quantities/ }).click()
  await page.getByRole('button', { name: /Writing/ }).click()
  await chooseCharacter(page, '八')
  await expect(page.locator('.writing-exercise [role="status"]')).toContainText('Trace the outline')
  await expect(page.locator('.writing-board svg')).toHaveCount(1)
  await page.screenshot({ path: `playwright-report/english-${device}-writing.png`, fullPage: true })
}

async function chooseCharacter(page: Page, character: string) {
  const opener = page.getByRole('button', { name: 'Choose character', exact: true })
  await opener.click()
  const picker = page.getByRole('dialog', { name: 'Choose a character', exact: true })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: `Practice ${character}`, exact: true }).click()
  await expect(picker).not.toBeVisible()
}

async function transformedPoints(page: Page, points: number[][]) {
  const board = page.locator('.writing-board')
  await board.scrollIntoViewIfNeeded()
  return board.locator('svg > g').first().evaluate((node, medians) => {
    const matrix = (node as SVGGElement).getScreenCTM()
    if (!matrix) throw new Error('Writing canvas has no coordinate transform')
    return medians.map(([x, y]) => ({
      x: matrix.a * x + matrix.c * y + matrix.e,
      y: matrix.b * x + matrix.d * y + matrix.f,
    }))
  }, points)
}

async function mouseStroke(page: Page, points: number[][]) {
  const coordinates = await transformedPoints(page, points)
  await page.mouse.move(coordinates[0].x, coordinates[0].y)
  await page.mouse.down()
  for (const point of coordinates.slice(1)) {
    await page.mouse.move(point.x, point.y, { steps: 5 })
  }
  await page.mouse.up()
}

async function savedAttempts(page: Page): Promise<StudyAttempt[]> {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('hanzi-learning-study-v1') ?? '{"attempts":[]}')
    return state.attempts
  })
}

async function expectVisibleInk(page: Page) {
  const liveInk = page.locator('.writing-board svg > g > path[stroke-linecap="round"]')
  await expect(liveInk).toHaveCount(1)
  const ink = await liveInk.evaluate((path) => {
    const matrix = (path as SVGPathElement).getScreenCTM()
    if (!matrix) throw new Error('Live ink has no screen transform')
    const width = Number(path.getAttribute('stroke-width')) * Math.hypot(matrix.a, matrix.b)
    return { width, boardWidth: path.closest('.writing-board')!.getBoundingClientRect().width }
  })
  expect(ink.width).toBeGreaterThanOrEqual(ink.boardWidth * 0.04)
}

test('writing: actual mouse strokes, assisted result, backwards rejection and recall result', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openWriting(page)

  for (const [index, points] of strokeData.medians.entries()) {
    await mouseStroke(page, points)
    await expect(page.locator('.writing-counts')).toContainText(`Strokes: ${index + 1} / 2`)
  }
  await expect(page.locator('.writing-exercise [role="status"]')).toContainText('Guided practice saved.')
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(1)
  expect((await savedAttempts(page))[0]).toMatchObject({
    mode: 'writing', expectedText: '八', correct: true, mistakes: 0, assisted: true,
  })

  await page.getByRole('button', { name: 'From memory', exact: true }).click()
  await expect(page.locator('.writing-exercise [role="status"]')).toContainText('Write the character from memory')
  await mouseStroke(page, [...strokeData.medians[0]].reverse())
  await expect(page.locator('.writing-counts')).toContainText('Mistakes: 1')
  await expect(page.locator('.writing-counts')).toContainText('Strokes: 0 / 2')

  for (const [index, points] of strokeData.medians.entries()) {
    await mouseStroke(page, points)
    await expect(page.locator('.writing-counts')).toContainText(`Strokes: ${index + 1} / 2`)
  }
  await expect(page.locator('.writing-exercise [role="status"]')).toContainText('Completed with 1 correction.')
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(2)
  expect((await savedAttempts(page))[1]).toMatchObject({
    mode: 'writing', expectedText: '八', correct: false, mistakes: 1, assisted: false,
  })

  await page.reload()
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(2)
  expect(errors).toEqual([])
})

test('writing: switching during animation cleans up SVG and stale callbacks', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openWriting(page)
  await page.getByRole('button', { name: 'Show stroke order' }).click()
  await expect(page.locator('.writing-exercise [role="status"]')).toContainText('Watch the direction')

  for (const character of ['一', '八', '一', '八']) {
    await chooseCharacter(page, character)
    await expect(page.locator('.writing-exercise [role="status"]')).toContainText('Trace the outline')
    await expect(page.locator('.writing-board svg')).toHaveCount(1)
  }

  await page.getByRole('button', { name: 'From memory', exact: true }).click()
  await expect(page.locator('.writing-exercise [role="status"]')).toContainText('Write the character from memory')
  for (const [index, points] of strokeData.medians.entries()) {
    await mouseStroke(page, points)
    await expect(page.locator('.writing-counts')).toContainText(`Strokes: ${index + 1} / 2`)
  }
  await expect(page.locator('.writing-exercise [role="status"]')).toContainText('without corrections')
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(1)
  expect((await savedAttempts(page))[0]).toMatchObject({
    expectedText: '八', correct: true, mistakes: 0, assisted: false,
  })
  expect(errors).toEqual([])
})

test('writing: mobile touch completes the genuine trajectories after resizing', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  try {
    await openWriting(page)
    await page.setViewportSize({ width: 360, height: 800 })
    await expect(page.locator('.writing-board svg')).toHaveCount(1)
    const session = await context.newCDPSession(page)

    for (const [index, points] of strokeData.medians.entries()) {
      const coordinates = await transformedPoints(page, points)
      for (const [pointIndex, point] of coordinates.entries()) {
        await session.send('Input.dispatchTouchEvent', {
          type: pointIndex === 0 ? 'touchStart' : 'touchMove',
          touchPoints: [{ x: point.x, y: point.y }],
        })
        if (index === 0 && pointIndex === 1) {
          await expectVisibleInk(page)
          // Full-page capture can resize the mobile viewport mid-gesture.
          await page.screenshot({ path: 'playwright-report/english-mobile-ink.png' })
        }
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect(page.locator('.writing-counts')).toContainText(`Strokes: ${index + 1} / 2`)
    }

    await expect(page.locator('.writing-exercise [role="status"]')).toContainText('Guided practice saved.')
    await expect.poll(async () => (await savedAttempts(page)).length).toBe(1)
    expect((await savedAttempts(page))[0]).toMatchObject({ correct: true, assisted: true, mistakes: 0 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await context.close()
  }
})

for (const viewport of [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'mobile', width: 360, height: 800 },
]) {
  test(`writing picker ${viewport.label}: searches characters, pinyin and meanings and returns keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openWriting(page)
    const opener = page.getByRole('button', { name: 'Choose character', exact: true })
    await opener.click()
    const picker = page.getByRole('dialog', { name: 'Choose a character', exact: true })
    const search = picker.getByLabel('Search characters', { exact: true })
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('button', { name: 'Practice 八', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(picker.getByRole('button', { name: 'Practice 水', exact: true })).toHaveCount(0)

    for (const query of ['八', 'ba', 'eight']) {
      await search.fill(query)
      await expect(picker.getByRole('button', { name: 'Practice 八', exact: true })).toBeVisible()
      await expect(picker.getByRole('button', { name: 'Practice 一', exact: true })).toHaveCount(0)
    }
    await search.fill('there-is-no-such-character')
    await expect(picker.getByRole('button', { name: /^Practice / })).toHaveCount(0)
    await search.fill('')
    await expect(picker.getByRole('button', { name: 'Practice 一', exact: true })).toBeVisible()
    await picker.getByRole('button', { name: /^Practice / }).last().scrollIntoViewIfNeeded()
    expect(await picker.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1
    })).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `playwright-report/english-${viewport.label}-picker.png`, fullPage: true })

    await search.focus()
    for (let index = 0; index < 35; index++) {
      await page.keyboard.press('Tab')
      expect(await picker.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(picker).not.toBeVisible()
    await expect(opener).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(picker).toBeVisible()
    await search.fill('one')
    const choice = picker.getByRole('button', { name: 'Practice 一', exact: true })
    await choice.focus()
    await page.keyboard.press('Enter')
    await expect(picker).not.toBeVisible()
    await expect(opener).toBeFocused()
    await expect(page.locator('.writing-counts')).toContainText('Strokes: 0 / 1')
    await opener.click()
    await expect(picker.getByRole('button', { name: 'Practice 一', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await picker.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(opener).toBeFocused()
  })
}

test('writing: live ink has a visible brush width and choosing another character discards an unfinished attempt', async ({ page }) => {
  await openWriting(page)
  const coordinates = await transformedPoints(page, strokeData.medians[0])
  await page.mouse.move(coordinates[0].x, coordinates[0].y)
  await page.mouse.down()
  await page.mouse.move(coordinates[1].x, coordinates[1].y, { steps: 5 })
  await expectVisibleInk(page)
  await page.screenshot({ path: 'playwright-report/english-desktop-ink.png' })
  for (const point of coordinates.slice(2)) await page.mouse.move(point.x, point.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.writing-counts')).toContainText('Strokes: 1 / 2')
  expect(await savedAttempts(page)).toHaveLength(0)

  await chooseCharacter(page, '一')
  await expect(page.locator('.writing-counts')).toContainText('Strokes: 0 / 1')
  await chooseCharacter(page, '八')
  await expect(page.locator('.writing-counts')).toContainText('Strokes: 0 / 2')
  await expect(page.locator('.writing-counts')).toContainText('Mistakes: 0')
  await expect(page.locator('.writing-board svg')).toHaveCount(1)
  for (const [index, points] of strokeData.medians.entries()) {
    await mouseStroke(page, points)
    await expect(page.locator('.writing-counts')).toContainText(`Strokes: ${index + 1} / 2`)
  }
  await expect.poll(async () => (await savedAttempts(page)).length).toBe(1)
  expect((await savedAttempts(page))[0]).toMatchObject({ expectedText: '八', correct: true, mistakes: 0, assisted: true })
})

import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

async function expectSeparateStations(page: Page) {
  const overlaps = await page.locator('.course-station').evaluateAll((stations) => {
    const boxes = stations.map((station) => ({ title: station.getAttribute('aria-label'), box: station.getBoundingClientRect() }))
    return boxes.flatMap((first, index) => boxes.slice(index + 1).filter((second) =>
      Math.min(first.box.right, second.box.right) - Math.max(first.box.left, second.box.left) > 1 &&
      Math.min(first.box.bottom, second.box.bottom) - Math.max(first.box.top, second.box.top) > 1,
    ).map((second) => [first.title, second.title]))
  })
  expect(overlaps).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('all paths is a separate overview, never a combined station map, and survives reload and Back', async ({ page }) => {
  await page.goto('/#/course')
  await page.getByRole('radio', { name: 'All paths', exact: true }).check()
  await expect(page).toHaveURL(/#\/course\?level=all$/)
  await expect(page.locator('.course-path-card')).toHaveCount(4)
  await expect(page.locator('.course-map')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Choose your learning path', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('radio', { name: 'All paths', exact: true })).toBeChecked()
  await page.screenshot({ path: 'playwright-report/course-paths-overview.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('radio', { name: 'Advanced', exact: true }).check()
  await expect(page.locator('.course-station')).toHaveCount(6)
  await expectSeparateStations(page)
  await page.goBack()
  await expect(page.getByRole('radio', { name: 'All paths', exact: true })).toBeChecked()
  await expect(page.locator('.course-station')).toHaveCount(0)
})

for (const width of [360, 820, 1100, 1440]) {
  test(`${width}px: every course path keeps station labels separate and the page fits`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/#/course?level=all')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const level of ['Beginner', 'Elementary', 'Intermediate', 'Advanced']) {
      await page.getByRole('radio', { name: level, exact: true }).check()
      await expect(page.locator('.course-station')).toHaveCount(level === 'Beginner' ? 7 : 6)
      expect(await page.locator('.course-map-scroll').evaluate((element) => element.scrollLeft)).toBe(0)
      await expectSeparateStations(page)
      expect(await page.locator('.course-map-scroll').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      const mapBounds = await page.locator('.course-map-scroll').boundingBox()
      const dots = await page.locator('.course-station-dot').evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right } }))
      for (const dot of dots) { expect(dot.left).toBeGreaterThanOrEqual(mapBounds!.x); expect(dot.right).toBeLessThanOrEqual(mapBounds!.x + mapBounds!.width + 1) }
      await page.locator('.course-station').last().click()
      await expect(page.locator('.course-station').last()).toHaveAttribute('aria-pressed', 'true')
      if (width > 800) {
        const scrollRegion = page.getByRole('region', { name: `${level} course map`, exact: true })
        const last = await page.locator('.course-station-dot').last().boundingBox()
        const region = await scrollRegion.boundingBox()
        expect(last!.x).toBeGreaterThanOrEqual(region!.x)
        expect(last!.x + last!.width).toBeLessThanOrEqual(region!.x + region!.width + 1)
      }
    }
    await page.screenshot({ path: `playwright-report/course-layout-${width}.png`, fullPage: true, animations: 'disabled' })
  })
}

test('admin-authored stations with identical coordinates and long titles still occupy separate cells', async ({ page, backend }) => {
  const lessons = backend.platform.data.activities.filter((activity) => activity.kind === 'lesson' && activity.languageLevel === 'beginner')
  for (const lesson of lessons) {
    lesson.position = { x: 110, y: 210 }
    lesson.title = `An extended lesson title with more detail about ${lesson.title} and practising Chinese in everyday situations`
  }
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.goto('/#/course')
  await expect(page.locator('.course-station')).toHaveCount(7)
  await expectSeparateStations(page)
  await page.locator('.course-station').last().click()
  await expect(page.locator('.course-preview h2')).toHaveText(lessons.at(-1)!.title)
})

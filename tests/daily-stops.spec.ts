import { expect, test, accountStudyKey } from './fixtures'
import type { Page } from '@playwright/test'
import type { DailyRoute } from '../src/types/daily'
import type { StudyData } from '../src/types/study'
import type { LearningActivity } from '../src/types/learning'

async function stored(page: Page): Promise<StudyData> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'),accountStudyKey)
}
async function current(page: Page): Promise<DailyRoute> { return (await stored(page)).dailyRoutes!.at(-1)! }
async function openToday(page: Page) {
  await page.goto('/#/home')
  await page.getByRole('button',{name:"Open today's stops",exact:true}).click()
  await expect(page.getByRole('list',{name:"Today's learning stops",exact:true})).toBeVisible()
  await expect.poll(async () => (await stored(page)).dailyRoutes?.length).toBe(1)
}
async function reviewWord(page: Page, rating = 'Good') {
  await page.getByRole('button',{name:'Show answer',exact:true}).click()
  await page.getByRole('button',{name:rating,exact:true}).click()
}
async function completeActivity(page: Page, activity: LearningActivity) {
  await page.getByRole('button',{name:activity.kind === 'lesson' ? 'Start lesson' : 'Start exercise',exact:true}).click()
  for (const [index,question] of activity.questions.entries()) {
    const task = page.getByRole('region',{name:'Practice task',exact:true})
    if (question.type === 'choice') await task.locator('.session-option').filter({has:page.getByText(question.options.find((option) => option.id === question.answer)!.text,{exact:true})}).click()
    else for (const token of question.acceptedOrders[0]) await task.getByRole('button',{name:`Add ${token}`,exact:true}).first().click()
    await task.getByRole('button',{name:'Check answer',exact:true}).click()
    await page.getByRole('button',{name:index === activity.questions.length-1 ? 'See results' : 'Next question',exact:true}).click()
  }
  await expect(page.getByRole('region',{name:'Session results',exact:true})).toBeVisible()
}

test('a compact Home opens concrete stops; completion unlocks another personalized section', async ({page,backend}) => {
  test.setTimeout(60_000)
  backend.users[0].daily_goal = 5
  await page.goto('/#/home')
  await expect(page.getByRole('region',{name:'Your learning plan',exact:true})).toHaveCount(0)
  await expect(page.getByRole('region',{name:'Recommendations for your goals',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:"Open today's stops",exact:true}).click()
  await expect(page.locator('.daily-stops > li')).toHaveCount(3)
  const first = await current(page)
  expect((await stored(page)).attempts).toEqual([])
  await expect(page.getByRole('button',{name:'Plan next stops',exact:true})).toHaveCount(0)
  await page.locator('.daily-stop').nth(0).getByRole('button',{name:'Start stop',exact:true}).click()
  for (let i = 0; i < 3; i++) await reviewWord(page,i === 0 ? 'Again' : 'Good')
  await expect(page.getByRole('region',{name:'Current daily stop',exact:true})).toContainText('Stop complete')
  await page.getByRole('button',{name:"Back to today's stops",exact:true}).click()
  await expect(page.locator('.daily-stop').nth(0)).toContainText('Completed')
  await page.locator('.daily-stop').nth(1).getByRole('button',{name:'Start stop',exact:true}).click()
  const skill = first.stops[1]
  if (skill.kind !== 'practice' || skill.mode !== 'sentences') throw Error('Expected a sentence stop')
  const sentence = backend.platform.data.sentences.find((item) => item.id === skill.targetIds[0])!
  // Hints count as participation, without increasing independent accuracy.
  await page.getByRole('button',{name:'Show hint',exact:true}).click()
  for (const token of sentence.tokens) await page.getByRole('group',{name:'Available words',exact:true}).getByRole('button',{name:`Add ${token}`,exact:true}).first().click()
  await page.getByRole('button',{name:'Check sentence',exact:true}).click()
  await expect(page.getByText('The sentence is correct.',{exact:true})).toBeVisible()
  await expect(page.getByRole('region',{name:'Current daily stop',exact:true})).toContainText('Stop complete')
  await page.getByRole('button',{name:"Back to today's stops",exact:true}).click()
  await page.locator('.daily-stop').nth(2).getByRole('button',{name:'Start stop',exact:true}).click()
  const learning = first.stops[2]
  if (learning.kind !== 'activity') throw Error('Expected a course stop')
  const activity = backend.platform.data.activities.find((item) => item.id === learning.activityId)!
  await completeActivity(page,activity)
  await page.getByRole('region',{name:'Current daily stop',exact:true}).getByRole('button',{name:"Back to today's stops",exact:true}).click()
  await expect(page.getByRole('region',{name:"Today's route progress",exact:true})).toContainText('3 / 3 stops completed')
  const history = await stored(page)
  await page.getByRole('button',{name:'Plan next stops',exact:true}).dblclick()
  await expect.poll(async () => (await stored(page)).dailyRoutes?.length).toBe(2)
  const next = await current(page)
  expect(next.id).not.toBe(first.id)
  await expect(page.getByRole('region',{name:"Today's route progress",exact:true})).toContainText('0 / 3 stops completed')
  expect(next.stops[2]).not.toMatchObject({activityId:learning.activityId})
  const review = next.stops[0]
  if (review.kind === 'practice' && first.stops[0].kind === 'practice') {
    expect(review.targetIds[0]).toBe(first.stops[0].targetIds[0])
    expect(review.targetIds).not.toContain(first.stops[0].targetIds[1])
  }
  expect((await stored(page)).attempts).toEqual(history.attempts)
  expect((await stored(page)).learningSessions).toEqual(history.learningSessions)
  expect(backend.requests.filter((request) => request.method === 'POST' && request.path.startsWith('/rest/') && request.path !== '/rest/v1/rpc/get_platform_catalog')).toHaveLength(0)
})

test('reload resumes the remaining words; backups preserve routes and changing preferences keeps history', async ({page,backend}) => {
  backend.users[0].daily_goal = 5
  await openToday(page)
  const route = await current(page)
  await page.locator('.daily-stop').first().getByRole('button',{name:'Start stop',exact:true}).click()
  await reviewWord(page)
  await expect.poll(async () => (await stored(page)).attempts.length).toBe(1)
  const completedWord = (await stored(page)).attempts[0].cardId
  await page.reload()
  await expect(page.locator('.practice-header')).toContainText('1 / 2')
  await reviewWord(page)
  await expect.poll(async () => (await stored(page)).attempts.length).toBe(2)
  expect((await stored(page)).attempts[1].cardId).not.toBe(completedWord)
  await page.getByRole('button',{name:"Back to today's stops",exact:true}).click()
  await expect(page.locator('.daily-stop').first()).toContainText('2 / 3')
  const snapshot = await stored(page)
  await page.getByRole('button',{name:'Route preferences',exact:true}).click()
  await page.getByLabel('Chinese language level',{exact:true}).selectOption('elementary')
  await page.getByLabel('Daily route length',{exact:true}).selectOption('extended')
  await page.getByRole('button',{name:'Save preferences',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Preferences saved')
  await page.getByLabel('Import progress backup',{exact:true}).setInputFiles({name:'daily-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))})
  await expect(page.getByRole('status').filter({hasText:'Backup history was merged'})).toBeVisible()
  expect((await stored(page)).dailyRoutes).toEqual(snapshot.dailyRoutes)
  expect((await stored(page)).attempts).toEqual(snapshot.attempts)
  await page.goto('/#/today')
  await expect(page.getByText(/Your preferences changed/)).toBeVisible()
  await page.getByRole('button',{name:'Build a fresh route',exact:true}).click()
  await expect.poll(async () => (await stored(page)).dailyRoutes?.length).toBe(2)
  expect(await current(page)).toMatchObject({languageLevel:'elementary'})
  const review = (await current(page)).stops[0]
  if (review.kind !== 'practice') throw Error('Expected vocabulary')
  expect(review.targetIds).toHaveLength(7)
  expect((await stored(page)).dailyRoutes![0]).toEqual(route)
  expect((await stored(page)).attempts).toEqual(snapshot.attempts)
})

test('imported matching practice and normal course completion count towards the planned stops', async ({page,backend}) => {
  backend.users[0].daily_goal = 5
  await openToday(page)
  const route = await current(page), review = route.stops[0]
  if (review.kind !== 'practice') throw Error('Expected vocabulary')
  const word = backend.platform.data.vocabulary.find((item) => item.id === review.targetIds[0])!
  // Imported practice uses the same history as attempts from other screens.
  await page.goto('/#/practice/all/flashcards')
  const backup = await stored(page)
  const targeted = {...backup,attempts:[...backup.attempts,{id:'free-review',cardId:word.id,mode:'flashcards',input:'self',correct:false,rating:'again',createdAt:new Date().toISOString()}]}
  await page.goto('/#/settings')
  await page.getByLabel('Import progress backup',{exact:true}).setInputFiles({name:'from-another-device.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(targeted))})
  await expect(page.getByRole('status').filter({hasText:'Backup history was merged'})).toBeVisible()
  await page.goto('/#/today')
  await expect(page.locator('.daily-stop').first()).toContainText('1 / 3')
  const learning = route.stops.find((stop) => stop.kind === 'activity')!
  if (learning.kind !== 'activity') throw Error('Expected activity')
  const activity = backend.platform.data.activities.find((item) => item.id === learning.activityId)!
  await page.goto(`/#/course/${activity.id}`)
  await completeActivity(page,activity)
  await page.goto('/#/today')
  await expect(page.locator('.daily-stop').nth(2)).toContainText('Completed')
})

test('direct access cannot open another account’s route and old dates offer a new plan', async ({page}) => {
  await openToday(page)
  const route = await current(page)
  await page.goto('/#/today/not-my-route/review')
  await expect(page.getByRole('heading',{name:'Stop unavailable',exact:true})).toBeVisible()
  await page.goto('/#/settings')
  const snapshot = await stored(page)
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1)
  const day = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`
  const expired = {...snapshot,dailyRoutes:[{...route,id:'old-route',day,createdAt:new Date(yesterday.setHours(10,0,0,0)).toISOString(),expiresAt:new Date(yesterday.setHours(24,0,0,0)).toISOString()}]}
  // Restore an older backup on an empty device, leaving the original backup intact.
  await page.evaluate((key) => localStorage.removeItem(key),accountStudyKey)
  await page.reload()
  await page.getByLabel('Import progress backup',{exact:true}).setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(expired))})
  await expect(page.getByRole('status').filter({hasText:'Backup history was merged'})).toBeVisible()
  await page.goto('/#/today/old-route/review')
  await expect(page.getByRole('heading',{name:'Stop unavailable',exact:true})).toBeVisible()
  await page.getByRole('button',{name:"Open today's stops",exact:true}).click()
  await expect(page.getByRole('button',{name:"Plan today's stops",exact:true})).toBeVisible()
  await page.getByRole('button',{name:"Plan today's stops",exact:true}).click()
  await expect(page.locator('.daily-stops > li')).toHaveCount(3)
  expect((await stored(page)).dailyRoutes).toHaveLength(2)
})

for (const width of [360,1280]) {
  test(`${width}px: Home and daily stops fit the viewport and work with keyboard navigation`, async ({page}) => {
    await page.setViewportSize({width,height:900})
    await page.goto('/#/home')
    const entry = page.getByRole('button',{name:"Open today's stops",exact:true})
    await expect(entry).toBeVisible()
    await page.screenshot({path:`playwright-report/daily-home-${width}.png`,fullPage:true})
    await entry.focus(); await page.keyboard.press('Enter')
    await expect(page.locator('.daily-stops > li')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({path:`playwright-report/daily-stops-${width}.png`,fullPage:true})
    await page.getByRole('button',{name:'Start stop',exact:true}).first().focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region',{name:'Current daily stop',exact:true})).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test.describe('unauthenticated daily routes', () => {
  test.use({account:null})
  test('requires sign-in even when a guest prefix is added', async ({page,backend}) => {
    await page.goto('/#/guest/today')
    await expect(page).toHaveURL(/#\/login$/)
    await page.goto('/#/today/another-route/review')
    await expect(page).toHaveURL(/#\/login$/)
    expect(await page.evaluate((key) => localStorage.getItem(key),accountStudyKey)).toBeNull()
    expect(backend.requests.filter((request) => request.path.startsWith('/rest/'))).toHaveLength(0)
  })
})

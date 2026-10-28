import { test, expect, studentId, accountStudyKey } from './fixtures'
import type { Page } from '@playwright/test'

test.use({ account: null })
const password = 'Correct-password-123'
async function login(page: Page, email: string) {
  await page.goto('/#/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('guards direct learning links, returns after login, restores sessions and blocks Back after logout', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start learning', exact: true }).click()
  await expect(page).toHaveURL(/#\/login$/)
  await page.goto('/#/practice/food/speech')
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.locator('.speech-card')).toHaveCount(0)
  await page.getByLabel('Email', { exact: true }).fill('student@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/practice\/food\/speech$/)
  await expect(page.locator('.speech-card')).toBeVisible()
  await page.reload()
  await expect(page.locator('.speech-card')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/#\/login$/)
  await page.goBack()
  await expect(page.locator('.speech-card')).toHaveCount(0)
  await page.goto('/#/home')
  await expect(page).toHaveURL(/#\/login$/)
  expect(await page.evaluate(() => localStorage.getItem('hanzi-auth-session-v1'))).toBeNull()
})

test('shows incorrect credentials and prevents access until a valid login succeeds', async ({ page }) => {
  await page.goto('/#/login')
  await page.getByLabel('Email', { exact: true }).fill('student@example.test')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible()
})

test('registers students, handles email confirmation and never submits a privileged role', async ({ page, backend }) => {
  await page.goto('/#/register')
  await page.getByLabel('Your name', { exact: true }).fill('New learner')
  await page.getByLabel('Email', { exact: true }).fill('new@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email', exact: true })).toBeVisible()
  const request = backend.requests.find((item) => item.path === '/auth/v1/signup')!
  expect(request.body.data).toEqual({ display_name: 'New learner' })
  expect(backend.users.find((user) => user.email === 'new@example.test')?.role).toBe('student')
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await page.getByRole('button', { name: 'Go to sign in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('new@example.test')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/home$/)
})

for (const role of ['lecturer', 'admin'] as const) {
  test(`sends ${role} to their role-specific workspace`, async ({ page }) => {
    await login(page, `${role}@example.test`)
    await expect(page).toHaveURL(role === 'admin' ? /#\/admin$/ : /#\/teach$/)
    await expect(page.getByRole('heading', { name: role === 'admin' ? 'Administration' : 'Lecturer workspace', exact: true })).toBeVisible()
  })
}

test('does not grant access from cached user metadata or a forged privileged URL', async ({ page, backend }) => {
  const student = backend.users.find((user) => user.id === studentId)!
  const cached = backend.session(student)
  cached.user.user_metadata = { display_name: 'Admin' }
  await page.addInitScript((value) => localStorage.setItem('hanzi-auth-session-v1', JSON.stringify(value)), cached)
  await page.goto('/#/admin')
  await expect(page).toHaveURL(/#\/home$/)
  await expect(page.getByRole('button', { name: 'Administration', exact: true })).toHaveCount(0)
  await page.goto('/#/teach')
  await expect(page).toHaveURL(/#\/home$/)
  await expect(page.getByRole('button', { name: 'New lesson', exact: true })).toHaveCount(0)
})

test('fails closed when account permissions cannot be loaded', async ({ page, backend }) => {
  backend.failProfile()
  await login(page, 'student@example.test')
  await expect(page.getByRole('heading', { name: 'Account unavailable', exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/#\/login$/)
})

test('isolates accounts on a shared device and explicitly imports earlier anonymous progress', async ({ page }) => {
  const legacy = { version: 1, displayName: 'Legacy learner', dailyGoal: 7, progress: {}, attempts: [] }
  await page.goto('/#/login')
  await page.evaluate((data) => localStorage.setItem('hanzi-learning-study-v1', JSON.stringify(data)), legacy)
  await login(page, 'student@example.test')
  await page.goto('/#/practice/food/flashcards')
  await page.getByRole('button', { name: 'Show answer', exact: true }).click()
  await page.getByRole('button', { name: 'Good', exact: true }).click()
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').attempts?.length, accountStudyKey)).toBe(1)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await login(page, 'other@example.test')
  await page.goto('/#/progress')
  await expect(page.locator('.stat-card').filter({ hasText: 'Total attempts' })).toContainText('0')
  await page.goto('/#/settings')
  await expect(page.getByLabel('What should we call you?', { exact: true })).toHaveValue('')
  await page.getByText('Progress from before accounts', { exact: true }).click()
  await page.getByRole('button', { name: 'Import previous local progress', exact: true }).click()
  await expect(page.getByLabel('What should we call you?', { exact: true })).toHaveValue('Legacy learner')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).attempts.length, accountStudyKey)).toBe(1)
})

test('lecturers publish a lesson that students can read as plain text', async ({ page, backend }) => {
  await login(page, 'lecturer@example.test')
  await page.getByRole('button', { name: 'New lesson', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Ordering tea')
  await page.getByLabel('Summary', { exact: true }).fill('Useful phrases at a café.')
  await page.getByLabel('Lesson content', { exact: true }).fill('我想喝茶。\n<script>window.pwned = true</script>')
  await page.getByLabel('Publish to all signed-in learners', { exact: true }).check()
  await page.getByRole('button', { name: 'Save lesson', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Lesson saved.')
  expect(backend.lessons[0]).toMatchObject({ title: 'Ordering tea', published: true })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await login(page, 'student@example.test')
  await page.getByRole('button', { name: 'Public lessons', exact: true }).click()
  await page.getByRole('button', { name: 'Read lesson', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ordering tea', exact: true })).toBeVisible()
  await expect(page.locator('.lesson-body')).toContainText('<script>window.pwned = true</script>')
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
})

test('a lecturer creates a classroom, a student joins and the lecturer removes that enrollment', async ({ page, backend }) => {
  await login(page, 'lecturer@example.test')
  await page.getByLabel('Classroom name', { exact: true }).fill('Mandarin beginners')
  await page.getByRole('button', { name: 'Create classroom', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Classroom created.')
  const code = backend.classrooms[0].join_code
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await login(page, 'student@example.test')
  await page.getByRole('button', { name: 'Your classrooms', exact: true }).click()
  await page.getByLabel('Invitation code', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Join classroom', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('You joined the classroom.')
  await expect(page.locator('.management-list')).toContainText('Mandarin beginners')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await login(page, 'lecturer@example.test')
  await page.getByRole('button', { name: 'Manage students', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Classroom students' })).toContainText('student@example.test')
  await page.getByRole('button', { name: 'Remove from classroom', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Classroom students' })).toContainText('No students have joined')
  expect(backend.memberships).toHaveLength(0)
})

test('admin role changes use the backend RPC and the last admin cannot be demoted', async ({ page, backend }) => {
  page.on('dialog', (dialog) => { void dialog.accept() })
  await login(page, 'admin@example.test')
  const role = page.getByLabel('Role for other@example.test', { exact: true })
  await role.selectOption('lecturer')
  await role.locator('..').getByRole('button', { name: 'Save role', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Role updated.')
  expect(backend.users.find((user) => user.email === 'other@example.test')?.role).toBe('lecturer')
  const admin = page.getByLabel('Role for admin@example.test', { exact: true })
  await admin.selectOption('student')
  await admin.locator('..').getByRole('button', { name: 'Save role', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The last administrator cannot be demoted.')
})

test('refreshes a lecturer’s permissions after the backend role is revoked', async ({ page, backend }) => {
  await login(page, 'lecturer@example.test')
  await expect(page.getByRole('button', { name: 'New lesson', exact: true })).toBeVisible()
  backend.users.find((user) => user.email === 'lecturer@example.test')!.role = 'student'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page).toHaveURL(/#\/home$/)
  await expect(page.getByRole('button', { name: 'New lesson', exact: true })).toHaveCount(0)
})

test('rechecking the same account on focus keeps an unfinished practice screen intact', async ({ page, backend }) => {
  await login(page, 'student@example.test')
  await page.goto('/#/practice/food/flashcards')
  await page.getByRole('button', { name: 'Show answer', exact: true }).click()
  const before = backend.requests.filter((request) => request.path === '/rest/v1/profiles').length
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => backend.requests.filter((request) => request.path === '/rest/v1/profiles').length).toBeGreaterThan(before)
  await expect(page.getByRole('button', { name: 'Good', exact: true })).toBeVisible()
})

for (const width of [360, 1280]) {
  test(`${width}px: registration and administration fit the viewport`, async ({ page, backend }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/#/register')
    await expect(page.getByRole('heading', { name: 'Create your account', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `playwright-report/auth-${width}-register.png`, fullPage: true })
    backend.users.find((user) => user.role === 'admin')!.display_name = 'Administrator'.repeat(6)
    await login(page, 'admin@example.test')
    await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `playwright-report/auth-${width}-admin.png`, fullPage: true })
  })
}

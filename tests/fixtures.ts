import { test as base, expect, type Page } from '@playwright/test'
import type { UserProfile, UserRole, PublicLesson, Classroom, ClassroomMember } from '../src/types/auth'

export const studentId = '00000000-0000-4000-8000-000000000001'
export const accountStudyKey = `hanzi-learning-study-v1:${studentId}`
const ids = { student: studentId, lecturer: '00000000-0000-4000-8000-000000000002', admin: '00000000-0000-4000-8000-000000000003' }
const otherId = '00000000-0000-4000-8000-000000000004'
const password = 'Correct-password-123'
const timestamp = '2026-10-28T09:00:00.000Z'

export async function mockSupabase(page: Page, initialRole: UserRole | null) {
  const users: UserProfile[] = [...Object.entries(ids).map(([role, id]) => ({ id, role: role as UserRole, email: `${role}@example.test`, display_name: role === 'student' ? 'Student' : role === 'lecturer' ? 'Lecturer' : 'Admin', created_at: timestamp })), { id: otherId, role: 'student', email: 'other@example.test', display_name: 'Other student', created_at: timestamp }]
  const lessons: PublicLesson[] = []
  const classrooms: Classroom[] = []
  const memberships: ClassroomMember[] = []
  const requests: { method: string; path: string; body: Record<string, unknown> }[] = []
  const revoked = new Set<string>()
  let failProfile = false
  const authUser = (user: UserProfile) => ({ id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: user.display_name }, created_at: timestamp })
  const session = (user: UserProfile) => {
    const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated', session_id: user.id })).toString('base64url')
    return { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test-signature`, refresh_token: `refresh-${user.id}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: authUser(user) }
  }
  if (initialRole) await page.addInitScript((value) => localStorage.setItem('hanzi-auth-session-v1', JSON.stringify(value)), session(users.find((user) => user.id === ids[initialRole])!))
  const tokenUser = (authorization: string | undefined) => {
    const token = authorization?.replace(/^Bearer /, '')
    if (!token || revoked.has(token)) return undefined
    try { return users.find((user) => user.id === JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub) } catch { return undefined }
  }
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const body = request.postDataJSON() as Record<string, unknown> | null
    requests.push({ method, path: url.pathname, body: body ?? {} })
    const respond = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: data === null ? '' : JSON.stringify(data), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' } })
    const denied = () => respond({ code: '42501', message: 'Permission denied' }, 403)
    if (method === 'OPTIONS') { await respond(null, 204); return }
    const caller = tokenUser(request.headers().authorization)
    if (url.pathname === '/auth/v1/token') {
      const user = url.searchParams.get('grant_type') === 'password' ? users.find((item) => item.email === body?.email) : users.find((item) => `refresh-${item.id}` === body?.refresh_token)
      if (!user || (url.searchParams.get('grant_type') === 'password' && body?.password !== password)) { await respond({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400); return }
      const value = session(user); revoked.delete(value.access_token); await respond(value); return
    }
    if (url.pathname === '/auth/v1/signup') {
      const user = { id: crypto.randomUUID(), email: String(body?.email), display_name: String((body?.data as { display_name?: string })?.display_name ?? 'Learner'), role: 'student' as const, created_at: timestamp }
      users.push(user); await respond(authUser(user)); return
    }
    if (url.pathname === '/auth/v1/user') { await respond(caller ? authUser(caller) : { code: 'bad_jwt', msg: 'Invalid token' }, caller ? 200 : 401); return }
    if (url.pathname === '/auth/v1/logout') { if (request.headers().authorization) revoked.add(request.headers().authorization.replace(/^Bearer /, '')); await respond(null, 204); return }
    if (!caller) { await denied(); return }
    const single = request.headers().accept?.includes('vnd.pgrst.object')
    const matches = (value: Record<string, unknown>) => [...url.searchParams].every(([field, filter]) => !filter.startsWith('eq.') || String(value[field]) === filter.slice(3))
    const result = (rows: unknown[]) => single ? respond(rows[0] ?? { code: 'PGRST116', message: 'Not found' }, rows.length ? 200 : 406) : respond(rows)
    const rosterVisible = (userId: string) => memberships.some((member) => member.student_id === userId && classrooms.some((classroom) => classroom.id === member.classroom_id && classroom.lecturer_id === caller.id))
    if (url.pathname === '/rest/v1/profiles') {
      if (failProfile) { await respond({ message: 'Unavailable' }, 503); return }
      const visible = users.filter((user) => caller.role === 'admin' || user.id === caller.id || (caller.role === 'lecturer' && rosterVisible(user.id))).filter((user) => matches(user))
      await result(visible); return
    }
    if (url.pathname === '/rest/v1/public_lessons') {
      if (method === 'GET') { await result(lessons.filter((lesson) => (lesson.published || caller.role === 'admin' || (caller.role === 'lecturer' && lesson.author_id === caller.id)) && matches(lesson))); return }
      if (caller.role === 'student') { await denied(); return }
      if (method === 'POST') {
        const lesson = { ...body, id: crypto.randomUUID(), author_id: caller.id, created_at: timestamp, updated_at: timestamp } as PublicLesson
        lessons.push(lesson); await result([lesson]); return
      }
      const target = lessons.find((lesson) => matches(lesson) && (lesson.author_id === caller.id || caller.role === 'admin'))
      if (!target) { await denied(); return }
      if (method === 'PATCH') Object.assign(target, body)
      if (method === 'DELETE') lessons.splice(lessons.indexOf(target), 1)
      await result([target]); return
    }
    if (url.pathname === '/rest/v1/classrooms') {
      if (method === 'GET') { await result(classrooms.filter((classroom) => matches(classroom) && (caller.role === 'admin' || classroom.lecturer_id === caller.id || memberships.some((member) => member.classroom_id === classroom.id && member.student_id === caller.id)))); return }
      if (caller.role === 'student') { await denied(); return }
      if (method === 'POST') { classrooms.push({ id: crypto.randomUUID(), lecturer_id: caller.id, name: String(body?.name), join_code: crypto.randomUUID(), created_at: timestamp }); await respond(null, 201); return }
      const target = classrooms.find((classroom) => matches(classroom) && (caller.role === 'admin' || classroom.lecturer_id === caller.id))
      if (!target) { await denied(); return }
      classrooms.splice(classrooms.indexOf(target), 1); await result([target]); return
    }
    if (url.pathname === '/rest/v1/classroom_members') {
      const rows = memberships.filter((member) => matches(member) && (member.student_id === caller.id || caller.role === 'admin' || classrooms.some((classroom) => classroom.id === member.classroom_id && classroom.lecturer_id === caller.id)))
      if (method === 'DELETE') for (const row of rows) memberships.splice(memberships.indexOf(row), 1)
      await result(rows); return
    }
    if (url.pathname === '/rest/v1/rpc/join_classroom') {
      if (caller.role !== 'student') { await denied(); return }
      const classroom = classrooms.find((item) => item.join_code === body?.invitation)
      if (!classroom) { await respond({ code: 'P0001', message: 'Classroom invitation not found.' }, 400); return }
      if (!memberships.some((member) => member.classroom_id === classroom.id && member.student_id === caller.id)) memberships.push({ classroom_id: classroom.id, student_id: caller.id, joined_at: timestamp })
      await respond(classroom.id); return
    }
    if (url.pathname === '/rest/v1/rpc/set_user_role') {
      if (caller.role !== 'admin') { await denied(); return }
      const target = users.find((user) => user.id === body?.target_user)
      if (!target) { await respond({ code: 'P0001', message: 'User not found.' }, 400); return }
      if (target.role === 'admin' && body?.new_role !== 'admin' && users.filter((user) => user.role === 'admin').length === 1) { await respond({ code: 'P0001', message: 'The last administrator cannot be demoted.' }, 400); return }
      target.role = body?.new_role as UserRole; await respond(null, 204); return
    }
    await respond({ message: 'Unknown test endpoint' }, 404)
  })
  return { users, lessons, classrooms, memberships, requests, failProfile: () => { failProfile = true }, session }
}

type Backend = Awaited<ReturnType<typeof mockSupabase>>
export const test = base.extend<{ account: UserRole | null; backend: Backend }>({
  account: ['student', { option: true }],
  backend: [async ({ page, account }, use) => { await use(await mockSupabase(page, account)) }, { auto: true }],
})
export { expect }

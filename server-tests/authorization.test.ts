import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { catalog } from '../src/data/catalog'
import { parseContentCatalog } from '../src/lib/contentValidation'
import type { CatalogSnapshot } from '../src/lib/contentMutation'

const db = new PGlite()
const ids = {
  student: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  lecturer: '00000000-0000-4000-8000-000000000003',
  otherLecturer: '00000000-0000-4000-8000-000000000004',
  admin: '00000000-0000-4000-8000-000000000005',
}
const sessionId = (id: string) => id.replace('00000000-', '10000000-')
const lesson = '20000000-0000-4000-8000-000000000001'
const foreignLesson = '20000000-0000-4000-8000-000000000002'
const draft = '20000000-0000-4000-8000-000000000003'
const classroom = '30000000-0000-4000-8000-000000000001'
const foreignClassroom = '30000000-0000-4000-8000-000000000002'

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; grant usage on schema auth to anon, authenticated;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261028090000_auth_and_roles.sql', import.meta.url), 'utf8'))
  for (const [name, id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)', [id, `${name}@example.test`, JSON.stringify({ display_name: name, role: 'admin' })])
    await db.query('insert into auth.sessions(id,user_id) values ($1,$2)', [sessionId(id), id])
  }
  await db.query("update public.profiles set role='lecturer' where id in ($1,$2)", [ids.lecturer, ids.otherLecturer])
  await db.query("update public.profiles set role='admin' where id=$1", [ids.admin])
  await db.query(`insert into public.public_lessons(id,author_id,title,content,published) values
    ($1,$4,'Published one','Content',true), ($2,$5,'Published two','Content',true), ($3,$5,'Private draft','Content',false)`, [lesson, foreignLesson, draft, ids.lecturer, ids.otherLecturer])
  await db.query(`insert into public.classrooms(id,lecturer_id,name,join_code) values ($1,$3,'Own class','first-invite'),($2,$4,'Other class','second-invite')`, [classroom, foreignClassroom, ids.lecturer, ids.otherLecturer])
  await db.query('insert into public.classroom_members(classroom_id,student_id) values ($1,$2)', [classroom, ids.student])
  // Upgrade a database that already has accounts and learning content.
  await db.exec(readFileSync(new URL('../supabase/migrations/20261101090000_learning_profiles.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261101120000_content_classification.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261101150000_platform_content_admin.sql', import.meta.url), 'utf8'))
}, 30_000)
afterAll(async () => { await db.close() })

async function asUser<T>(id: string | null, operation: () => Promise<T>, session = id ? sessionId(id) : ''): Promise<T> {
  await db.exec(`begin; set local role ${id ? 'authenticated' : 'anon'};`)
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, session_id: session, role: id ? 'authenticated' : 'anon', user_metadata: { role: 'admin' } })])
    return await operation()
  } finally { await db.exec('rollback') }
}

describe('backend authorization using the actual PostgreSQL migration', () => {
  it('denies anonymous table reads and privileged RPC calls', async () => {
    for (const table of ['profiles', 'public_lessons', 'classrooms', 'classroom_members']) {
      await expect(asUser(null, () => db.query(`select * from public.${table}`))).rejects.toMatchObject({ code: '42501' })
    }
    await expect(asUser(null, () => db.query("select public.join_classroom('first-invite')"))).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(null, () => db.query("select public.set_user_role($1,'admin')", [ids.student]))).rejects.toMatchObject({ code: '42501' })
  })
  it('ignores forged signup metadata and forbids direct changes to roles or email', async () => {
    expect((await db.query<{ role: string }>('select role from public.profiles where id=$1', [ids.student])).rows[0].role).toBe('student')
    await expect(asUser(ids.student, () => db.query("update public.profiles set role='admin' where id=$1", [ids.student]))).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(ids.student, () => db.query("update public.profiles set email='stolen@example.test' where id=$1", [ids.student]))).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(ids.student, () => db.query("select public.set_user_role($1,'admin')", [ids.student]))).rejects.toMatchObject({ code: '42501' })
  })
  it('only exposes the student’s own profile, published lessons and enrolled class', async () => {
    await asUser(ids.student, async () => {
      expect((await db.query('select id from public.profiles')).rows).toEqual([{ id: ids.student }])
      expect((await db.query('select id from public.public_lessons')).rows).toHaveLength(2)
      expect((await db.query('select id from public.public_lessons where id=$1', [draft])).rows).toEqual([])
      expect((await db.query('select id from public.classrooms')).rows).toEqual([{ id: classroom }])
      expect((await db.query('select student_id from public.classroom_members')).rows).toEqual([{ student_id: ids.student }])
      expect((await db.query("update public.profiles set display_name='My name' where id=$1 returning id", [ids.student])).rows).toHaveLength(1)
    })
    await expect(asUser(ids.student, () => db.query("insert into public.public_lessons(title,content) values ('Bad','Content')"))).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(ids.student, () => db.query("insert into public.classrooms(name) values ('Bad')"))).rejects.toMatchObject({ code: '42501' })
  })
  it('allows a lecturer to create, publish, edit and delete their own lessons', async () => {
    await asUser(ids.lecturer, async () => {
      const { rows } = await db.query<{ id: string }>("insert into public.public_lessons(title,content) values ('My draft','你好') returning id")
      const id = rows[0].id
      expect((await db.query("update public.public_lessons set title='Published',published=true where id=$1 returning id", [id])).rows).toHaveLength(1)
      expect((await db.query('delete from public.public_lessons where id=$1 returning id', [id])).rows).toHaveLength(1)
    })
  })
  it('prevents a lecturer from reading foreign drafts, stealing authorship or editing another lecturer’s lessons', async () => {
    await asUser(ids.lecturer, async () => {
      expect((await db.query('select id from public.public_lessons where id=$1', [draft])).rows).toEqual([])
      expect((await db.query("update public.public_lessons set title='Stolen' where id=$1 returning id", [foreignLesson])).rows).toEqual([])
      expect((await db.query('delete from public.public_lessons where id=$1 returning id', [foreignLesson])).rows).toEqual([])
    })
    await expect(asUser(ids.lecturer, () => db.query("insert into public.public_lessons(author_id,title,content) values ($1,'Forged','Content')", [ids.otherLecturer]))).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(ids.lecturer, () => db.query('update public.public_lessons set author_id=$1 where id=$2', [ids.lecturer, foreignLesson]))).rejects.toMatchObject({ code: '42501' })
  })
  it('limits a lecturer to their own roster and denies role management', async () => {
    await asUser(ids.lecturer, async () => {
      expect((await db.query('select id from public.classrooms')).rows).toEqual([{ id: classroom }])
      expect((await db.query('select id from public.profiles order by id')).rows).toEqual([{ id: ids.student }, { id: ids.lecturer }])
      expect((await db.query('select * from public.classroom_members where classroom_id=$1', [foreignClassroom])).rows).toEqual([])
    })
    await expect(asUser(ids.lecturer, () => db.query("select public.set_user_role($1,'lecturer')", [ids.student]))).rejects.toMatchObject({ code: '42501' })
  })
  it('allows classroom creation and updates while preventing forged ownership and invitation changes', async () => {
    await asUser(ids.lecturer, async () => {
      const { rows } = await db.query<{ id: string; lecturer_id: string }>("insert into public.classrooms(name) values ('New class') returning id, lecturer_id")
      expect(rows[0].lecturer_id).toBe(ids.lecturer)
      expect((await db.query("update public.classrooms set name='Renamed' where id=$1 returning id", [rows[0].id])).rows).toHaveLength(1)
      expect((await db.query("update public.classrooms set name='Foreign' where id=$1 returning id", [foreignClassroom])).rows).toEqual([])
    })
    await expect(asUser(ids.lecturer, () => db.query("insert into public.classrooms(name,lecturer_id) values ('Forged',$1)", [ids.otherLecturer]))).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(ids.lecturer, () => db.query("update public.classrooms set join_code='changed' where id=$1", [classroom]))).rejects.toMatchObject({ code: '42501' })
  })
  it('requires a valid invitation, binds enrollment to the caller and allows leaving/removing students', async () => {
    await expect(asUser(ids.other, () => db.query("select public.join_classroom('wrong')"))).rejects.toMatchObject({ code: 'P0001' })
    await expect(asUser(ids.other, () => db.query('insert into public.classroom_members(classroom_id,student_id) values ($1,$2)', [classroom, ids.other]))).rejects.toMatchObject({ code: '42501' })
    await asUser(ids.other, async () => {
      await db.query("select public.join_classroom('first-invite')")
      await db.query("select public.join_classroom('first-invite')")
      expect((await db.query('select * from public.classroom_members')).rows).toHaveLength(1)
      expect((await db.query('delete from public.classroom_members where classroom_id=$1 and student_id=$2 returning student_id', [classroom, ids.student])).rows).toEqual([])
      expect((await db.query('delete from public.classroom_members where student_id=$1 returning student_id', [ids.other])).rows).toHaveLength(1)
    })
    await asUser(ids.lecturer, async () => {
      expect((await db.query('delete from public.classroom_members where classroom_id=$1 and student_id=$2 returning student_id', [classroom, ids.student])).rows).toHaveLength(1)
      expect((await db.query('select id from public.profiles where id=$1', [ids.student])).rows).toEqual([])
    })
  })
  it('lets administrators manage all content and change roles with immediate database enforcement', async () => {
    await asUser(ids.admin, async () => {
      expect((await db.query('select id from public.profiles')).rows).toHaveLength(5)
      expect((await db.query('select id from public.public_lessons')).rows).toHaveLength(3)
      expect((await db.query('select id from public.classrooms')).rows).toHaveLength(2)
      expect((await db.query("update public.public_lessons set title='Reviewed' where id=$1 returning id", [foreignLesson])).rows).toHaveLength(1)
      await db.query("select public.set_user_role($1,'lecturer')", [ids.other])
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids.other, session_id: sessionId(ids.other), role: 'authenticated' })])
      expect((await db.query<{ role: string }>('select private.current_app_role() as role')).rows[0].role).toBe('lecturer')
    })
  })
  it('protects the last administrator', async () => {
    await expect(asUser(ids.admin, () => db.query("select public.set_user_role($1,'student')", [ids.admin]))).rejects.toMatchObject({ code: 'P0001', message: 'The last administrator cannot be demoted.' })
  })
  it('denies access after a session’s database deadline, even while its row still exists', async () => {
    await db.query("update auth.sessions set not_after='2000-01-01T00:00:00Z' where user_id=$1", [ids.student])
    try {
      await asUser(ids.student, async () => {
        expect((await db.query('select * from public.profiles')).rows).toEqual([])
        expect((await db.query('select * from public.public_lessons')).rows).toEqual([])
      })
    } finally { await db.query('update auth.sessions set not_after=null where user_id=$1', [ids.student]) }
  })
  it('rejects a forged or revoked session even if it still has a user ID and elevated metadata', async () => {
    await asUser(ids.admin, async () => {
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids.admin, session_id: 'missing-session', user_metadata: { role: 'admin' } })])
      expect((await db.query('select * from public.profiles')).rows).toEqual([])
      expect((await db.query('select * from public.public_lessons')).rows).toEqual([])
    })
    await db.query('delete from auth.sessions where user_id=$1', [ids.student])
    try {
      await asUser(ids.student, async () => { expect((await db.query('select * from public.public_lessons')).rows).toEqual([]) })
      await expect(asUser(ids.student, () => db.query("select public.join_classroom('first-invite')"))).rejects.toMatchObject({ code: '42501' })
    } finally { await db.query('insert into auth.sessions(id,user_id) values ($1,$2)', [sessionId(ids.student), ids.student]) }
  })
})

const saveProfileSql = 'select public.save_learning_profile($1,$2,$3,$4::text[],$5::text[],$6) as profile'
const validProfile = ['Learner', 'elementary', 'gentle', ['speech', 'writing'], ['travel', 'culture'], 15]

const adminSaveSql = 'select public.admin_save_platform_content($1,$2,$3::jsonb,$4) as snapshot'
const newWord = { ...catalog.vocabulary[0], id: 'platform:db-word', hanzi: '明白', meaning: 'to understand', sourceId: 'hanzi-original', sourceEntryId: undefined, level: null }
const newGrammar = { id: 'platform:db-grammar', title: 'Database grammar', explanation: 'A reusable explanation.', languageLevel: 'beginner', difficulty: 'balanced', examples: [{ hanzi: '我明白。', pinyin: 'Wǒ míngbai.', meaning: 'I understand.' }], prerequisites: [], vocabularyIds: [newWord.id] }
const newLesson = { ...catalog.activities[0], id: 'platform:db-lesson', title: 'Database lesson', prerequisites: [], vocabularyIds: [newWord.id], grammarTopicIds: [newGrammar.id], features: [] }
async function adminSave(kind: string, id: string, payload: unknown, revision: number): Promise<CatalogSnapshot> {
  return (await db.query<{ snapshot: CatalogSnapshot }>(adminSaveSql, [kind, id, payload === null ? null : JSON.stringify(payload), revision])).rows[0].snapshot
}

describe('platform content administration API and database rules', () => {
  it('seeds original data and permits only verified sessions to read it', async () => {
    await expect(asUser(null, () => db.query('select public.get_platform_catalog()'))).rejects.toMatchObject({ code: '42501' })
    for (const id of [ids.student, ids.lecturer, ids.admin]) await asUser(id, async () => {
      const { rows } = await db.query<{ snapshot: CatalogSnapshot }>('select public.get_platform_catalog() as snapshot')
      expect(rows[0].snapshot.revision).toBe(1)
      expect(parseContentCatalog(rows[0].snapshot.data)).toEqual(catalog)
    })
  })
  it('rejects student/lecturer/anonymous writes, direct table writes and forged or revoked admin sessions', async () => {
    for (const id of [null, ids.student, ids.lecturer]) await expect(asUser(id, () => adminSave('vocabulary', newWord.id, newWord, 1))).rejects.toMatchObject({ code: '42501' })
    for (const id of [ids.student, ids.admin]) await expect(asUser(id, () => db.query('update public.platform_catalog set revision=100'))).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(ids.admin, () => adminSave('vocabulary', newWord.id, newWord, 1), 'revoked-session')).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(ids.admin, () => db.query('select private.validate_platform_catalog($1::jsonb)', [JSON.stringify(catalog)]))).rejects.toMatchObject({ code: '42501' })
  })
  it('creates linked words, grammar examples, lessons and exercises with server-owned identity and revisions', async () => {
    await asUser(ids.admin, async () => {
      let result = await adminSave('vocabulary', newWord.id, newWord, 1)
      result = await adminSave('grammar', newGrammar.id, newGrammar, result.revision)
      result = await adminSave('lesson', newLesson.id, { ...newLesson, id: 'forged-id', revision: 400, source: 'lecturer', kind: 'exercise' }, result.revision)
      expect(result.data.activities.find((item) => item.id === newLesson.id)).toMatchObject({ kind: 'lesson', source: 'platform', revision: 1 })
      result = await adminSave('exercise', 'platform:db-exercise', { ...newLesson, id: 'platform:db-exercise', kind: 'exercise' }, result.revision)
      expect(result.revision).toBe(5)
      expect(parseContentCatalog(result.data)).toBeDefined()
    })
  })
  it('updates answer banks through new revisions and retains every original question bank', async () => {
    await asUser(ids.admin, async () => {
      const original = catalog.activities[0]
      const result = await adminSave('lesson', original.id, { ...original, title: 'Updated tone lesson', questions: original.questions.slice(0, 2) }, 1)
      expect(result.data.activities.find((item) => item.id === original.id && item.revision === 1)?.questions).toEqual(original.questions)
      expect(result.data.activities.find((item) => item.id === original.id && item.revision === 1)?.publication).toBe('archived')
      expect(result.data.activities.find((item) => item.id === original.id && item.revision === 2)?.questions).toHaveLength(2)
      expect(parseContentCatalog(result.data)).toBeDefined()
    })
  })
  it('archives and restores unreferenced content without deleting historical data', async () => {
    await asUser(ids.admin, async () => {
      let result = await adminSave('vocabulary', newWord.id, newWord, 1)
      result = await adminSave('vocabulary', newWord.id, null, result.revision)
      expect(result.data.vocabulary.find((word) => word.id === newWord.id)?.archived).toBe(true)
      result = await adminSave('vocabulary', newWord.id, { ...newWord, meaning: 'restored word' }, result.revision)
      expect(result.data.vocabulary.find((word) => word.id === newWord.id)).toMatchObject({ archived: false, meaning: 'restored word' })
      const independent = { ...catalog.activities.find((item) => item.kind === 'exercise')!, id: 'platform:temporary', prerequisites: [] }
      result = await adminSave('exercise', independent.id, independent, result.revision)
      result = await adminSave('exercise', independent.id, null, result.revision)
      expect(result.data.activities.filter((item) => item.id === independent.id)).toHaveLength(2)
      expect(result.data.activities.find((item) => item.id === independent.id && item.revision === 2)?.publication).toBe('archived')
    })
  })
  it('blocks deleting published prerequisites and grammar/word dependencies', async () => {
    for (const [kind, id] of [['lesson', 'lesson-tones'], ['grammar', 'identity-shi'], ['vocabulary', 'wo']]) await expect(asUser(ids.admin, () => adminSave(kind, id, null, 1))).rejects.toMatchObject({ code: '22023' })
    await expect(asUser(ids.admin, () => adminSave('vocabulary', 'wo', { ...catalog.vocabulary.find((word) => word.id === 'wo')!, hanzi: 'different identity' }, 1))).rejects.toMatchObject({ code: '22023' })
  })
  it('validates API payloads independently of frontend validation and rolls back failures', async () => {
    const original = catalog.activities[0]
    const bad = [
      { ...original, questions: [{ ...original.questions[0], answer: 'missing-answer' }] },
      { ...original, questions: [{ ...original.questions[0], id: 7 }] },
      { ...original, grammarTopicIds: ['missing-topic'] },
      { ...original, vocabularyIds: ['missing-word'] },
      { ...original, languageLevel: 'expert' },
      { ...original, difficulty: 'unknown' },
      { ...original, prerequisites: ['lesson-greetings'] },
      { ...original, features: ['tone-guide', 'tone-guide'] },
    ]
    for (const payload of bad) await expect(asUser(ids.admin, () => adminSave('lesson', original.id, payload, 1))).rejects.toMatchObject({ code: '22023' })
    expect((await db.query('select revision from public.platform_catalog')).rows).toEqual([{ revision: 1 }])
  })
  it('detects stale revisions atomically instead of overwriting another administrator’s work', async () => {
    await asUser(ids.admin, async () => {
      await adminSave('vocabulary', newWord.id, newWord, 1)
      await db.exec('savepoint stale_revision')
      await expect(adminSave('grammar', newGrammar.id, newGrammar, 1)).rejects.toMatchObject({ code: '40001' })
      await db.exec('rollback to savepoint stale_revision')
      const { rows } = await db.query<{ data: typeof catalog; revision: number }>('select data,revision from public.platform_catalog')
      expect(rows[0].revision).toBe(2)
      expect(rows[0].data.vocabulary.find((word) => word.id === newWord.id)).toBeDefined()
      expect(rows[0].data.grammarTopics.find((topic) => topic.id === newGrammar.id)).toBeUndefined()
    })
  })
})

describe('lecturer content classification and preserved ownership', () => {
  it('adds defaults to existing lessons without changing their author, text or publication', async () => {
    const { rows } = await db.query('select id,author_id,title,content,published,language_level,difficulty from public.public_lessons where id=$1', [lesson])
    expect(rows[0]).toEqual({ id: lesson, author_id: ids.lecturer, title: 'Published one', content: 'Content', published: true, language_level: 'beginner', difficulty: 'balanced' })
  })
  it('allows owners to classify their own lessons while blocking students, foreign authors and invalid metadata', async () => {
    await asUser(ids.lecturer, async () => {
      expect((await db.query("update public.public_lessons set language_level='elementary',difficulty='gentle' where id=$1 returning language_level,difficulty", [lesson])).rows).toEqual([{ language_level: 'elementary', difficulty: 'gentle' }])
      expect((await db.query("update public.public_lessons set language_level='advanced' where id=$1 returning id", [foreignLesson])).rows).toEqual([])
    })
    await asUser(ids.student, async () => { expect((await db.query("update public.public_lessons set difficulty='challenging' where id=$1 returning id", [lesson])).rows).toEqual([]) })
    await expect(asUser(ids.lecturer, () => db.query("update public.public_lessons set language_level='unknown' where id=$1", [lesson]))).rejects.toMatchObject({ code: '23514' })
    await expect(asUser(ids.lecturer, () => db.query("update public.public_lessons set difficulty='impossible' where id=$1", [lesson]))).rejects.toMatchObject({ code: '23514' })
  })
})

describe('learning profile migration and database authorization', () => {
  it('preserves existing accounts and content while requiring explicit onboarding', async () => {
    const { rows } = await db.query<{ onboarding_completed_at: string | null; daily_goal: number; preferred_modes: string[] }>('select onboarding_completed_at,daily_goal,preferred_modes from public.profiles')
    expect(rows).toHaveLength(5)
    for (const row of rows) expect(row).toEqual({ onboarding_completed_at: null, daily_goal: 10, preferred_modes: [] })
    expect((await db.query('select id from public.public_lessons')).rows).toHaveLength(3)
  })

  it('creates new profiles without trusting onboarding or role claims from signup metadata', async () => {
    await db.exec('begin')
    try {
      await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)', ['90000000-0000-4000-8000-000000000001', 'new@example.test', JSON.stringify({ role: 'admin', onboarding_completed_at: '2026-01-01T00:00:00Z', language_level: 'advanced', daily_goal: 100 })])
      expect((await db.query('select role,onboarding_completed_at,language_level,daily_goal from public.profiles where email=$1', ['new@example.test'])).rows[0]).toEqual({ role: 'student', onboarding_completed_at: null, language_level: null, daily_goal: 10 })
    } finally { await db.exec('rollback') }
  })

  it('saves only the caller’s complete profile with a server-owned completion timestamp', async () => {
    await asUser(ids.student, async () => {
      const { rows } = await db.query<{ profile: Record<string, unknown> }>(saveProfileSql, validProfile)
      expect(rows[0].profile).toMatchObject({ id: ids.student, role: 'student', display_name: 'Learner', language_level: 'elementary', difficulty: 'gentle', preferred_modes: ['speech', 'writing'], learning_goals: ['culture', 'travel'], daily_goal: 15 })
      expect(rows[0].profile.onboarding_completed_at).toBeTruthy()
      expect((await db.query('select id from public.profiles where id=$1', [ids.other])).rows).toEqual([])
    })
  })

  it('allows later edits for every role while preserving completion and normalizing duplicate choices', async () => {
    for (const id of [ids.student, ids.lecturer, ids.admin]) {
      await asUser(id, async () => {
        const first = (await db.query<{ profile: Record<string, unknown> }>(saveProfileSql, validProfile)).rows[0].profile
        const next = (await db.query<{ profile: Record<string, unknown> }>(saveProfileSql, ['Updated', 'beginner', 'balanced', ['flashcards', 'flashcards'], ['study', 'study'], 7])).rows[0].profile
        expect(next).toMatchObject({ id, display_name: 'Updated', daily_goal: 7, preferred_modes: ['flashcards'], learning_goals: ['study'], onboarding_completed_at: first.onboarding_completed_at, role: first.role })
      })
    }
  })

  it('rejects incomplete, unknown, null or out-of-range preferences atomically', async () => {
    const invalid: [number, unknown][] = [[0, '  '], [1, null], [1, 'expert'], [2, null], [2, 'impossible'], [3, []], [3, ['admin']], [3, [null]], [3, null], [4, []], [4, ['unknown']], [4, [null]], [4, null], [5, 0], [5, 101], [5, null]]
    for (const [index, value] of invalid) {
      const input = [...validProfile]; input[index] = value as typeof input[number]
      await expect(asUser(ids.student, () => db.query(saveProfileSql, input))).rejects.toMatchObject({ code: '22023' })
    }
    expect((await db.query('select onboarding_completed_at from public.profiles where id=$1', [ids.student])).rows[0]).toEqual({ onboarding_completed_at: null })
  })

  it('does not grant direct writes to preferences or the completion timestamp, even to an admin client', async () => {
    for (const id of [ids.student, ids.admin]) {
      await expect(asUser(id, () => db.query('update public.profiles set onboarding_completed_at=now() where id=$1', [id]))).rejects.toMatchObject({ code: '42501' })
      await expect(asUser(id, () => db.query('update public.profiles set daily_goal=30 where id=$1', [ids.other]))).rejects.toMatchObject({ code: '42501' })
    }
  })

  it('denies anonymous or revoked sessions access to the save RPC', async () => {
    await expect(asUser(null, () => db.query(saveProfileSql, validProfile))).rejects.toMatchObject({ code: '42501' })
    await expect(asUser(ids.student, () => db.query(saveProfileSql, validProfile), 'missing-session')).rejects.toMatchObject({ code: '42501' })
  })
})

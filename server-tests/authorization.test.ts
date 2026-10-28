import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

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

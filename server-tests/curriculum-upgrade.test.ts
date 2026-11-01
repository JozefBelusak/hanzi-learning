import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { catalog } from '../src/data/catalog'
import { parseContentCatalog } from '../src/lib/contentValidation'

const db = new PGlite()
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const upgrade = migration('20261101180000_expanded_curriculum')
const originalSeed = JSON.parse(migration('20261101150000_platform_content_admin').match(/\$hanzi_seed\$([\s\S]*?)\$hanzi_seed\$/)![1]) as typeof catalog
beforeEach(async () => {
  await db.query('update public.platform_catalog set data=$1::jsonb,revision=1', [JSON.stringify(originalSeed)])
})
beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; grant usage on schema auth to anon, authenticated;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  `)
  for (const name of ['20261028090000_auth_and_roles', '20261101090000_learning_profiles', '20261101120000_content_classification', '20261101150000_platform_content_admin']) await db.exec(migration(name))
}, 30_000)

it('uploads small private SQL Editor parts, rejects an incomplete upload, then publishes the same catalog atomically', async () => {
  await db.query('update public.platform_catalog set revision=10')
  const directory = new URL('../supabase/sql-editor/expanded-curriculum/', import.meta.url)
  const files = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()
  expect(files.length).toBeGreaterThan(2)
  const parts = files.map((name) => readFileSync(new URL(name, directory), 'utf8'))
  for (const part of parts) expect(Buffer.byteLength(part, 'utf8')).toBeLessThan(260_000)
  const read = async () => (await db.query<{ data: typeof catalog; revision: number }>('select data,revision from public.platform_catalog')).rows[0]
  const initial = await read()
  // Leave one payload out to simulate an interrupted manual upload.
  for (const part of parts.slice(0, -2)) await db.exec(part)
  expect(await read()).toEqual(initial)
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`begin; set local role ${role};`)
    await expect(db.query('select * from private.curriculum_20261101180000_upload')).rejects.toMatchObject({ code: '42501' })
    await db.exec('rollback')
  }
  const finish = parts.at(-1)!
  await expect(db.exec(finish)).rejects.toThrow('upload is incomplete or changed')
  await db.exec('rollback')
  expect(await read()).toEqual(initial)
  await db.exec(parts.at(-2)!)
  await db.exec(finish)
  const expanded = await read()
  expect(expanded.revision).toBe(11)
  const parsed = parseContentCatalog(expanded.data)
  expect({ ...parsed, vocabulary: [...parsed.vocabulary].sort((a, b) => a.id.localeCompare(b.id)) })
    .toEqual({ ...catalog, vocabulary: [...catalog.vocabulary].sort((a, b) => a.id.localeCompare(b.id)) })
  expect((await db.query("select to_regclass('private.curriculum_20261101180000_upload') as upload")).rows).toEqual([{ upload: null }])
  for (const part of parts) await db.exec(part)
  expect(await read()).toEqual(expanded)
}, 30_000)
afterAll(async () => { await db.close() })

it('rolls back an identity collision, then preserves editor changes, archived banks and custom words during an idempotent upgrade', async () => {
  const read = async () => (await db.query<{ data: typeof catalog; revision: number }>('select data,revision from public.platform_catalog')).rows[0]
  const baseline = await read()
  const incoming = catalog.vocabulary.find((word) => !baseline.data.vocabulary.some((old) => old.id === word.id))!
  const conflict = structuredClone(baseline.data)
  conflict.vocabulary.push({ ...incoming, hanzi: '冲突' })
  await db.query('update public.platform_catalog set data=$1::jsonb', [JSON.stringify(conflict)])
  await expect(db.exec(upgrade)).rejects.toThrow('identity was reassigned')
  await db.exec('rollback')
  expect((await read()).data).toEqual(conflict)

  const edited = structuredClone(baseline.data)
  edited.vocabulary[0].meaning = 'An administrator-edited definition'
  const custom = { ...incoming, id: 'platform:custom-before-expansion', sourceId: 'hanzi-original', hanzi: '自定义', meaning: 'A custom word' }
  edited.vocabulary.push(custom)
  const original = edited.activities[0]
  original.publication = 'archived'
  edited.activities.push({ ...original, revision: 2, title: 'An archived teacher edit' })
  await db.query('update public.platform_catalog set data=$1::jsonb', [JSON.stringify(edited)])
  await db.exec(upgrade)
  const expanded = await read()
  expect(expanded.revision).toBe(baseline.revision + 1)
  expect(parseContentCatalog(expanded.data)).toBeDefined()
  expect(expanded.data.vocabulary).toHaveLength(5001)
  expect(expanded.data.vocabulary[0].meaning).toBe(edited.vocabulary[0].meaning)
  expect(expanded.data.vocabulary.find((word) => word.id === custom.id)).toEqual(custom)
  expect(expanded.data.activities.filter((item) => item.id === original.id)).toEqual(edited.activities.filter((item) => item.id === original.id))
  expect(expanded.data.activities.filter((item) => item.kind === 'lesson')).toHaveLength(26) // Includes the retained revision.
  await db.exec(upgrade)
  expect(await read()).toEqual(expanded)
}, 30_000)

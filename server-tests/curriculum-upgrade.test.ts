import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { catalog } from '../src/data/catalog'
import { parseContentCatalog } from '../src/lib/contentValidation'

const db = new PGlite()
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const upgrade = migration('20261101180000_expanded_curriculum')
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

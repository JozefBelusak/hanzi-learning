import { afterAll, beforeAll, expect, it } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import snapshot from '../src/data/vocabulary-hsk.json'
import taxonomy from '../src/data/content/taxonomy.json'

let sandbox: string
beforeAll(async () => {
  const parent = join(process.cwd(), 'node_modules', '.cache')
  await mkdir(parent, { recursive: true })
  sandbox = await mkdtemp(join(parent, 'hanzi-content-import-'))
  await mkdir(join(sandbox, 'scripts'), { recursive: true })
  await mkdir(join(sandbox, 'src/data/content'), { recursive: true })
  await cp('scripts/import-vocabulary.mjs', join(sandbox, 'scripts/import-vocabulary.mjs'))
  await writeFile(join(sandbox, 'src/data/content/taxonomy.json'), JSON.stringify(taxonomy))
  await writeFile(join(sandbox, 'src/data/vocabulary-hsk.json'), JSON.stringify(snapshot))
})
afterAll(async () => { if (sandbox) await rm(sandbox, { recursive: true, force: true }) })

it('imports provider data from a local file and prepares offline assets without changing published IDs', async () => {
  const source = join(sandbox, 'provider.json')
  await writeFile(source, JSON.stringify(snapshot))
  const result = spawnSync(process.execPath, ['scripts/import-vocabulary.mjs', '--file', source], { cwd: sandbox, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  const imported = JSON.parse(await readFile(join(sandbox, 'src/data/vocabulary-hsk.json'), 'utf8'))
  expect(imported.words).toEqual(snapshot.words)
  expect(JSON.parse(await readFile(join(sandbox, 'src/data/strokes/我.json'), 'utf8')).strokes.length).toBeGreaterThan(0)
  expect(await readFile(join(sandbox, 'public/licenses/hanzi-writer-data-LICENSE.txt'), 'utf8')).toContain('ARPHIC')
})

it('refuses a partial/reassigned provider list before overwriting the existing snapshot', async () => {
  const destination = join(sandbox, 'src/data/vocabulary-hsk.json')
  const before = await readFile(destination, 'utf8')
  for (const words of [snapshot.words.slice(1), snapshot.words.map((word, index) => index ? word : { ...word, simplified: '改变' })]) {
    const source = join(sandbox, 'bad-provider.json')
    await writeFile(source, JSON.stringify({ ...snapshot, words }))
    const result = spawnSync(process.execPath, ['scripts/import-vocabulary.mjs', '--file', source], { cwd: sandbox, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Keep existing vocabulary identity')
    expect(await readFile(destination, 'utf8')).toBe(before)
  }
})

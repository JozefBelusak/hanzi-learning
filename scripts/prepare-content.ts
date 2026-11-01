import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { project, readCatalog } from './content-files.ts'

const catalog = await readCatalog()
const require = createRequire(import.meta.url)
const dataPackage = dirname(require.resolve('hanzi-writer-data/package.json'))
const writerPackage = dirname(require.resolve('hanzi-writer/package.json'))
const directory = join(project, 'src/data/strokes')
const characters = new Set(catalog.vocabulary.flatMap((word) => [...word.hanzi].filter((char) => /\p{Script=Han}/u.test(char))))
const prepared = await Promise.all([...characters].map(async (character) => {
  let raw: string
  try { raw = await readFile(join(directory, `${character}.json`), 'utf8') }
  catch { raw = await readFile(join(dataPackage, `${character}.json`), 'utf8') }
  const data = JSON.parse(raw)
  if (!Array.isArray(data.strokes) || !data.strokes.length || data.strokes.length !== data.medians?.length) throw new Error(`Invalid stroke data for ${character}.`)
  return { character, raw }
}))
// Validate every required trajectory before writing assets. Keep old assets for
// historical vocabulary; never delete data needed by saved attempts.
await mkdir(directory, { recursive: true })
for (const { character, raw } of prepared) await writeFile(join(directory, `${character}.json`), raw)
const licenses = join(project, 'public/licenses')
await mkdir(licenses, { recursive: true })
await writeFile(join(licenses, 'hanzi-writer-data-LICENSE.txt'), await readFile(join(dataPackage, 'ARPHICPL.TXT')))
await writeFile(join(licenses, 'hanzi-writer-LICENSE.txt'), await readFile(join(writerPackage, 'LICENSE')))
console.log(`Prepared ${characters.size} offline character templates; content IDs and study storage were not changed.`)

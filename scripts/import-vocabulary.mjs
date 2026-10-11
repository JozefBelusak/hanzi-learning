import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const project = fileURLToPath(new URL('../', import.meta.url))
const url = 'https://hearmandarin.com/datasets/hsk-3-0-words.json'
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
const source = await response.json()
if (!Array.isArray(source.words) || source.license !== 'CC BY 4.0') {
  throw new Error('Unexpected dataset format or changed license; inspect the source before importing.')
}
const words = source.words.filter((word) => word.hsk2_level === 1)
if (!words.length || words.some((word) => [word.id, word.simplified, word.pinyin, word.gloss_en].some((field) => typeof field !== 'string' || !field.trim()))) {
  throw new Error('Starter vocabulary is empty or contains incomplete records.')
}
if (new Set(words.map((word) => word.id)).size !== words.length || new Set(words.map((word) => word.simplified)).size !== words.length) {
  throw new Error('Starter vocabulary contains duplicate identifiers or words.')
}
const characters = [...new Set(words.flatMap((word) => [...word.simplified].filter((character) => /\p{Script=Han}/u.test(character))))]
const dataPackage = dirname(require.resolve('hanzi-writer-data/package.json'))
const writerPackage = dirname(require.resolve('hanzi-writer/package.json'))
// Validate every trajectory before changing the checked-in vocabulary snapshot.
const strokes = await Promise.all(characters.map(async (character) => {
  const raw = await readFile(join(dataPackage, `${character}.json`), 'utf8')
  const value = JSON.parse(raw)
  if (!Array.isArray(value.strokes) || !value.strokes.length || value.strokes.length !== value.medians?.length) {
    throw new Error(`Invalid stroke data for ${character}`)
  }
  return [character, raw]
}))
const dataLicense = await readFile(join(dataPackage, 'ARPHICPL.TXT'))
const writerLicense = await readFile(join(writerPackage, 'LICENSE'))
const metadata = Object.fromEntries(['name', 'version', 'generated', 'license', 'license_url', 'attribution', 'homepage', 'source'].map((key) => [key, source[key]]))
const snapshot = { ...metadata, selection: 'HSK 2.0 level 1', words }
const strokeDirectory = join(project, 'src/data/strokes')
const licenseDirectory = join(project, 'public/licenses')
await mkdir(strokeDirectory, { recursive: true })
await mkdir(licenseDirectory, { recursive: true })
for (const [character, raw] of strokes) await writeFile(join(strokeDirectory, `${character}.json`), raw)
await writeFile(join(licenseDirectory, 'hanzi-writer-data-LICENSE.txt'), dataLicense)
await writeFile(join(licenseDirectory, 'hanzi-writer-LICENSE.txt'), writerLicense)
const destination = join(project, 'src/data/vocabulary-hsk1.json')
await writeFile(`${destination}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`)
await rename(`${destination}.tmp`, destination)
console.log(`Imported ${words.length} words and ${characters.length} characters from HearMandarin (${source.version}).`)
console.log('Review the data diff, then run npm test and npm run build before synchronizing Android.')

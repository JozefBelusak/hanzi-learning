import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const project = fileURLToPath(new URL('../', import.meta.url))
const url = 'https://hearmandarin.com/datasets/hsk-3-0-words.json'
const taxonomy = JSON.parse(await readFile(join(project, 'src/data/content/taxonomy.json'), 'utf8'))
const levels = taxonomy.vocabularySelection.hsk2Levels
const localFile = process.argv.indexOf('--file')
if (localFile >= 0 && !process.argv[localFile + 1]) throw new Error('Provide a dataset path after --file.')
let source
if (localFile >= 0) source = JSON.parse(await readFile(process.argv[localFile + 1], 'utf8'))
else {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
  source = await response.json()
}
if (!Array.isArray(source.words) || source.license !== 'CC BY 4.0') {
  throw new Error('Unexpected dataset format or changed license; inspect the source before importing.')
}
const words = source.words.filter((word) => levels.includes(word.hsk2_level))
if (!words.length || words.some((word) => [word.id, word.simplified, word.pinyin, word.gloss_en].some((field) => typeof field !== 'string' || !field.trim()))) {
  throw new Error('Selected vocabulary is empty or contains incomplete records.')
}
// Homographs can have distinct readings/meanings and provider IDs (还 hái/huán).
if (new Set(words.map((word) => word.id)).size !== words.length) {
  throw new Error('Selected vocabulary contains duplicate identifiers.')
}
const previous = JSON.parse(await readFile(join(project, 'src/data/vocabulary-hsk.json'), 'utf8'))
for (const old of previous.words) {
  if (!words.some((word) => word.id === old.id && word.simplified === old.simplified)) throw new Error(`Keep existing vocabulary identity ${old.id}; imports may add words but cannot remove or reassign published identities.`)
}
let taught = new Set()
try {
  const activities = JSON.parse(await readFile(join(project, 'src/data/content/activities.json'), 'utf8'))
  taught = new Set(activities.flatMap((activity) => activity.vocabularyIds))
} catch (error) { if (error.code !== 'ENOENT') throw error }
const legacyIds = { 我: 'wo', 好: 'hao', 水: 'shui' }
const offline = words.filter((word) => word.hsk2_level === 1 || taught.has(legacyIds[word.simplified] ?? `hearmandarin:${word.id}`))
const characters = [...new Set(offline.flatMap((word) => [...word.simplified].filter((character) => /\p{Script=Han}/u.test(character))))]
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
const snapshot = { ...metadata, selection: `HSK 2.0 levels ${levels.join(', ')}`, words }
const strokeDirectory = join(project, 'src/data/strokes')
const licenseDirectory = join(project, 'public/licenses')
await mkdir(strokeDirectory, { recursive: true })
await mkdir(licenseDirectory, { recursive: true })
for (const [character, raw] of strokes) await writeFile(join(strokeDirectory, `${character}.json`), raw)
await writeFile(join(licenseDirectory, 'hanzi-writer-data-LICENSE.txt'), dataLicense)
await writeFile(join(licenseDirectory, 'hanzi-writer-LICENSE.txt'), writerLicense)
const destination = join(project, 'src/data/vocabulary-hsk.json')
await writeFile(`${destination}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`)
await rename(`${destination}.tmp`, destination)
console.log(`Imported ${words.length} words and prepared ${characters.length} curriculum characters from HearMandarin (${source.version}).`)
console.log('Review the data diff, then run npm test and npm run build before synchronizing Android.')

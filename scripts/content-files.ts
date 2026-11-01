import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parseContentCatalog, parseTaxonomy } from '../src/lib/contentValidation.ts'
import { isHskWord, normalizeVocabulary } from '../src/lib/contentVocabulary.ts'

export const project = fileURLToPath(new URL('../', import.meta.url))
async function json(path: string) { return JSON.parse(await readFile(join(project, path), 'utf8')) }
export async function readCatalog() {
  const [manifest, rawTaxonomy, activities, grammarTopics, sentences, extra, source] = await Promise.all([
    'src/data/content/manifest.json', 'src/data/content/taxonomy.json', 'src/data/content/activities.json',
    'src/data/content/grammar.json', 'src/data/content/sentences.json', 'src/data/content/vocabulary-extra.json', 'src/data/vocabulary-hsk.json',
  ].map(json))
  const taxonomy = parseTaxonomy(rawTaxonomy)
  if (!Array.isArray(source.words) || source.words.some((word: Record<string, unknown>) => taxonomy.vocabularySelection.hsk2Levels.includes(Number(word.hsk2_level)) && !isHskWord(word))) throw new Error('The selected vocabulary contains incomplete records.')
  const catalog = parseContentCatalog({ ...manifest, taxonomy, activities, grammarTopics, sentences, vocabulary: [...normalizeVocabulary(source, taxonomy), ...extra] })
  const original = await json('tests/fixtures/content-v1.json')
  for (const old of original.vocabulary) {
    if (!catalog.vocabulary.some((word) => word.id === old.id && word.hanzi === old.hanzi)) throw new Error(`Existing vocabulary identity ${old.id} cannot be removed or reassigned.`)
  }
  for (const old of original.activities) {
    const activity = catalog.activities.find((activity) => activity.id === old.id && activity.revision === 1)
    if (!activity || !isDeepStrictEqual(activity.questions, old.questions)) throw new Error(`Keep the published revision 1 answer contract for ${old.id}; append a new revision instead.`)
  }
  return catalog
}

// Bundle the original beginner characters and all vocabulary explicitly taught
// in the authored curriculum. The rest uses the existing on-demand loader.
export function offlineCharacters(catalog: Awaited<ReturnType<typeof readCatalog>>) {
  const taught = new Set(catalog.activities.flatMap((activity) => activity.vocabularyIds))
  return new Set(catalog.vocabulary.filter((word) => word.level === 1 || taught.has(word.id)).flatMap((word) => [...word.hanzi].filter((character) => /\p{Script=Han}/u.test(character))))
}

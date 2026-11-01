import { readCatalog, offlineCharacters } from './content-files.ts'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { project } from './content-files.ts'

const catalog = await readCatalog()
for (const character of offlineCharacters(catalog)) {
  let stroke
  try { stroke = JSON.parse(await readFile(join(project, 'src/data/strokes', `${character}.json`), 'utf8')) }
  catch { throw new Error(`Missing stroke data for ${character}. Run npm run content:prepare before building.`) }
  if (!Array.isArray(stroke.strokes) || !stroke.strokes.length || stroke.strokes.length !== stroke.medians?.length) throw new Error(`Invalid stroke data for ${character}.`)
}
console.log(`Content valid: ${catalog.activities.length} activity revisions, ${catalog.grammarTopics.length} grammar topics, ${catalog.vocabulary.length} words, ${catalog.sentences.length} sentence exercises.`)

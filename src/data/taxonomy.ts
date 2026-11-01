import raw from './content/taxonomy.json' with { type: 'json' }
import { parseTaxonomy } from '../lib/contentValidation'

export const taxonomy = parseTaxonomy(raw)
export const languageLevels = taxonomy.languageLevels
export const difficulties = taxonomy.difficulties
export const levelLabel = (id: string) => languageLevels.find((level) => level.id === id)?.label ?? id
export const difficultyLabel = (id: string) => difficulties.find((difficulty) => difficulty.id === id)?.label ?? id

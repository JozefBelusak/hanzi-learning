import { difficulties, languageLevels } from '../data/taxonomy'
import type { ContentFilter } from '../lib/contentFilter'
export default function ContentFilters({ id, value, onChange }: { id: string; value: ContentFilter; onChange: (filter: ContentFilter) => void }) {
  return <div className="content-filters" role="group" aria-label="Content level and difficulty">
    <div><label htmlFor={`${id}-level`}>Language level</label><select id={`${id}-level`} value={value.languageLevel} onChange={(event) => onChange({ ...value, languageLevel: event.target.value as ContentFilter['languageLevel'] })}><option value="all">All levels</option>{languageLevels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}</select></div>
    <div><label htmlFor={`${id}-difficulty`}>Difficulty</label><select id={`${id}-difficulty`} value={value.difficulty} onChange={(event) => onChange({ ...value, difficulty: event.target.value as ContentFilter['difficulty'] })}><option value="all">All difficulties</option>{difficulties.map((difficulty) => <option key={difficulty.id} value={difficulty.id}>{difficulty.label}</option>)}</select></div>
  </div>
}

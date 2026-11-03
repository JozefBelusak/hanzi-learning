import { difficulties, languageLevels } from '../data/taxonomy'
import { allContent, type ContentFilter } from '../lib/contentFilter'
import './ContentFilters.css'
type FilterProps = { value: ContentFilter; onChange: (filter: ContentFilter) => void; profileFilter?: ContentFilter }
export function ContentFilterActions({ value, onChange, profileFilter }: FilterProps) {
  if (!profileFilter) return null
  return <div className="content-filter-actions">
    <button type="button" className="text-btn" disabled={value.languageLevel === 'all' && value.difficulty === 'all'} onClick={() => onChange(allContent)}>Clear filters</button>
    <button type="button" className="text-btn" disabled={value.languageLevel === profileFilter.languageLevel && value.difficulty === profileFilter.difficulty} onClick={() => onChange(profileFilter)}>Use profile preferences</button>
  </div>
}
export default function ContentFilters({ id, value, onChange, showLevel = true, showDifficulty = true, profileFilter }: FilterProps & { id: string; showLevel?: boolean; showDifficulty?: boolean }) {
  return <div className="content-filters" role="group" aria-label="Content level and difficulty">
    {showLevel && <fieldset className="filter-group filter-levels">
      <legend>Language level</legend>
      <div className="filter-options">
        <label className="filter-option filter-all">
          <input type="radio" name={`${id}-level`} value="all" checked={value.languageLevel === 'all'} onChange={() => onChange({ ...value, languageLevel: 'all' })} />
          <span>All levels</span>
        </label>
        {languageLevels.map((level, index) => <label className="filter-option" key={level.id} title={level.description}>
          <input type="radio" name={`${id}-level`} value={level.id} checked={value.languageLevel === level.id} onChange={() => onChange({ ...value, languageLevel: level.id })} />
          <span className="filter-step" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{level.label}</span>
        </label>)}
      </div>
    </fieldset>}
    {showDifficulty && <fieldset className="filter-group filter-difficulties">
      <legend>Difficulty</legend>
      <div className="filter-options">
        <label className="filter-option filter-all">
          <input type="radio" name={`${id}-difficulty`} value="all" checked={value.difficulty === 'all'} onChange={() => onChange({ ...value, difficulty: 'all' })} />
          <span>All difficulties</span>
        </label>
        {difficulties.map((difficulty, index) => <label className="filter-option" key={difficulty.id} title={difficulty.description}>
          <input type="radio" name={`${id}-difficulty`} value={difficulty.id} checked={value.difficulty === difficulty.id} onChange={() => onChange({ ...value, difficulty: difficulty.id })} />
          <span className="filter-intensity" aria-hidden="true">{[0, 1, 2].map((bar) => <i key={bar} className={bar <= index ? 'is-filled' : undefined} />)}</span><span>{difficulty.label}</span>
        </label>)}
      </div>
    </fieldset>}
    <ContentFilterActions value={value} onChange={onChange} profileFilter={profileFilter} />
  </div>
}

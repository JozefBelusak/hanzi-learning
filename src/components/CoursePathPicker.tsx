import { coursePaths } from '../data/coursePaths'
import { levelLabel } from '../data/taxonomy'
import { activityStatus } from '../lib/learning'
import type { LanguageLevel } from '../types/content'
import type { LearningActivity, LearningSession } from '../types/learning'

export default function CoursePathPicker({ value, lessons, sessions, onChange }: {
  value: LanguageLevel | 'all'; lessons: LearningActivity[]; sessions: LearningSession[]; onChange: (level: LanguageLevel | 'all') => void
}) {
  return <fieldset className={`course-path-picker${value === 'all' ? '' : ' is-compact'}`}><legend>{value === 'all' ? 'Choose your learning path' : 'Learning path'}</legend>
    <div className="course-path-selection">
    <div className="course-path-controls"><label className="filter-option"><input type="radio" name="course-path" aria-label="All paths" value="all" checked={value === 'all'} onChange={() => onChange('all')} /><span>All paths</span></label>{value === 'all' && <span>Choose a level to view its route.</span>}</div>
    <div className="course-path-grid">
    {coursePaths.map((path) => {
      const stops = lessons.filter((lesson) => lesson.languageLevel === path.level)
      const complete = stops.filter((lesson) => activityStatus(lesson, sessions) === 'completed').length
      return <label key={path.level} className="course-path-card">
        <input className="course-path-input" type="radio" name="course-path" aria-label={levelLabel(path.level)} value={path.level} checked={value === path.level} onChange={() => onChange(path.level)} />
        <span className="course-path-top"><span lang="zh-CN" aria-hidden="true">{path.symbol}</span><span>{levelLabel(path.level)}</span><span className="course-path-check" aria-hidden="true">{value === path.level ? '✓' : ''}</span></span>
        {value === 'all' && <><strong>{path.title}</strong><span className="course-path-description">{path.description}</span>
        <span className="course-path-progress">{complete} / {stops.length} stops completed</span></>}
      </label>
    })}
  </div></div>{value === 'all' && <p>Paths start independently. Choose your starting point; levels describe the app content, not a placement-test result.</p>}</fieldset>
}

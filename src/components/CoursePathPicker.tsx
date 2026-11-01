import { coursePaths } from '../data/coursePaths'
import { levelLabel } from '../data/taxonomy'
import { activityStatus } from '../lib/learning'
import type { LanguageLevel } from '../types/content'
import type { LearningActivity, LearningSession } from '../types/learning'

export default function CoursePathPicker({ value, lessons, sessions, onChange }: {
  value: LanguageLevel; lessons: LearningActivity[]; sessions: LearningSession[]; onChange: (level: LanguageLevel) => void
}) {
  return <fieldset className="course-path-picker"><legend>Choose your learning path</legend><div className="course-path-grid">
    {coursePaths.map((path) => {
      const stops = lessons.filter((lesson) => lesson.languageLevel === path.level)
      const complete = stops.filter((lesson) => activityStatus(lesson, sessions) === 'completed').length
      return <label key={path.level} className="course-path-card">
        <input className="course-path-input" type="radio" name="course-path" aria-label={levelLabel(path.level)} value={path.level} checked={value === path.level} onChange={() => onChange(path.level)} />
        <span className="course-path-top"><span lang="zh-CN" aria-hidden="true">{path.symbol}</span><span>{levelLabel(path.level)}</span><span className="course-path-check" aria-hidden="true">{value === path.level ? '✓' : ''}</span></span>
        <strong>{path.title}</strong><span className="course-path-description">{path.description}</span>
        <span className="course-path-progress">{complete} / {stops.length} stops completed</span>
      </label>
    })}
  </div><p>Paths start independently. Choose your starting point; levels describe the app content, not a placement-test result.</p></fieldset>
}

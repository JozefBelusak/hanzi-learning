import type { UserProfile } from '../types/auth'
import type { PracticeMode } from '../types/study'
import { difficulties, languageLevels, learningGoals, practicePreferences } from '../lib/profile'
import './LearningProfile.css'

export default function LearningPlan({ profile, onEdit, onPractice }: { profile: UserProfile; onEdit: () => void; onPractice?: (mode: PracticeMode) => void }) {
  return <section className="card-surface learning-plan" aria-label="Your learning plan">
    <div className="goal-heading"><h2>Your learning plan</h2><button className="text-btn" type="button" onClick={onEdit}>Edit profile</button></div>
    <p>{languageLevels.find(({ id }) => id === profile.language_level)?.label} · {difficulties.find(({ id }) => id === profile.difficulty)?.label} difficulty · {profile.daily_goal} attempts a day</p>
    <p>Learning for: {profile.learning_goals.map((goal) => learningGoals.find(({ id }) => id === goal)?.label).join(', ')}.</p>
    {onPractice && <div className="action-row" aria-label="Your preferred practice">{practicePreferences.filter(({ id }) => profile.preferred_modes.includes(id)).map((mode) => <button type="button" className="secondary-btn" key={mode.id} onClick={() => onPractice(mode.id)}>Practise {mode.label.toLowerCase()}</button>)}</div>}
  </section>
}

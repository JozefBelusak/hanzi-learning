import type { UserProfile } from '../types/auth'
import { difficulties, languageLevels, learningGoals } from '../lib/profile'
import './LearningProfile.css'
import { routePace } from '../lib/routePace'

export default function LearningPlan({ profile, onEdit }: { profile: UserProfile; onEdit: () => void }) {
  return <section className="card-surface learning-plan" aria-label="Your learning plan">
    <div className="goal-heading"><h2>Your learning plan</h2><button className="text-btn" type="button" onClick={onEdit}>Edit profile</button></div>
    <p>{languageLevels.find(({ id }) => id === profile.language_level)?.label} · {difficulties.find(({ id }) => id === profile.difficulty)?.label} difficulty · {routePace(profile.daily_goal).label}</p>
    <p>Learning for: {profile.learning_goals.map((goal) => learningGoals.find(({ id }) => id === goal)?.label).join(', ')}.</p>
  </section>
}

import { getActiveCatalog, activities } from '../data/catalog'
import { categoryTitle } from '../data/categories'
import { difficultyLabel, levelLabel } from '../data/taxonomy'
import { learningGoals } from '../lib/profile'
import { learningRecommendations } from '../lib/recommendations'
import type { UserProfile } from '../types/auth'
import type { Card, CategoryId } from '../types/study'
import './GoalRecommendations.css'

function reason(goals: string[]) {
  return goals.length ? `For ${goals.map((goal) => learningGoals.find((item) => item.id === goal)!.label.toLowerCase()).join(', ')}` : 'At your language level'
}

export default function GoalRecommendations({ profile, cards, onExercise, onVocabulary, onBrowse }: {
  profile: UserProfile; cards: Card[]; onExercise: (id: string) => void; onVocabulary: (category: CategoryId) => void; onBrowse: () => void
}) {
  const recommended = learningRecommendations(profile, { activities, grammarTopics: getActiveCatalog().grammarTopics, vocabulary: cards })
  return <section className="goal-recommendations" aria-label="Recommendations for your goals">
    <div className="goal-heading"><h2>For your goals</h2><button type="button" className="text-btn" onClick={onBrowse}>Browse exercises</button></div>
    <p>{levelLabel(profile.language_level ?? 'beginner')} · {difficultyLabel(profile.difficulty ?? 'balanced')} activities</p>
    <div className="goal-recommendation-grid">
      <section className="card-surface" aria-label="Recommended grammar"><h3>Grammar</h3>
        {recommended.grammar.map(({ item, goals }) => <details key={item.id}><summary>{item.title}</summary><small>{reason(goals)}</small><p>{item.explanation}</p>{item.examples.map((example, index) => <p key={index}><strong lang="zh-CN">{example.hanzi}</strong><br />{example.pinyin}<br />{example.meaning}</p>)}</details>)}
        {!recommended.grammar.length && <p>No grammar topics match your preferences yet. Try another difficulty in your profile or explore lesson notes.</p>}
      </section>
      <section className="card-surface" aria-label="Recommended vocabulary"><h3>Vocabulary</h3>
        {recommended.vocabulary.map(({ item, goals }) => <article key={item.id}><strong lang="zh-CN">{item.hanzi}</strong><span>{item.pinyin}</span><p>{item.meaning}</p><small>{reason(goals)}</small><button type="button" className="text-btn" onClick={() => onVocabulary(item.categoryId)}>Practise {categoryTitle(item.categoryId).toLowerCase()}</button></article>)}
        {!recommended.vocabulary.length && <p>No words are available at this level yet.</p>}
      </section>
      <section className="card-surface" aria-label="Recommended exercises"><h3>Exercises</h3>
        {recommended.exercises.map(({ item, goals }) => <article key={item.id}><h4>{item.title}</h4><small>{reason(goals)}</small><p>{item.description}</p><button type="button" className="secondary-btn" onClick={() => onExercise(item.id)}>Open exercise</button></article>)}
        {!recommended.exercises.length && <p>No exercises match your preferences yet. Browse exercises to change or clear the filters.</p>}
      </section>
    </div>
  </section>
}

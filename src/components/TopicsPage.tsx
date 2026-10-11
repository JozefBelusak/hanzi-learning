import { categories } from '../data/categories'
import type { CategoryId } from '../types/study'

type Props = { onSelect: (category: CategoryId) => void; onBack: () => void }

export default function TopicsPage({ onSelect, onBack }: Props) {
  return (
    <main className="topics-page">
      <button className="back-button" type="button" onClick={onBack}>Back</button>
      <h1>Choose a topic</h1>
      <div className="category-list" aria-label="Vocabulary topics">
        {categories.map((category) => (
          <button className="category-card" type="button" key={category.id} onClick={() => onSelect(category.id)}>
            <span className="category-symbol" lang="zh-CN" aria-hidden="true">{category.symbol}</span>
            <span className="category-text"><strong>{category.title}</strong><span>{category.description}</span></span>
          </button>
        ))}
      </div>
    </main>
  )
}

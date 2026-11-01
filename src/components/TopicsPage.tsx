import { categories } from '../data/categories'
import type { Card, CategoryId } from '../types/study'
import type { LanguageLevel } from '../types/content'
import { levelLabel } from '../data/taxonomy'
import ContentFilters from './ContentFilters'

type Props = { onSelect: (category: CategoryId) => void; onBack: () => void; cards: Card[]; level: LanguageLevel | 'all'; onLevelChange: (level: LanguageLevel | 'all') => void }

export default function TopicsPage({ onSelect, onBack, cards, level, onLevelChange }: Props) {
  const available = cards.filter((card) => level === 'all' || card.languageLevel === level)
  return (
    <main className="topics-page">
      <button className="back-button" type="button" onClick={onBack}>Back</button>
      <h1>Choose a topic</h1>
      <ContentFilters id="vocabulary" value={{ languageLevel: level, difficulty: 'all' }} onChange={(filter) => onLevelChange(filter.languageLevel)} showDifficulty={false} />
      <p role="status">{available.length.toLocaleString('en-GB')} words · {level === 'all' ? 'All levels' : levelLabel(level)}</p>
      <div className="category-list" aria-label="Vocabulary topics">
        {categories.map((category) => (
          <button className="category-card" type="button" key={category.id} disabled={!available.some((card) => category.id === 'all' || card.categoryId === category.id)} onClick={() => onSelect(category.id)}>
            <span className="category-symbol" lang="zh-CN" aria-hidden="true">{category.symbol}</span>
            <span className="category-text"><strong>{category.title}</strong><span>{category.description}</span><span>{available.filter((card) => category.id === 'all' || card.categoryId === category.id).length.toLocaleString('en-GB')} words</span></span>
          </button>
        ))}
      </div>
    </main>
  )
}

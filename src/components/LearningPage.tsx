import { categoryTitle } from '../data/categories'
import type { Card, CategoryId, PracticeMode } from '../types/study'

type Props = { cards: Card[]; category: CategoryId; onSelectMode: (mode: PracticeMode) => void; onBack: () => void; disabled: boolean }

const modes: { id: PracticeMode; title: string; description: string; symbol: string }[] = [
  { id: 'flashcards', title: 'Flashcards', description: 'Recall the meaning or Chinese spelling of a word.', symbol: '词' },
  { id: 'speech', title: 'Speaking', description: 'Listen to a word and say it aloud.', symbol: '说' },
  { id: 'writing', title: 'Writing', description: 'Trace a character or write it from memory.', symbol: '写' },
  { id: 'sentences', title: 'Sentence building', description: 'Explore Chinese word order with shared examples.', symbol: '句' },
]

export default function LearningPage({ cards, category, onSelectMode, onBack, disabled }: Props) {
  return (
    <main className="learning-page">
      <button className="back-button" type="button" onClick={onBack}>Back</button>
      <div className="topic-heading"><h1>{categoryTitle(category)}</h1><button className="text-btn" type="button" onClick={onBack}>Change topic</button></div>
      <h2 className="mode-heading">What would you like to practise?</h2>
      <div className="mode-list" aria-label="Practice modes">
        {modes.map((mode) => (
          <button className="mode-card" type="button" key={mode.id} disabled={disabled || (!cards.length && mode.id !== 'sentences')} onClick={() => onSelectMode(mode.id)}>
            <span className="mode-symbol" lang="zh-CN" aria-hidden="true">{mode.symbol}</span>
            <span><strong>{mode.title}</strong><span>{mode.description}</span></span>
          </button>
        ))}
      </div>
      <details className="vocabulary-preview">
        <summary>Preview words in this topic</summary>
        <div className="word-preview-list">
          {cards.slice(0, 6).map((card) => (
            <div key={card.id}><strong lang="zh-CN">{card.hanzi}</strong><span className="preview-pinyin">{card.pinyin}</span><span>{card.meaning}</span></div>
          ))}
        </div>
      </details>
    </main>
  )
}

import { taxonomy } from './taxonomy'
import { wordCategory } from '../lib/contentVocabulary'
import type { Card, CategoryId, WordCategoryId } from '../types/study'

export const categories = taxonomy.categories
export function categorizeWord(hanzi: string): WordCategoryId { return wordCategory(hanzi, taxonomy) }
export function filterCards(cards: Card[], category: CategoryId): Card[] {
  return category === 'all' ? cards : cards.filter((card) => card.categoryId === category)
}
export function categoryTitle(id: CategoryId): string { return categories.find((category) => category.id === id)?.title ?? 'All words' }

// Original three-card deck retained with the same progress identifiers.
import { contentRepository } from './catalog'
import type { Card } from '../types/study'
export const cards: Card[] = ['wo', 'hao', 'shui'].map((id) => contentRepository.getVocabulary(id)!)

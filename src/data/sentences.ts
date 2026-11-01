import { catalog, contentRepository } from './catalog'
import type { SentenceExercise } from '../types/content'
export type { SentenceExercise, SentenceGrammarPart } from '../types/content'

export const sentences: SentenceExercise[] = catalog.sentences.map((sentence) => {
  const grammar = contentRepository.getGrammarTopic(sentence.grammarTopicId)!
  return { ...sentence, grammarTitle: grammar.title, grammarNote: grammar.explanation }
})

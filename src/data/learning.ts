// Compatibility entry point: author content in data/content/*.json.
import { contentRepository } from './catalog'
export const activities = contentRepository.activities
export const lessons = contentRepository.lessons
export const exercises = contentRepository.exercises
export const getActivity = contentRepository.getActivity
export const getGrammarTopic = contentRepository.getGrammarTopic

import type { UserProfile } from '../types/auth'
import type { GrammarTopic, LearningActivity, VocabularyEntry, WordCategoryId } from '../types/content'
import type { LearningGoal } from './profile'
import { matchesContent, profileContentFilter } from './contentFilter'

type RecommendationProfile = Pick<UserProfile, 'language_level' | 'difficulty' | 'learning_goals'>
export type Recommendation<T> = { item: T; goals: LearningGoal[] }
type Candidates = { activities: LearningActivity[]; grammarTopics: GrammarTopic[]; vocabulary: VocabularyEntry[] }

// Transparent editorial rules over the existing catalog, not inferred proficiency.
// New content participates through its text, category and existing references.
const goalRules: Record<LearningGoal, { terms: RegExp; categories: WordCategoryId[] }> = {
  conversation: { terms: /\b(greet\w*|hello|friend\w*|family|name|introduc\w*|conversation\w*|question\w*|polite|request\w*|talk\w*|discuss\w*)\b/i, categories: ['people', 'food'] },
  travel: { terms: /\b(travel\w*|journey\w*|transport\w*|train\w*|station\w*|airport\w*|hotel\w*|direction\w*|route\w*|city|cities|restaurant\w*|café|cafe|ticket\w*|trip\w*)\b/i, categories: ['places', 'food', 'time', 'numbers'] },
  work: { terms: /\b(work\w*|office\w*|business\w*|meeting\w*|colleague\w*|customer\w*|project\w*|decision\w*|proposal\w*|report\w*|manager\w*|employee\w*|deadline\w*)\b/i, categories: ['actions', 'objects'] },
  study: { terms: /\b(study|studies|studying|school\w*|student\w*|teacher\w*|exam\w*|book\w*|read\w*|learn\w*|universit\w*|library|research\w*|explain\w*|argument\w*)\b/i, categories: ['objects', 'numbers'] },
  culture: { terms: /\b(china|chinese|culture\w*|tradition\w*|festival\w*|histor\w*|music\w*|art|arts|calligraphy|tea|food|cuisine\w*|story|stories|custom\w*)\b/i, categories: ['food', 'other'] },
}

function goalScores(text: string, category: WordCategoryId | 'all' | undefined, goals: LearningGoal[]): number[] {
  return goals.map((goal) => (goalRules[goal].terms.test(text) ? 8 : 0) + (category && category !== 'all' && goalRules[goal].categories.includes(category) ? 2 : 0))
}
function activityText(activity: LearningActivity): string {
  return [activity.title, activity.description, ...activity.objectives, ...activity.explanation, ...activity.examples.map((example) => example.meaning)].join(' ')
}
function ranked<T>(items: T[], score: (item: T) => number[], goals: LearningGoal[], limit: number): Recommendation<T>[] {
  return items.map((item, index) => ({ item, index, scores: score(item) }))
    .sort((a, b) => b.scores.reduce((sum, value) => sum + value, 0) - a.scores.reduce((sum, value) => sum + value, 0) || a.index - b.index)
    .slice(0, limit).map(({ item, scores }) => ({ item, goals: goals.filter((_, index) => scores[index] > 0) }))
}

export function learningRecommendations(profile: RecommendationProfile, candidates: Candidates, limit = 3) {
  const filter = profileContentFilter(profile)
  const goals = [...new Set(profile.learning_goals)]
  const activities = candidates.activities.filter((activity) => activity.publication === 'published' && activity.languageLevel === filter.languageLevel)
  const scores = new Map(activities.map((activity) => [activity.id, goalScores(activityText(activity), activity.category, goals)]))
  const grammar = candidates.grammarTopics.filter((topic) => !topic.archived && matchesContent(topic, filter))
  // Source words have no pedagogically assessed difficulty (their imported value
  // is balanced). Recommend vocabulary by language level and goals, never silently
  // relabel dictionary entries to the user's preferred difficulty.
  const vocabulary = candidates.vocabulary.filter((word) => !word.archived && word.languageLevel === filter.languageLevel)
  const exercises = activities.filter((activity) => activity.kind === 'exercise' && matchesContent(activity, filter))
  return {
    grammar: ranked(grammar, (topic) => {
      const direct = goalScores([topic.title, topic.explanation, ...topic.examples.map((example) => example.meaning)].join(' '), undefined, goals)
      const related = activities.filter((activity) => activity.grammarTopicIds.includes(topic.id))
      return direct.map((score, index) => score + Math.max(0, ...related.map((activity) => scores.get(activity.id)![index])))
    }, goals, limit),
    vocabulary: ranked(vocabulary, (word) => goalScores(word.meaning, word.categoryId, goals), goals, limit),
    exercises: ranked(exercises, (activity) => scores.get(activity.id)!, goals, limit),
  }
}

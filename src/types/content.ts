// Shared educational metadata. Platform content and lecturer lessons have
// distinct ownership/publication rules; sharing a level does not share ownership.
export const languageLevelIds = ['beginner', 'elementary', 'intermediate', 'advanced'] as const
export const difficultyIds = ['gentle', 'balanced', 'challenging'] as const
export type LanguageLevel = typeof languageLevelIds[number]
export type Difficulty = typeof difficultyIds[number]
export type WordCategoryId = 'people' | 'food' | 'numbers' | 'time' | 'places' | 'actions' | 'objects' | 'other'
export type CategoryId = 'all' | WordCategoryId
export type EducationalMetadata = { languageLevel: LanguageLevel; difficulty: Difficulty }
export type ChineseExample = { hanzi: string; pinyin: string; meaning: string }
export type ContentSource = { id: string; name: string; url: string; license: string; attribution: string }
export type ContentTaxonomy = {
  languageLevels: { id: LanguageLevel; label: string; description: string }[]
  difficulties: { id: Difficulty; label: string; description: string }[]
  categories: { id: CategoryId; title: string; description: string; symbol: string; words?: string[] }[]
  courseLines: { id: string; title: string; color: string; symbol: string }[]
  sources: ContentSource[]
  vocabularySelection: { hsk2Levels: number[]; levelMapping: Record<string, LanguageLevel> }
}
export type VocabularyEntry = EducationalMetadata & ChineseExample & {
  archived?: boolean
  id: string
  categoryId: WordCategoryId
  // Compatibility field: HSK 2.0 level, not an app proficiency/points level.
  level: number | null
  sourceId: string
  sourceEntryId?: string
  traditional?: string
  partOfSpeech?: string
}
export type GrammarTopic = EducationalMetadata & {
  archived?: boolean
  vocabularyIds?: string[]
  id: string; title: string; explanation: string; examples: ChineseExample[]; prerequisites: string[]
}
type QuestionBase = { id: string; prompt: string; explanation: string; hint?: string; audioText?: string }
export type LearningQuestion = QuestionBase & (
  | { type: 'choice'; options: { id: string; text: string; pinyin?: string }[]; answer: string }
  | { type: 'order'; tokens: string[]; acceptedOrders: string[][] }
)
export type PlatformActivity = EducationalMetadata & {
  id: string; revision: number; source: 'platform'; publication: 'published' | 'archived'
  kind: 'lesson' | 'exercise'; title: string; description: string; minutes: number; category: CategoryId
  objectives: string[]; explanation: string[]; examples: ChineseExample[]; questions: LearningQuestion[]
  prerequisites: string[]; grammarTopicIds: string[]; vocabularyIds: string[]
  features: ('tone-guide')[]
  line: string; position: { x: number; y: number }
  fact?: { title: string; text: string; sourceUrl: string; sourceLabel: string }
}
// Existing presentation API. Practice words are derived from vocabulary IDs.
export type LearningActivity = PlatformActivity & { practiceWords: string[] }
export type PlatformLesson = PlatformActivity & { kind: 'lesson' }
export type PlatformExercise = PlatformActivity & { kind: 'exercise' }
export type SentenceGrammarPart = { label: string; text: string }
export type SentenceContent = EducationalMetadata & {
  archived?: boolean
  id: string; meaning: string; pinyin: string; tokens: string[]; punctuation: '。' | '？'
  acceptedOrders?: string[][]; grammarTopicId: string; grammarParts: SentenceGrammarPart[]
}
export type SentenceExercise = SentenceContent & { grammarTitle: string; grammarNote: string }
export type ContentCatalog = {
  schemaVersion: 1; id: 'hanzi-platform'; taxonomy: ContentTaxonomy
  activities: PlatformActivity[]; grammarTopics: GrammarTopic[]; vocabulary: VocabularyEntry[]; sentences: SentenceContent[]
}
// Lecturer-authored reading material, stored separately in Supabase. It does
// not acquire platform prerequisites, answer keys or course completion rights.
export type LecturerLesson = EducationalMetadata & {
  id: string; source: 'lecturer'; author_id: string; title: string; summary: string; content: string
  published: boolean; created_at: string; updated_at: string
}

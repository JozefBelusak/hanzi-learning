import type { LecturerLessonBlock, LecturerLessonDocument, LearningQuestion, VocabularyEntry } from '../types/content'
import { parseLearningQuestion } from './contentValidation'
import { newQuestion } from './contentMutation'

export const lessonBlockTypes = [
  { type: 'explanation', label: 'Explanation', symbol: '文', description: 'Introduce an idea or explain grammar.' },
  { type: 'example', label: 'Chinese example', symbol: '例', description: 'Characters, pinyin, translation and audio.' },
  { type: 'vocabulary', label: 'Vocabulary', symbol: '词', description: 'Choose words from the platform catalog.' },
  { type: 'exercise', label: 'Interactive exercise', symbol: '练', description: 'Multiple choice or sentence building.' },
  { type: 'practice', label: 'Practice', symbol: '写', description: 'Speaking, pronunciation and character writing.' },
] as const

export function newLessonBlock(type: LecturerLessonBlock['type']): LecturerLessonBlock {
  const id = `block-${crypto.randomUUID()}`
  switch (type) {
    case 'explanation': return { id, type, heading: '', text: '', grammar: '' }
    case 'example': return { id, type, example: { hanzi: '', pinyin: '', meaning: '' }, translationLanguage: 'sk' }
    case 'vocabulary': return { id, type, vocabularyIds: [] }
    case 'exercise': return { id, type, questions: [newQuestion()] }
    case 'practice': return { id, type, vocabularyIds: [], modes: ['speech', 'writing'] }
  }
}
export function documentForLesson(lesson: { blocks?: LecturerLessonDocument | null; content: string }): LecturerLessonDocument {
  return lesson.blocks ? structuredClone(lesson.blocks) : { schemaVersion: 1, blocks: [{ ...newLessonBlock('explanation') as Extract<LecturerLessonBlock, { type: 'explanation' }>, text: lesson.content }] }
}
export function moveLessonBlock(document: LecturerLessonDocument, id: string, direction: -1 | 1): LecturerLessonDocument {
  const blocks = [...document.blocks]
  const index = blocks.findIndex((block) => block.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= blocks.length) return document
  ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
  return { ...document, blocks }
}

type Row = Record<string, unknown>
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
function object(value: unknown, name: string): Row { assert(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object.`); return value as Row }
function text(value: unknown, max: number, name: string, required = false) { assert(typeof value === 'string' && [...value].length <= max && (!required || value.trim()), `${name}${required ? ' is required and' : ''} must be text within ${max} characters.`) }
function identifier(value: unknown, name: string) { assert(typeof value === 'string' && /^[a-z0-9][a-z0-9:_-]{0,159}$/.test(value), `${name} needs a valid identifier.`) }
function strings(value: unknown, max: number, name: string, required = false): string[] {
  assert(Array.isArray(value) && value.length <= max && (!required || value.length), `${name} needs ${required ? '1' : '0'}–${max} entries.`)
  value.forEach((item) => text(item, 1000, name, required))
  return value as string[]
}
function question(value: unknown, published: boolean) {
  const q = object(value, 'Question')
  identifier(q.id, 'Question')
  for (const field of ['prompt', 'explanation']) text(q[field], 4000, `Question ${field}`, published)
  for (const field of ['hint', 'audioText']) if (q[field] !== undefined) text(q[field], 2000, `Question ${field}`)
  if (q.type === 'choice') {
    assert(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 10, 'Choice questions need 2–10 options.')
    const ids = q.options.map((value) => {
      const option = object(value, 'Option'); identifier(option.id, 'Option'); text(option.text, 2000, 'Option text', published)
      if (option.pinyin !== undefined) text(option.pinyin, 1000, 'Option pinyin')
      return option.id
    })
    assert(new Set(ids).size === ids.length && typeof q.answer === 'string' && ids.includes(q.answer), 'Choose an existing answer; option identifiers must be unique.')
  } else {
    assert(q.type === 'order', 'Supported exercises are choice and order.')
    strings(q.tokens, 50, 'Sentence tokens', published)
    assert(Array.isArray(q.acceptedOrders) && q.acceptedOrders.length >= 1 && q.acceptedOrders.length <= 10, 'Add 1–10 accepted sentence orders.')
    q.acceptedOrders.forEach((order) => strings(order, 50, 'Accepted order', published))
  }
  if (published) parseLearningQuestion(cleanQuestion(q as unknown as LearningQuestion))
}
function cleanQuestion(q: LearningQuestion): LearningQuestion {
  const cleaned = { ...q }
  if (!cleaned.hint?.trim()) delete cleaned.hint
  if (!cleaned.audioText?.trim()) delete cleaned.audioText
  return cleaned.type === 'choice' ? { ...cleaned, options: cleaned.options.map((option) => option.pinyin?.trim() ? option : { id: option.id, text: option.text }) } : cleaned
}

// Read shape validation also permits unfinished drafts and retired catalog links.
// Save/publish validation additionally resolves the current catalog references.
export function parseLessonDocument(value: unknown, published = false, vocabulary?: VocabularyEntry[]): LecturerLessonDocument {
  const doc = object(value, 'Lesson document')
  assert(doc.schemaVersion === 1, 'Unsupported lesson block version.')
  assert(Array.isArray(doc.blocks) && doc.blocks.length <= 40 && (!published || doc.blocks.length > 0), 'A lesson needs up to 40 blocks; add at least one before publishing.')
  assert(new TextEncoder().encode(JSON.stringify(value)).length <= 200000, 'Lesson blocks exceed the 200 KB limit.')
  const ids = new Set<string>()
  const words = vocabulary && new Map(vocabulary.map((word) => [word.id, word]))
  doc.blocks.forEach((value, index) => {
    const block = object(value, `Block ${index + 1}`)
    identifier(block.id, `Block ${index + 1}`)
    assert(!ids.has(block.id as string), 'Block identifiers must be unique.'); ids.add(block.id as string)
    try {
      if (block.type === 'explanation') {
        text(block.heading, 200, 'Heading'); text(block.text, 50000, 'Explanation text', published); text(block.grammar, 10000, 'Grammar explanation')
      } else if (block.type === 'example') {
        const example = object(block.example, 'Chinese example')
        for (const field of ['hanzi', 'pinyin', 'meaning']) text(example[field], 2000, `Example ${field}`, published)
        assert(block.translationLanguage === 'sk' || block.translationLanguage === 'en', 'Choose Slovak or English for the translation.')
      } else if (block.type === 'vocabulary' || block.type === 'practice') {
        const references = strings(block.vocabularyIds, 50, 'Vocabulary selection', published)
        references.forEach((id) => { identifier(id, 'Vocabulary reference'); if (words) assert(words.has(id) && (!published || !words.get(id)!.archived), `Word ${id} is missing or archived. Replace it before publishing.`) })
        assert(new Set(references).size === references.length, 'Vocabulary references must be unique.')
        if (block.type === 'practice') {
          const modes = strings(block.modes, 2, 'Practice modes', published)
          assert(new Set(modes).size === modes.length && modes.every((mode) => mode === 'speech' || mode === 'writing'), 'Choose speaking or writing practice.')
        }
      } else {
        assert(block.type === 'exercise', 'Unsupported lesson block type.')
        assert(Array.isArray(block.questions) && block.questions.length <= 20 && (!published || block.questions.length > 0), 'An exercise needs up to 20 questions; add at least one before publishing.')
        const questions = block.questions as unknown[]
        questions.forEach((q) => question(q, published))
        assert(new Set(questions.map((q) => (q as Row).id)).size === questions.length, 'Question identifiers must be unique within a block.')
      }
    } catch (failure) { throw new Error(`Block ${index + 1}: ${(failure as Error).message}`, { cause: failure }) }
  })
  return value as LecturerLessonDocument
}

export function lessonDocumentText(document: LecturerLessonDocument, vocabulary: VocabularyEntry[]): string {
  const words = new Map(vocabulary.map((word) => [word.id, word]))
  const wordText = (ids: string[]) => ids.map((id) => {
    const word = words.get(id)
    return word ? `${word.hanzi} · ${word.pinyin} · ${word.meaning}` : `[Unavailable word: ${id}]`
  }).join('\n')
  return document.blocks.map((block) => {
    if (block.type === 'explanation') return [block.heading, block.text, block.grammar].filter(Boolean).join('\n\n')
    if (block.type === 'example') return [block.example.hanzi, block.example.pinyin, block.example.meaning].filter(Boolean).join('\n')
    if (block.type === 'vocabulary') return `Vocabulary\n${wordText(block.vocabularyIds)}`
    if (block.type === 'practice') return `Practice: ${block.modes.map((mode) => mode === 'speech' ? 'speaking and pronunciation' : 'writing characters').join(', ')}\n${wordText(block.vocabularyIds)}`
    return block.questions.map((q) => [q.prompt, ...(q.type === 'choice' ? q.options.map((option) => option.text) : [q.tokens.join(' ')])].filter(Boolean).join('\n')).join('\n\n')
  }).filter(Boolean).join('\n\n') || 'Draft lesson. Add blocks to continue.'
}

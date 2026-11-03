import { describe, expect, it } from 'vitest'
import { catalog } from '../data/catalog'
import { documentForLesson, lessonDocumentText, moveLessonBlock, newLessonBlock, parseLessonDocument } from './lessonBlocks'
import { gradeAnswer } from './learning'
import { sampleLessonDocument } from '../../tests/fixtures/lesson-blocks'

describe('lecturer lesson block documents', () => {
  it('round-trips all five types with Slovak examples and the existing exercise model', () => {
    const doc = sampleLessonDocument()
    expect(parseLessonDocument(JSON.parse(JSON.stringify(doc)), true, catalog.vocabulary)).toEqual(doc)
    const exercise = doc.blocks[3]
    if (exercise.type !== 'exercise') throw new Error('Expected exercise')
    expect(gradeAnswer(exercise.questions[0], ['water'])).toBe(true)
    expect(gradeAnswer(exercise.questions[0], ['tea'])).toBe(false)
    expect(gradeAnswer(exercise.questions[1], ['我', '喝', '水'])).toBe(true)
    expect(gradeAnswer(exercise.questions[1], ['我', '水', '喝'])).toBe(false)
  })
  it('keeps unfinished drafts editable but requires complete blocks before publication', () => {
    for (const type of ['explanation', 'example', 'vocabulary', 'exercise', 'practice'] as const) {
      const doc = { schemaVersion: 1, blocks: [newLessonBlock(type)] }
      expect(() => parseLessonDocument(doc)).not.toThrow()
      expect(() => parseLessonDocument(doc, true, catalog.vocabulary)).toThrow()
    }
    expect(() => parseLessonDocument({ schemaVersion: 1, blocks: [] })).not.toThrow()
    expect(() => parseLessonDocument({ schemaVersion: 1, blocks: [] }, true)).toThrow()
  })
  it('retains legacy text exactly and clones stored documents before editing or moving stable blocks', () => {
    const legacy = '\n你好\n<script>window.pwned = true</script>\n'
    const converted = documentForLesson({ content: legacy })
    expect(converted.blocks[0]).toMatchObject({ type: 'explanation', text: legacy })
    expect(lessonDocumentText(converted, catalog.vocabulary)).toBe(legacy)
    const original = sampleLessonDocument()
    const edited = documentForLesson({ content: 'Older text', blocks: original })
    const moved = moveLessonBlock(edited, edited.blocks[0].id, 1)
    expect(moved.blocks.map((block) => block.id)).toEqual(['block-example', 'block-explanation', 'block-vocabulary', 'block-exercise', 'block-practice'])
    expect(original).toEqual(sampleLessonDocument())
    expect(moveLessonBlock(edited, edited.blocks[0].id, -1)).toBe(edited)
  })
  it('rejects malformed documents, unknown block types, duplicate identities and oversized payloads', () => {
    const doc = sampleLessonDocument()
    for (const value of [null, [], { ...doc, schemaVersion: 2 }, { ...doc, schemaVersion: '1' }, { ...doc, blocks: [...doc.blocks, doc.blocks[0]] }, { ...doc, blocks: [{ ...doc.blocks[0], type: 'script' }] }, { ...doc, blocks: Array.from({ length: 41 }, (_, index) => ({ ...doc.blocks[0], id: `block-${index}` })) }]) expect(() => parseLessonDocument(value)).toThrow()
    expect(() => parseLessonDocument({ schemaVersion: 1, blocks: [{ id: 'text', type: 'explanation', heading: '', text: 'a'.repeat(50001), grammar: '' }] })).toThrow()
  })
  it('validates catalog references, retired words, practice modes and repeated token occurrences', () => {
    expect(() => parseLessonDocument({ schemaVersion: 1, blocks: [{ id: 'words', type: 'vocabulary', vocabularyIds: ['missing'] }] }, true, catalog.vocabulary)).toThrow(/missing/)
    const archived = [{ ...catalog.vocabulary.find((word) => word.id === 'wo')!, archived: true }]
    const practice = { schemaVersion: 1, blocks: [{ id: 'practice', type: 'practice', vocabularyIds: ['wo'], modes: ['speech'] }] }
    expect(() => parseLessonDocument(practice, false, archived)).not.toThrow()
    expect(() => parseLessonDocument(practice, true, archived)).toThrow(/archived/)
    expect(() => parseLessonDocument({ ...practice, blocks: [{ ...practice.blocks[0], modes: ['admin'] }] }, false, archived)).toThrow()
    const q = { id: 'order', type: 'order', prompt: 'Repeat the pronoun.', explanation: 'Both occurrences are required.', tokens: ['我', '和', '我'], acceptedOrders: [['我', '和', '我']] }
    expect(() => parseLessonDocument({ schemaVersion: 1, blocks: [{ id: 'exercise', type: 'exercise', questions: [q] }] }, true)).not.toThrow()
    expect(() => parseLessonDocument({ schemaVersion: 1, blocks: [{ id: 'exercise', type: 'exercise', questions: [{ ...q, acceptedOrders: [['我', '和']] }] }] }, true)).toThrow(/occurrence/)
  })
  it('generates a static legacy reading version without leaking exercise answer keys', () => {
    const text = lessonDocumentText(sampleLessonDocument(), catalog.vocabulary)
    expect(text).toContain('Pijem vodu.')
    expect(text).toContain('我 · wǒ')
    expect(text).toContain('What does 水 mean?')
    expect(text).not.toContain('question-choice')
    expect(text).not.toContain('水 means water.')
    expect(text).toContain('Practice: speaking and pronunciation, writing characters')
  })
})

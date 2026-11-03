import type { LecturerLessonDocument } from '../../src/types/content'

export function sampleLessonDocument(): LecturerLessonDocument {
  return { schemaVersion: 1, blocks: [
    { id: 'block-explanation', type: 'explanation', heading: 'At the café', text: 'Learn to ask for a drink.', grammar: 'A simple Chinese sentence places the subject before the verb.' },
    { id: 'block-example', type: 'example', example: { hanzi: '我喝水。', pinyin: 'Wǒ hē shuǐ.', meaning: 'Pijem vodu.' }, translationLanguage: 'sk' },
    { id: 'block-vocabulary', type: 'vocabulary', vocabularyIds: ['wo', 'shui'] },
    { id: 'block-exercise', type: 'exercise', questions: [
      { id: 'question-choice', type: 'choice', prompt: 'What does 水 mean?', explanation: '水 means water.', options: [{ id: 'water', text: 'Water' }, { id: 'tea', text: 'Tea' }], answer: 'water' },
      { id: 'question-order', type: 'order', prompt: 'Build: I drink water.', explanation: 'Subject, verb, object.', tokens: ['我', '喝', '水'], acceptedOrders: [['我', '喝', '水']], hint: 'Start with 我.', audioText: '我喝水。' },
    ] },
    { id: 'block-practice', type: 'practice', vocabularyIds: ['wo', 'shui'], modes: ['speech', 'writing'] },
  ] }
}

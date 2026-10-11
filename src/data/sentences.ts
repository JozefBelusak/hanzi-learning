export type SentenceGrammarPart = {
  label: string
  text: string
}

export type SentenceExercise = {
  id: string
  meaning: string
  pinyin: string
  tokens: string[]
  punctuation: '。' | '？'
  acceptedOrders?: string[][]
  grammarTitle: string
  grammarNote: string
  grammarParts: SentenceGrammarPart[]
}

// Original examples for the sentence-building demo, separate from the HSK dataset.
export const sentences: SentenceExercise[] = [
  {
    id: 'sentence-drink-water',
    meaning: 'I drink water.',
    pinyin: 'Wǒ hē shuǐ.',
    tokens: ['我', '喝', '水'],
    punctuation: '。',
    grammarTitle: 'Subject → verb → object',
    grammarNote:
      'A basic statement names the person doing the action first, followed by the action and its object.',
    grammarParts: [
      { label: 'Who', text: '我 · I' },
      { label: 'Action', text: '喝 · drink' },
      { label: 'What', text: '水 · water' },
    ],
  },
  {
    id: 'sentence-student',
    meaning: 'I am a student.',
    pinyin: 'Wǒ shì xuésheng.',
    tokens: ['我', '是', '学生'],
    punctuation: '。',
    grammarTitle: 'Identity with 是',
    grammarNote:
      '是 connects the subject to a noun describing their identity or category. Here, it says that I am a student.',
    grammarParts: [
      { label: 'Subject', text: '我 · I' },
      { label: 'Link', text: '是 · be' },
      { label: 'Identity', text: '学生 · student' },
    ],
  },
  {
    id: 'sentence-teacher-question',
    meaning: 'Are you a teacher?',
    pinyin: 'Nǐ shì lǎoshī ma?',
    tokens: ['你', '是', '老师', '吗'],
    punctuation: '？',
    grammarTitle: 'Questions with 吗',
    grammarNote:
      'Adding 吗 to the end of a statement turns it into a yes-or-no question. The basic word order stays the same.',
    grammarParts: [
      { label: 'Statement', text: '你是老师 · you are a teacher' },
      { label: 'Question', text: '吗 · question particle' },
    ],
  },
  {
    id: 'sentence-no-tea',
    meaning: 'I do not drink tea.',
    pinyin: 'Wǒ bù hē chá.',
    tokens: ['我', '不', '喝', '茶'],
    punctuation: '。',
    grammarTitle: 'Negation before the verb',
    grammarNote:
      'For this habitual action, 不 goes directly before the verb 喝. It changes “drink” into “do not drink”.',
    grammarParts: [
      { label: 'Subject', text: '我 · I' },
      { label: 'Negation + action', text: '不喝 · do not drink' },
      { label: 'Object', text: '茶 · tea' },
    ],
  },
  {
    id: 'sentence-at-school',
    meaning: 'He is at school.',
    pinyin: 'Tā zài xuéxiào.',
    tokens: ['他', '在', '学校'],
    punctuation: '。',
    grammarTitle: 'Location with 在',
    grammarNote:
      'Here, 在 describes where someone is. Use 在 followed by the name of the place.',
    grammarParts: [
      { label: 'Who', text: '他 · he' },
      { label: 'Location verb', text: '在 · be at' },
      { label: 'Where', text: '学校 · school' },
    ],
  },
  {
    id: 'sentence-today-study',
    meaning: 'I study Chinese today.',
    pinyin: 'Wǒ jīntiān xuéxí Hànyǔ.',
    tokens: ['我', '今天', '学习', '汉语'],
    punctuation: '。',
    acceptedOrders: [['今天', '我', '学习', '汉语']],
    grammarTitle: 'Time before the verb',
    grammarNote:
      '今天 gives the time and goes before the action 学习. 今天我学习汉语 is also accepted: the time expression can go before or after the subject.',
    grammarParts: [
      { label: 'Subject', text: '我 · I' },
      { label: 'When', text: '今天 · today' },
      { label: 'Action', text: '学习 · study' },
      { label: 'What', text: '汉语 · Chinese' },
    ],
  },
  {
    id: 'sentence-chinese-food',
    meaning: 'I like Chinese food.',
    pinyin: 'Wǒ xǐhuan Zhōngguó cài.',
    tokens: ['我', '喜欢', '中国菜'],
    punctuation: '。',
    grammarTitle: 'The object after 喜欢',
    grammarNote:
      '喜欢 means to like something. The thing you like follows the verb; 中国菜 is a single phrase here.',
    grammarParts: [
      { label: 'Who', text: '我 · I' },
      { label: 'Preference', text: '喜欢 · like' },
      { label: 'What', text: '中国菜 · Chinese food' },
    ],
  },
  {
    id: 'sentence-three-books',
    meaning: 'She has three books.',
    pinyin: 'Tā yǒu sān běn shū.',
    tokens: ['她', '有', '三', '本', '书'],
    punctuation: '。',
    grammarTitle: 'Number → classifier → noun',
    grammarNote:
      'When counting books, put the classifier 本 between the number 三 and the noun 书. 三本书 means three books.',
    grammarParts: [
      { label: 'Subject + verb', text: '她有 · she has' },
      { label: 'Number', text: '三 · three' },
      { label: 'Classifier', text: '本 · for books' },
      { label: 'Noun', text: '书 · book' },
    ],
  },
  {
    id: 'sentence-tomorrow-beijing',
    meaning: 'We are going to Beijing tomorrow.',
    pinyin: 'Wǒmen míngtiān qù Běijīng.',
    tokens: ['我们', '明天', '去', '北京'],
    punctuation: '。',
    acceptedOrders: [['明天', '我们', '去', '北京']],
    grammarTitle: 'Time and destination',
    grammarNote:
      '明天 places the action tomorrow. 北京 follows 去 as the destination. 明天我们去北京 is also accepted.',
    grammarParts: [
      { label: 'Who', text: '我们 · we' },
      { label: 'When', text: '明天 · tomorrow' },
      { label: 'Action', text: '去 · go' },
      { label: 'Where to', text: '北京 · Beijing' },
    ],
  },
  {
    id: 'sentence-family-tea',
    meaning: 'I like tea, and Dad likes tea too.',
    pinyin: 'Wǒ xǐhuan chá, bàba yě xǐhuan chá.',
    tokens: ['我', '喜欢', '茶', '，', '爸爸', '也', '喜欢', '茶'],
    punctuation: '。',
    grammarTitle: '也 before the verb',
    grammarNote:
      '也 means “also” and goes before the verb 喜欢. The comma separates two simple clauses. The two 茶 tiles and the two 喜欢 tiles are interchangeable.',
    grammarParts: [
      { label: 'First clause', text: '我喜欢茶 · I like tea' },
      { label: 'Second subject', text: '爸爸 · Dad' },
      { label: 'Also + action', text: '也喜欢 · also likes' },
      { label: 'Object', text: '茶 · tea' },
    ],
  },
]

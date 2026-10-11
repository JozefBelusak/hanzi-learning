import type { Card, CategoryId, WordCategoryId } from '../types/study'

export const categories: { id: CategoryId; title: string; description: string; symbol: string }[] = [
  { id: 'all', title: 'All words', description: 'The complete beginner vocabulary.', symbol: '全' },
  { id: 'people', title: 'People and family', description: 'Pronouns, family members and jobs.', symbol: '人' },
  { id: 'food', title: 'Food and drinks', description: 'Order tea or something to eat.', symbol: '茶' },
  { id: 'numbers', title: 'Numbers and quantities', description: 'Counting, prices and amounts.', symbol: '三' },
  { id: 'time', title: 'Time and weather', description: 'Days, hours and everyday weather.', symbol: '日' },
  { id: 'places', title: 'Places and travel', description: 'School, cities and transport.', symbol: '国' },
  { id: 'actions', title: 'Activities', description: 'Reading, learning and everyday activities.', symbol: '学' },
  { id: 'objects', title: 'Things and animals', description: 'Objects and animals around you.', symbol: '书' },
  { id: 'other', title: 'Phrases and grammar', description: 'Greetings, questions and connecting words.', symbol: '好' },
]

// Editorial categories; vocabulary definitions and pinyin come from the public dataset.
const groups: Record<Exclude<WordCategoryId, 'other'>, string[]> = {
  people: ['爸爸','儿子','工作','家','老师','妈妈','名字','女儿','你','朋友','人','谁','他','她','同学','我','我们','先生','学生','医生','小姐'],
  food: ['菜','茶','吃','喝','米饭','苹果','水','水果'],
  numbers: ['八','本','多','多少','二','个','几','九','块','六','钱','七','三','少','十','四','五','些','一','一点儿'],
  time: ['点','分钟','号','今天','冷','明天','年','热','上午','时候','岁','天气','下雨','下午','现在','星期','月','中午','昨天'],
  places: ['北京','出租车','饭店','飞机','回','来','哪儿','去','商店','上','下','学校','医院','在','中国','住','后面','前面','里'],
  actions: ['爱','打电话','读','会','叫','开','看','看见','买','能','请','认识','睡觉','说','听','喜欢','想','写','学习','有','坐','做'],
  objects: ['杯子','电脑','电视','电影','东西','狗','猫','书','衣服','椅子','桌子','字'],
}

export function categorizeWord(hanzi: string): WordCategoryId {
  for (const [id, words] of Object.entries(groups)) {
    if (words.includes(hanzi)) return id as WordCategoryId
  }
  return 'other'
}
export function filterCards(cards: Card[], category: CategoryId): Card[] {
  return category === 'all' ? cards : cards.filter((card) => card.categoryId === category)
}
export function categoryTitle(id: CategoryId): string {
  return categories.find((category) => category.id === id)?.title ?? 'All words'
}

import { difficultyIds, languageLevelIds } from '../types/content.ts'
import type { CategoryId, ContentCatalog, ContentTaxonomy, LanguageLevel, PlatformActivity } from '../types/content'

type Row = Record<string, unknown>
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Invalid educational content: ${message}`) }
function row(value: unknown, path: string): Row { check(value && typeof value === 'object' && !Array.isArray(value), `${path} must be an object.`); return value as Row }
function text(value: unknown, path: string): asserts value is string { check(typeof value === 'string' && value.trim().length > 0, `${path} must be non-empty text.`) }
function list(value: unknown, path: string): unknown[] { check(Array.isArray(value), `${path} must be an array.`); return value }
function strings(value: unknown, path: string, nonempty = false): string[] { const items = list(value, path); check(!nonempty || items.length, `${path} must not be empty.`); items.forEach((item) => text(item, path)); return items as string[] }
function unique(items: string[], path: string) { check(new Set(items).size === items.length, `${path} contains duplicate identifiers.`) }
function id(value: unknown, path: string): asserts value is string { text(value, path); check(/^[a-z0-9][a-z0-9:_-]*$/.test(value) && value.length <= 160, `${path} is not a stable identifier.`) }
function rows(value: unknown, path: string): Row[] { return list(value, path).map((value) => row(value, path)) }
function ids(value: unknown, path: string): Set<string> { const entries = rows(value, path); entries.forEach((r) => id(r.id, `${path}.id`)); const result = entries.map((r) => r.id as string); unique(result, path); return new Set(result) }
function references(values: unknown, target: Set<string>, path: string) { const refs = strings(values, path); unique(refs, path); refs.forEach((ref) => check(target.has(ref), `${path}: unknown reference ${ref}.`)) }
function metadata(value: Row, path: string, taxonomy: ContentTaxonomy) {
  check(value.archived === undefined || typeof value.archived === 'boolean', `${path}: invalid archive flag.`)
  check(taxonomy.languageLevels.some(({ id }) => id === value.languageLevel), `${path}: unknown language level.`)
  check(taxonomy.difficulties.some(({ id }) => id === value.difficulty), `${path}: unknown difficulty.`)
}
function examples(value: unknown, path: string) { rows(value, path).forEach((example) => { for (const field of ['hanzi', 'pinyin', 'meaning']) text(example[field], `${path}.${field}`) }) }
function sameTokens(left: string[], right: string[]) { return left.length === right.length && [...left].sort().every((token, i) => token === [...right].sort()[i]) }
function acyclic(graph: Map<string, string[]>, path: string) {
  const done = new Set<string>(), visiting = new Set<string>()
  function visit(key: string) {
    check(!visiting.has(key), `${path} contains a prerequisite cycle at ${key}.`)
    if (done.has(key)) return
    visiting.add(key); (graph.get(key) ?? []).forEach(visit); visiting.delete(key); done.add(key)
  }
  graph.forEach((_, key) => visit(key))
}
export function parseTaxonomy(value: unknown): ContentTaxonomy {
  const data = row(value, 'taxonomy')
  for (const [field, allowed] of [['languageLevels', languageLevelIds], ['difficulties', difficultyIds]] as const) {
    const keys = ids(data[field], field)
    check(keys.size === allowed.length && allowed.every((key) => keys.has(key)), `${field} must define every supported ID.`)
    rows(data[field], field).forEach((entry) => { text(entry.label, `${field}.label`); text(entry.description, `${field}.description`) })
  }
  const categories = ids(data.categories, 'categories')
  check(categories.has('all') && categories.has('other'), 'categories need all and other fallbacks.')
  rows(data.categories, 'categories').forEach((category) => {
    check(['all', 'people', 'food', 'numbers', 'time', 'places', 'actions', 'objects', 'other'].includes(category.id as string), 'Unknown topic ID.')
    for (const key of ['title', 'description', 'symbol']) text(category[key], `categories.${key}`)
    if (category.words !== undefined) strings(category.words, 'category.words')
  })
  check(ids(data.courseLines, 'courseLines').size > 0, 'At least one course line is required.')
  rows(data.courseLines, 'courseLines').forEach((line) => { text(line.title, 'line.title'); text(line.symbol, 'line.symbol'); check(typeof line.color === 'string' && /^#[0-9a-f]{6}$/i.test(line.color), 'Line colors must be hex colors.') })
  const sources = ids(data.sources, 'sources')
  check(sources.has('hearmandarin') && sources.has('hanzi-original'), 'The vocabulary and platform source records are required.')
  rows(data.sources, 'sources').forEach((source) => { for (const key of ['name', 'url', 'license', 'attribution']) text(source[key], `sources.${key}`); check(/^https:\/\//.test(source.url as string), 'Source URLs must use HTTPS.') })
  const selection = row(data.vocabularySelection, 'vocabularySelection')
  check(list(selection.hsk2Levels, 'hsk2Levels').length > 0 && (selection.hsk2Levels as unknown[]).every((n) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 6), 'HSK 2.0 selection must use levels 1–6.')
  const mapping = row(selection.levelMapping, 'levelMapping')
  ;(selection.hsk2Levels as number[]).forEach((n) => check(languageLevelIds.includes(mapping[String(n)] as typeof languageLevelIds[number]), `Missing language-level mapping for HSK ${n}.`))
  return data as unknown as ContentTaxonomy
}
export function parseContentCatalog(value: unknown): ContentCatalog {
  const pack = row(value, 'catalog')
  check(pack.schemaVersion === 1 && pack.id === 'hanzi-platform', 'Unsupported catalog schema or origin.')
  const taxonomy = parseTaxonomy(pack.taxonomy)
  const levels = new Map(taxonomy.languageLevels.map(({ id }, i) => [id, i]))
  const words = ids(pack.vocabulary, 'vocabulary'), grammar = ids(pack.grammarTopics, 'grammarTopics')
  const categories = new Set(taxonomy.categories.map(({ id }) => id)), sources = new Set(taxonomy.sources.map(({ id }) => id))
  rows(pack.vocabulary, 'vocabulary').forEach((word) => {
    metadata(word, `vocabulary ${word.id}`, taxonomy); examples([word], 'vocabulary')
    check(word.categoryId !== 'all' && categories.has(word.categoryId as CategoryId), `Vocabulary ${word.id} has an invalid topic.`)
    check(word.level === null || (Number.isInteger(word.level) && Number(word.level) >= 1 && Number(word.level) <= 6), `Vocabulary ${word.id} has an invalid HSK 2.0 level.`)
    check(sources.has(word.sourceId as string), `Vocabulary ${word.id} has an unknown source.`)
    for (const field of ['sourceEntryId', 'traditional', 'partOfSpeech']) if (word[field] !== undefined) text(word[field], `vocabulary.${field}`)
  })
  const grammarRows = rows(pack.grammarTopics, 'grammarTopics')
  grammarRows.forEach((topic) => { metadata(topic, `grammar ${topic.id}`, taxonomy); text(topic.title, 'grammar.title'); text(topic.explanation, 'grammar.explanation'); examples(topic.examples, 'grammar.examples'); references(topic.prerequisites, grammar, 'grammar.prerequisites'); if (topic.vocabularyIds !== undefined) references(topic.vocabularyIds, words, 'grammar.vocabularyIds') })
  acyclic(new Map(grammarRows.map((topic) => [topic.id as string, topic.prerequisites as string[]])), 'Grammar')
  const activities = rows(pack.activities, 'activities')
  const revisionKeys: string[] = []
  const current = new Map<string, PlatformActivity>()
  activities.forEach((activity) => {
    id(activity.id, 'activity.id'); metadata(activity, `activity ${activity.id}`, taxonomy)
    check(Number.isInteger(activity.revision) && Number(activity.revision) > 0, 'Activity revisions must be positive integers.')
    revisionKeys.push(`${activity.id}:${activity.revision}`)
    check(activity.source === 'platform' && ['published', 'archived'].includes(activity.publication as string), 'Activity ownership or publication is invalid.')
    check(['lesson', 'exercise'].includes(activity.kind as string), 'Unknown activity kind.')
    for (const field of ['title', 'description']) text(activity[field], `activity.${field}`)
    check(Number.isFinite(activity.minutes) && Number(activity.minutes) > 0, 'Activity duration must be positive.')
    check(categories.has(activity.category as CategoryId), 'Activity has an unknown category.')
    check(taxonomy.courseLines.some((line) => line.id === activity.line), 'Activity has an unknown map line.')
    const position = row(activity.position, 'activity.position')
    check([position.x, position.y].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0), 'Map positions must be finite non-negative coordinates.')
    strings(activity.objectives, 'objectives', true); strings(activity.explanation, 'explanation', true); examples(activity.examples, 'examples')
    references(activity.vocabularyIds, words, `activity ${activity.id}.vocabularyIds`); references(activity.grammarTopicIds, grammar, `activity ${activity.id}.grammarTopicIds`)
    strings(activity.prerequisites, 'prerequisites')
    const features = strings(activity.features, 'features'); unique(features, 'features'); check(features.every((feature) => feature === 'tone-guide'), 'Unsupported teaching feature.')
    const questionIds = ids(activity.questions, `activity ${activity.id}.questions`)
    check(questionIds.size > 0, 'Activities need at least one question.')
    rows(activity.questions, 'questions').forEach((question) => {
      for (const field of ['prompt', 'explanation']) text(question[field], `question.${field}`)
      for (const field of ['hint', 'audioText']) if (question[field] !== undefined) text(question[field], `question.${field}`)
      if (question.type === 'choice') {
        const options = ids(question.options, 'question.options'); check(options.size >= 2, 'Choice questions need at least two options.')
        rows(question.options, 'options').forEach((option) => { text(option.text, 'option.text'); if (option.pinyin !== undefined) text(option.pinyin, 'option.pinyin') })
        check(options.has(question.answer as string), 'Choice answer must reference an existing option.')
      } else {
        check(question.type === 'order', 'Unknown question type. Supported types are choice and order.')
        const tokens = strings(question.tokens, 'question.tokens', true)
        const orders = list(question.acceptedOrders, 'acceptedOrders'); check(orders.length, 'Ordering questions need accepted answers.')
        orders.forEach((order) => check(sameTokens(strings(order, 'acceptedOrder'), tokens), 'Accepted orders must use every token occurrence exactly once.'))
      }
    })
    if (activity.fact !== undefined) { const fact = row(activity.fact, 'fact'); for (const key of ['title', 'text', 'sourceUrl', 'sourceLabel']) text(fact[key], `fact.${key}`); check(/^https:\/\//.test(fact.sourceUrl as string), 'Fact URLs must use HTTPS.') }
    const old = current.get(activity.id)
    if (old) check(old.kind === activity.kind, 'An activity cannot change kind across revisions.')
    if (!old || Number(activity.revision) > old.revision) current.set(activity.id, activity as unknown as PlatformActivity)
  })
  unique(revisionKeys, 'activity revisions')
  activities.forEach((activity) => {
    unique(activity.prerequisites as string[], 'prerequisites')
    ;(activity.prerequisites as string[]).forEach((ref) => {
      const prerequisite = current.get(ref)
      check(prerequisite?.kind === 'lesson', `Unknown prerequisite lesson ${ref}.`)
      check((levels.get(prerequisite.languageLevel) ?? 0) <= (levels.get(activity.languageLevel as LanguageLevel) ?? 0), 'A prerequisite cannot require a higher language level.')
    })
  })
  acyclic(new Map([...current].map(([id, activity]) => [id, activity.prerequisites])), 'Activities')
  ids(pack.sentences, 'sentences')
  rows(pack.sentences, 'sentences').forEach((sentence) => {
    metadata(sentence, `sentence ${sentence.id}`, taxonomy); text(sentence.meaning, 'sentence.meaning'); text(sentence.pinyin, 'sentence.pinyin')
    const tokens = strings(sentence.tokens, 'sentence.tokens', true)
    check(['。', '？'].includes(sentence.punctuation as string), 'Invalid sentence punctuation.')
    check(grammar.has(sentence.grammarTopicId as string), 'Sentence has an unknown grammar topic.')
    if (sentence.acceptedOrders !== undefined) list(sentence.acceptedOrders, 'sentence.acceptedOrders').forEach((order) => check(sameTokens(strings(order, 'sentence.order'), tokens), 'Invalid sentence token inventory.'))
    rows(sentence.grammarParts, 'grammarParts').forEach((part) => { text(part.label, 'grammarPart.label'); text(part.text, 'grammarPart.text') })
  })
  // Revision 1 is the meaning of legacy progress. Never silently remove it.
  current.forEach((activity) => check(revisionKeys.includes(`${activity.id}:1`), `Activity ${activity.id} must retain revision 1.`))
  return pack as unknown as ContentCatalog
}

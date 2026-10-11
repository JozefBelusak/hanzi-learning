import type { SentenceExercise } from '../data/sentences'

export type SentenceToken = {
  id: string
  text: string
}

export function createSentenceTokens(exercise: SentenceExercise): SentenceToken[] {
  return exercise.tokens.map((text, index) => ({
    id: `${exercise.id}:${index}`,
    text,
  }))
}

export function shuffleSentenceTokens(
  tokens: SentenceToken[],
  random: () => number = Math.random,
): SentenceToken[] {
  const shuffled = [...tokens]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  // Avoid initially presenting the correct solution in its original order.
  if (
    shuffled.length > 1 &&
    shuffled.every((token, index) => token.text === tokens[index].text)
  ) {
    shuffled.push(shuffled.shift()!)
  }

  return shuffled
}

export function sentenceText(
  tokens: SentenceToken[],
  selectedIds: string[],
): string {
  const byId = new Map(tokens.map((token) => [token.id, token.text]))
  return selectedIds.map((id) => byId.get(id) ?? '').join('')
}

export function isSentenceOrderCorrect(
  exercise: SentenceExercise,
  tokens: SentenceToken[],
  selectedIds: string[],
): boolean {
  if (
    selectedIds.length !== exercise.tokens.length ||
    new Set(selectedIds).size !== selectedIds.length
  ) {
    return false
  }

  const byId = new Map(tokens.map((token) => [token.id, token.text]))
  const selectedWords = selectedIds.map((id) => byId.get(id))

  if (selectedWords.some((word) => word === undefined)) {
    return false
  }

  return [exercise.tokens, ...(exercise.acceptedOrders ?? [])].some((order) =>
    order.every((word, index) => word === selectedWords[index]),
  )
}

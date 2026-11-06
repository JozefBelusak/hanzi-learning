export const routePaces = [
  { id: 'short', label: 'Short route', value: 5, words: 3, practice: 1 },
  { id: 'regular', label: 'Regular route', value: 10, words: 5, practice: 3 },
  { id: 'extended', label: 'Extended route', value: 20, words: 7, practice: 5 },
] as const

// Retain existing numeric account settings; their ranges now select a workload.
export function routePace(goal: number) { return routePaces[goal <= 5 ? 0 : goal <= 15 ? 1 : 2] }

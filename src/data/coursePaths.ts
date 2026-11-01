import type { LanguageLevel } from '../types/content'

// Paths group the published catalog by its existing language-level metadata.
// New administrator-authored lessons join the matching path automatically.
export const coursePaths: { level: LanguageLevel; title: string; description: string; symbol: string }[] = [
  { level: 'beginner', title: 'First connections', description: 'Sounds, introductions and your first conversations.', symbol: '初' },
  { level: 'elementary', title: 'Everyday journeys', description: 'Find your way, make plans and compare your choices.', symbol: '行' },
  { level: 'intermediate', title: 'Connected conversations', description: 'Tell stories, explain results and connect your ideas.', symbol: '连' },
  { level: 'advanced', title: 'Ideas and viewpoints', description: 'Build arguments, weigh alternatives and explain decisions.', symbol: '思' },
]

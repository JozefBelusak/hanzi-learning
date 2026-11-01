import type { LearningActivity } from '../types/learning'

// Keep editorial ordering/branches, but reserve a readable cell per station.
// Pixel spacing stays constant inside the scrollable desktop map.
export function layoutCourseMap(lessons: LearningActivity[]) {
  const columns = [...new Set(lessons.map((lesson) => lesson.position.x))].sort((a, b) => a - b)
  const rows = [...new Set(lessons.map((lesson) => lesson.position.y))].sort((a, b) => a - b)
  const occupied = new Set<string>()
  const positions = new Map<string, { x: number; y: number }>()
  let lastRow = 0
  for (const lesson of lessons) {
    const column = columns.indexOf(lesson.position.x)
    let row = rows.indexOf(lesson.position.y)
    // Admin-created lessons can share coordinates; give each its own cell.
    while (occupied.has(`${column}:${row}`)) row += 1
    occupied.add(`${column}:${row}`)
    lastRow = Math.max(lastRow, row)
    positions.set(lesson.id, { x: 110 + column * 220, y: 55 + row * 160 })
  }
  return { positions, width: Math.max(440, columns.length * 220), height: Math.max(300, 195 + lastRow * 160) }
}

export type BrushPoint = { x: number; y: number; pressure?: number }
type EdgePoint = { x: number; y: number }

const distance = (a: EdgePoint, b: EdgePoint) => Math.hypot(b.x - a.x, b.y - a.y)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const pressure = (point: BrushPoint) => Number.isFinite(point.pressure) ? clamp(point.pressure!, 0.05, 1) : 0.75

// Resampling keeps thickness independent of how many pointer events a device sends.
function resample(points: BrushPoint[]): { points: BrushPoint[]; length: number } {
  const clean = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .filter((point, index, all) => index === 0 || distance(point, all[index - 1]) > 0.01)
  if (clean.length < 2) return { points: clean, length: 0 }
  const lengths = [0]
  for (let index = 1; index < clean.length; index++) lengths.push(lengths[index - 1] + distance(clean[index - 1], clean[index]))
  const length = lengths[lengths.length - 1]
  const count = Math.max(2, Math.min(512, Math.ceil(length / 4) + 1))
  const sampled: BrushPoint[] = []
  let segment = 1
  for (let index = 0; index < count; index++) {
    const position = length * index / (count - 1)
    while (segment < clean.length - 1 && lengths[segment] < position) segment++
    const amount = (position - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1])
    const before = clean[segment - 1]
    const after = clean[segment]
    sampled.push({
      x: before.x + (after.x - before.x) * amount,
      y: before.y + (after.y - before.y) * amount,
      pressure: pressure(before) + (pressure(after) - pressure(before)) * amount,
    })
  }
  return { points: sampled, length }
}

export function brushOutline(points: BrushPoint[], width = 72): EdgePoint[] {
  if (!Number.isFinite(width) || width <= 0) return []
  const sampled = resample(points)
  if (!sampled.points.length) return []
  if (sampled.points.length === 1) {
    const point = sampled.points[0]
    const radius = width * 0.12
    return Array.from({ length: 12 }, (_, index) => ({ x: point.x + Math.cos(index * Math.PI / 6) * radius, y: point.y + Math.sin(index * Math.PI / 6) * radius }))
  }
  const centers = sampled.points.map((point, index, all) => {
    if (!index || index === all.length - 1) return point
    return { ...point, x: (all[index - 1].x + 6 * point.x + all[index + 1].x) / 8, y: (all[index - 1].y + 6 * point.y + all[index + 1].y) / 8 }
  })
  const left: EdgePoint[] = []
  const right: EdgePoint[] = []
  let smoothedPressure = pressure(centers[0])
  for (const [index, center] of centers.entries()) {
    const before = centers[Math.max(0, index - 1)]
    const after = centers[Math.min(centers.length - 1, index + 1)]
    const dx = after.x - before.x
    const dy = after.y - before.y
    const magnitude = Math.hypot(dx, dy) || 1
    const traveled = sampled.length * index / (centers.length - 1)
    const remaining = sampled.length - traveled
    smoothedPressure = smoothedPressure * 0.65 + pressure(center) * 0.35
    const entry = clamp(0.35 + traveled / 30, 0.35, 1)
    const exit = clamp(0.08 + remaining / 52, 0.08, 1)
    // A narrower entry, full body and pointed release replace the uniform marker line.
    const radius = width / 2 * (0.3 + 0.7 * smoothedPressure) * Math.min(entry, exit)
    const offset = { x: -dy / magnitude * radius, y: dx / magnitude * radius }
    left.push({ x: center.x + offset.x, y: center.y + offset.y })
    right.push({ x: center.x - offset.x, y: center.y - offset.y })
  }
  return [...left, ...right.reverse()]
}

export function brushPath(points: BrushPoint[], width = 72): string {
  const outline = brushOutline(points, width)
  if (!outline.length) return ''
  const coordinate = (value: number) => Number(value.toFixed(2))
  const start = outline[0]
  const last = outline[outline.length - 1]
  let path = `M ${coordinate((last.x + start.x) / 2)} ${coordinate((last.y + start.y) / 2)}`
  outline.forEach((point, index) => {
    const next = outline[(index + 1) % outline.length]
    path += ` Q ${coordinate(point.x)} ${coordinate(point.y)} ${coordinate((point.x + next.x) / 2)} ${coordinate((point.y + next.y) / 2)}`
  })
  return `${path} Z`
}

import { describe, expect, it } from 'vitest'
import { brushOutline, brushPath, type BrushPoint } from './brush'

const line: BrushPoint[] = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 240, y: 0 }]

describe('brush geometry', () => {
  it('has a broad body and tapered ends instead of a constant-width marker line', () => {
    const shape = brushOutline(line)
    const half = shape.length / 2
    const widthAt = (index: number) => Math.abs(shape[index].y - shape[shape.length - 1 - index].y)
    const middle = widthAt(Math.floor(half / 2))
    expect(middle).toBeGreaterThan(40)
    expect(widthAt(0)).toBeLessThan(middle / 2)
    expect(widthAt(half - 1)).toBeLessThan(middle / 4)
    expect(brushPath(line)).toMatch(/^M .+ Q .+ Z$/)
  })

  it('responds to pen pressure while leaving the captured trajectory unchanged', () => {
    const light = line.map((point) => ({ ...point, pressure: 0.15 }))
    const firm = line.map((point) => ({ ...point, pressure: 0.9 }))
    const before = structuredClone(firm)
    const height = (points: BrushPoint[]) => {
      const outline = brushOutline(points)
      return Math.max(...outline.map((point) => point.y)) - Math.min(...outline.map((point) => point.y))
    }
    expect(height(firm)).toBeGreaterThan(height(light) * 1.8)
    expect(firm).toEqual(before)
  })

  it('keeps the same shape for equivalent paths sampled at different event frequencies', () => {
    const dense = Array.from({ length: 241 }, (_, index) => ({ x: index, y: 0 }))
    expect(brushPath(dense)).toBe(brushPath(line))
  })

  it('handles dots, duplicate points and reversals without invalid SVG coordinates', () => {
    const cases = [
      [{ x: 12, y: 20 }], [{ x: 12, y: 20 }, { x: 12, y: 20 }],
      [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 0 }],
      [{ x: NaN, y: 3 }, { x: 0, y: 0 }, { x: 20, y: 20, pressure: Infinity }],
    ]
    for (const points of cases) {
      expect(brushPath(points)).not.toMatch(/NaN|Infinity/)
      expect(brushPath(points)).toMatch(/Z$/)
    }
    expect(brushPath([])).toBe('')
    expect(brushPath(line, 0)).toBe('')
  })
})

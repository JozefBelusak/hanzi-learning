import type { ColorObject, HanziWriterOptions, Point } from 'hanzi-writer'
import { brushPath } from './brush'

type RendererConstructor = NonNullable<NonNullable<HanziWriterOptions['rendererOverride']>['HanziWriterRenderer']>
type Character = ConstructorParameters<RendererConstructor>[0]
type Positioner = ConstructorParameters<RendererConstructor>[1]
type RenderState = Parameters<InstanceType<RendererConstructor>['render']>[0]
type LayerState = RenderState['character']['main']
type Target = { svg: SVGSVGElement | SVGGElement; defs: SVGDefsElement; createSubRenderTarget: () => Target }
export type BrushInput = { samples: { pressure?: number }[] }

const namespace = 'http://www.w3.org/2000/svg'
const element = <K extends keyof SVGElementTagNameMap>(name: K) => document.createElementNS(namespace, name)
const color = (value: ColorObject) => `rgba(${value.r},${value.g},${value.b},${value.a})`
let nextId = 0

// Uses Hanzi Writer's supported rendererOverride contract. Character geometry,
// display portions, hints and animation come from its original render state.
export function createBrushRenderer(input: BrushInput): RendererConstructor {
  return class BrushRenderer {
    _character: Character
    _positioner: Positioner
    private target: Target | null = null
    private clips: SVGClipPathElement[] = []
    private layers: { group: SVGGElement; paths: SVGPathElement[] }[] = []
    private ink = new Map<string, { path: SVGPathElement; samples: BrushInput['samples']; points: Point[] | null }>()
    private lengths: number[] = []

    constructor(character: Character, positioner: Positioner) {
      this._character = character
      this._positioner = positioner
    }

    mount(root: Target) {
      this.target = root.createSubRenderTarget()
      const { xOffset, yOffset, height, scale } = this._positioner
      this.target.svg.setAttribute('transform', `translate(${xOffset}, ${height - yOffset}) scale(${scale}, ${-scale})`)
      const prefix = window.location.href.replace(/#[^#]*$/, '').replace(/"/g, '%22')
      const ids = this._character.strokes.map((stroke) => {
        const clip = element('clipPath')
        const id = `hanzi-brush-${++nextId}`
        clip.setAttribute('id', id)
        const shape = element('path')
        shape.setAttribute('d', stroke.path)
        clip.appendChild(shape)
        this.target!.defs.appendChild(clip)
        this.clips.push(clip)
        this.lengths.push(stroke.getLength() + 100)
        return id
      })
      this.layers = Array.from({ length: 3 }, () => {
        const group = element('g')
        this.target!.svg.appendChild(group)
        const paths = this._character.strokes.map((stroke, index) => {
          const path = element('path')
          const [start, second] = stroke.points
          const dx = start.x - second.x
          const dy = start.y - second.y
          const length = Math.hypot(dx, dy) || 1
          const extended = { x: start.x + dx / length * 100, y: start.y + dy / length * 100 }
          path.setAttribute('d', [extended, ...stroke.points].map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '))
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke-width', '200')
          path.setAttribute('stroke-linecap', 'round')
          path.setAttribute('stroke-linejoin', 'miter')
          path.setAttribute('stroke-dasharray', `${this.lengths[index]},${this.lengths[index]}`)
          path.setAttribute('clip-path', `url("${prefix}#${ids[index]}")`)
          group.appendChild(path)
          return path
        })
        return { group, paths }
      })
    }

    private renderLayer(index: number, state: LayerState, inkColor: ColorObject, radical?: ColorObject | null) {
      const layer = this.layers[index]
      layer.group.style.opacity = String(state.opacity)
      layer.paths.forEach((path, strokeIndex) => {
        const stroke = state.strokes[strokeIndex]
        path.style.opacity = String(stroke.opacity)
        path.style.strokeDashoffset = String(this.lengths[strokeIndex] * 0.999 * (1 - stroke.displayPortion))
        path.setAttribute('stroke', color(radical && this._character.strokes[strokeIndex].isInRadical ? radical : inkColor))
      })
    }

    render(state: RenderState) {
      if (!this.target) return
      this.renderLayer(0, state.character.outline, state.options.outlineColor)
      this.renderLayer(1, state.character.main, state.options.strokeColor, state.options.radicalColor)
      this.renderLayer(2, state.character.highlight, state.options.highlightColor)
      const strokes = state.userStrokes ?? {}
      for (const [id, ink] of this.ink) {
        if (!strokes[id]) { ink.path.remove(); this.ink.delete(id) }
      }
      for (const [id, stroke] of Object.entries(strokes)) {
        if (!stroke) continue
        let ink = this.ink.get(id)
        if (!ink) {
          const path = element('path')
          path.setAttribute('data-brush-ink', '')
          path.setAttribute('stroke', 'none')
          this.target.svg.appendChild(path)
          ink = { path, samples: input.samples, points: null }
          this.ink.set(id, ink)
        }
        ink.path.setAttribute('fill', color(state.options.drawingColor))
        ink.path.style.opacity = String(stroke.opacity)
        if (ink.points !== stroke.points) {
          ink.path.setAttribute('d', brushPath(stroke.points.map((point, index) => ({ ...point, pressure: ink.samples[index]?.pressure })), state.options.drawingWidth))
          ink.points = stroke.points
        }
      }
    }

    destroy() {
      this.target?.svg.remove()
      this.clips.forEach((clip) => clip.remove())
      this.clips = []
      this.layers = []
      this.lengths = []
      this.ink.clear()
      this.target = null
    }
  }
}

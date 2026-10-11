import type { CharacterJson, Point, RenderTargetInitFunction } from 'hanzi-writer'
import type { Card } from '../types/study'

const strokeModules = import.meta.glob<CharacterJson>('../data/strokes/*.json', {
  import: 'default',
})

export type WritingCharacter = {
  character: string
  card: Card
}

export function writingCharacters(cards: Card[]): WritingCharacter[] {
  const unique = new Map<string, WritingCharacter>()

  for (const card of cards) {
    for (const character of Array.from(card.hanzi)) {
      if (/\p{Script=Han}/u.test(character) && !unique.has(character)) {
        unique.set(character, { character, card })
      }
    }
  }

  return Array.from(unique.values())
}

export async function loadStrokeData(character: string): Promise<CharacterJson> {
  const load = strokeModules[`../data/strokes/${character}.json`]

  if (!load) {
    throw new Error(`No stroke template is available for ${character} yet.`)
  }

  const data = await load()

  if (
    !Array.isArray(data.strokes) ||
    data.strokes.length === 0 ||
    !data.strokes.every((stroke) => typeof stroke === 'string') ||
    !Array.isArray(data.medians) ||
    data.medians.length !== data.strokes.length ||
    !data.medians.every((median) =>
      Array.isArray(median) && median.length >= 2 && median.every((point) =>
        Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
      ),
    )
  ) {
    throw new Error(`The stroke template for ${character} is invalid.`)
  }

  return data
}

type BoundPointerEvent = {
  getPoint: () => Point
  preventDefault: () => void
}

const svgNamespace = 'http://www.w3.org/2000/svg'

// Hanzi Writer has no public destroy method. A custom render target owns its
// pointer listeners, so unmounting a lesson can remove all of them reliably.
class WritingRenderTarget {
  node: SVGSVGElement | SVGGElement
  svg: SVGSVGElement | SVGGElement
  defs: SVGDefsElement
  private controller: AbortController
  private activePointer: number | null = null

  constructor(
    svg: SVGSVGElement | SVGGElement,
    defs: SVGDefsElement,
    controller: AbortController,
  ) {
    this.node = svg
    this.svg = svg
    this.defs = defs
    this.controller = controller
  }

  createSubRenderTarget() {
    const group = document.createElementNS(svgNamespace, 'g')
    this.svg.appendChild(group)
    return new WritingRenderTarget(group, this.defs, this.controller)
  }

  getBoundingClientRect() {
    return this.node.getBoundingClientRect()
  }

  updateDimensions(width: string | number, height: string | number) {
    this.node.setAttribute('width', String(width))
    this.node.setAttribute('height', String(height))
  }

  private point(clientX: number, clientY: number): Point {
    const svg = this.node instanceof SVGSVGElement
      ? this.node
      : this.node.ownerSVGElement
    const matrix = svg?.getScreenCTM()

    if (matrix) {
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
      return { x: point.x, y: point.y }
    }

    const rectangle = this.getBoundingClientRect()
    return { x: clientX - rectangle.left, y: clientY - rectangle.top }
  }

  _getMousePoint(event: MouseEvent): Point {
    return this.point(event.clientX, event.clientY)
  }

  _getTouchPoint(event: TouchEvent): Point {
    const touch = event.touches[0]
    return touch ? this.point(touch.clientX, touch.clientY) : { x: 0, y: 0 }
  }

  _eventify<TEvent extends Event>(event: TEvent, point: (event: TEvent) => Point) {
    return {
      getPoint: () => point(event),
      preventDefault: () => event.preventDefault(),
    }
  }

  addPointerStartListener(callback: (event: BoundPointerEvent) => void) {
    this.node.addEventListener('pointerdown', (event) => {
      if (!(event instanceof PointerEvent)) return
      if (!event.isPrimary || event.button !== 0 || this.activePointer !== null) return
      this.activePointer = event.pointerId
      this.node.setPointerCapture(event.pointerId)
      callback(this._eventify(event, (pointer) => this.point(pointer.clientX, pointer.clientY)))
    }, { signal: this.controller.signal })
  }

  addPointerMoveListener(callback: (event: BoundPointerEvent) => void) {
    this.node.addEventListener('pointermove', (event) => {
      if (!(event instanceof PointerEvent)) return
      if (event.pointerId !== this.activePointer) return
      callback(this._eventify(event, (pointer) => this.point(pointer.clientX, pointer.clientY)))
    }, { signal: this.controller.signal })
  }

  addPointerEndListener(callback: () => void) {
    const finish = (event: Event) => {
      if (!(event instanceof PointerEvent)) return
      if (event.pointerId !== this.activePointer) return
      this.activePointer = null
      callback()
    }

    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.node.addEventListener(type, finish, { signal: this.controller.signal })
    }
  }
}

export function createWritingTarget(host: HTMLDivElement) {
  const controller = new AbortController()
  const svg = document.createElementNS(svgNamespace, 'svg')
  svg.style.touchAction = 'none'
  svg.setAttribute('aria-hidden', 'true')
  const defs = document.createElementNS(svgNamespace, 'defs')
  svg.appendChild(defs)

  const createRenderTarget: RenderTargetInitFunction<HTMLElement | SVGElement> = (_element, width = 320, height = 320) => {
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    host.appendChild(svg)
    return new WritingRenderTarget(svg, defs, controller)
  }

  return {
    createRenderTarget,
    dispose() {
      controller.abort()
      svg.remove()
    },
  }
}

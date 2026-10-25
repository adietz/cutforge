import paper from 'paper'
import type { PagePreset } from '../types'
import { PX_PER_MM } from '../types'

void paper

export interface DxfExportOptions {
  /** Max chord error in mm for curve flattening (default 0.1) */
  chordalMm?: number
  /** Skip locked items (default true) */
  excludeLocked?: boolean
}

/**
 * ASCII DXF for laser cutters (mm).
 * Coordinate system: origin at bottom-left of the page, Y increases upward (Y-up).
 * Curves (ellipses, arcs, beziers) are approximated as dense LWPOLYLINE segments.
 * Layers: CUT / SCORE / ENGRAVE.
 */
export function exportDxf(
  items: paper.Item[],
  page: PagePreset,
  options: DxfExportOptions = {},
): string {
  const h = page.heightMm
  const chordalPx = (options.chordalMm ?? 0.1) * PX_PER_MM
  const lines: string[] = []

  const push = (code: number | string, value: string | number) => {
    lines.push(String(code), String(value))
  }

  push(0, 'SECTION')
  push(2, 'HEADER')
  push(9, '$INSUNITS')
  push(70, 4)
  push(9, '$EXTMIN')
  push(10, 0)
  push(20, 0)
  push(9, '$EXTMAX')
  push(10, page.widthMm)
  push(20, page.heightMm)
  push(0, 'ENDSEC')

  push(0, 'SECTION')
  push(2, 'TABLES')
  push(0, 'TABLE')
  push(2, 'LAYER')
  push(70, 3)
  for (const [name, color] of [
    ['CUT', 1],
    ['SCORE', 2],
    ['ENGRAVE', 5],
  ] as const) {
    push(0, 'LAYER')
    push(2, name)
    push(70, 0)
    push(62, color)
    push(6, 'CONTINUOUS')
  }
  push(0, 'ENDTAB')
  push(0, 'ENDSEC')

  push(0, 'SECTION')
  push(2, 'ENTITIES')

  const skipLocked = options.excludeLocked !== false

  const walk = (item: paper.Item) => {
    if (!item.visible) return
    if (skipLocked && item.data?.locked) return
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) return
    const cutType = ((item.data?.cutType as string) || 'cut').toUpperCase()
    const layer =
      cutType === 'SCORE' ? 'SCORE' : cutType === 'ENGRAVE' ? 'ENGRAVE' : 'CUT'

    if (item.className === 'Path') {
      emitPath(item as paper.Path, layer, h, chordalPx, push)
    } else if (item.className === 'CompoundPath') {
      for (const child of (item as paper.CompoundPath).children) {
        if (child.className === 'Path')
          emitPath(child as paper.Path, layer, h, chordalPx, push)
      }
    } else if (item.className === 'PointText') {
      const t = item as paper.PointText
      // Approximate text as a closed rectangle outline for cutters that ignore TEXT
      const b = t.bounds
      const rect = [
        { x: b.left / PX_PER_MM, y: h - b.top / PX_PER_MM },
        { x: b.right / PX_PER_MM, y: h - b.top / PX_PER_MM },
        { x: b.right / PX_PER_MM, y: h - b.bottom / PX_PER_MM },
        { x: b.left / PX_PER_MM, y: h - b.bottom / PX_PER_MM },
      ]
      push(0, 'LWPOLYLINE')
      push(8, layer)
      push(90, 4)
      push(70, 1)
      for (const p of rect) {
        push(10, round(p.x))
        push(20, round(p.y))
      }
      push(0, 'TEXT')
      push(8, layer)
      push(10, round(t.point.x / PX_PER_MM))
      push(20, round(h - t.point.y / PX_PER_MM))
      push(40, round(Number(t.fontSize) / PX_PER_MM))
      push(1, t.content)
    } else if (item.children?.length) {
      for (const c of item.children) walk(c)
    }
  }

  for (const item of items) walk(item)

  push(0, 'ENDSEC')
  push(0, 'EOF')
  return lines.join('\n')
}

function emitPath(
  path: paper.Path,
  layer: string,
  pageHeightMm: number,
  chordalPx: number,
  push: (code: number | string, value: string | number) => void,
): void {
  const pts = samplePathPoints(path, pageHeightMm, chordalPx)
  if (pts.length < 2) return

  push(0, 'LWPOLYLINE')
  push(8, layer)
  push(90, pts.length)
  push(70, path.closed ? 1 : 0)
  for (const p of pts) {
    push(10, round(p.x))
    push(20, round(p.y))
  }
}

/** Adaptive sampling by path length and chordal tolerance. */
function samplePathPoints(
  path: paper.Path,
  pageHeightMm: number,
  chordalPx: number,
): { x: number; y: number }[] {
  const len = path.length
  const pts: { x: number; y: number }[] = []
  const toMm = (p: paper.Point) => ({
    x: p.x / PX_PER_MM,
    y: pageHeightMm - p.y / PX_PER_MM,
  })

  if (len === 0 && path.segments.length) {
    for (const s of path.segments) pts.push(toMm(s.point))
    return pts
  }

  // Densify: at least 8 pts for ellipses/circles, scale with length
  const minStep = Math.max(0.5, chordalPx)
  const n = Math.max(8, Math.ceil(len / minStep))
  for (let i = 0; i <= n; i++) {
    const p = path.getPointAt((i / n) * len)
    if (!p) continue
    const m = toMm(p)
    const last = pts[pts.length - 1]
    if (last && Math.hypot(last.x - m.x, last.y - m.y) < 1e-4) continue
    pts.push(m)
  }
  if (path.closed && pts.length > 2) {
    const f = pts[0]
    const l = pts[pts.length - 1]
    if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-3) pts.pop()
  }
  return pts
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

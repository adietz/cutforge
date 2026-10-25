import paper from 'paper'

void paper
import type { PagePreset } from '../types'
import { PX_PER_MM } from '../types'

/**
 * Minimal ASCII DXF for laser cutters.
 * Coordinates in millimeters. Y flipped (CAD origin bottom-left).
 */
export function exportDxf(project: paper.Project, page: PagePreset): string {
  const h = page.heightMm
  const lines: string[] = []

  const push = (code: number | string, value: string | number) => {
    lines.push(String(code), String(value))
  }

  push(0, 'SECTION')
  push(2, 'HEADER')
  push(9, '$INSUNITS')
  push(70, 4) // millimeters
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

  for (const item of project.activeLayer.children) {
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) continue
    const cutType = ((item.data?.cutType as string) || 'cut').toUpperCase()
    const layer =
      cutType === 'SCORE' ? 'SCORE' : cutType === 'ENGRAVE' ? 'ENGRAVE' : 'CUT'

    if (item.className === 'Path') {
      emitPath(item as paper.Path, layer, h, push)
    } else if (item.className === 'CompoundPath') {
      for (const child of (item as paper.CompoundPath).children) {
        if (child.className === 'Path') emitPath(child as paper.Path, layer, h, push)
      }
    } else if (item.className === 'PointText') {
      const t = item as paper.PointText
      const x = t.point.x / PX_PER_MM
      const y = h - t.point.y / PX_PER_MM
      push(0, 'TEXT')
      push(8, layer)
      push(10, round(x))
      push(20, round(y))
      push(40, round(Number(t.fontSize) / PX_PER_MM))
      push(1, t.content)
    }
  }

  push(0, 'ENDSEC')
  push(0, 'EOF')
  return lines.join('\n')
}

function emitPath(
  path: paper.Path,
  layer: string,
  pageHeightMm: number,
  push: (code: number | string, value: string | number) => void,
): void {
  const pts = samplePathPoints(path, pageHeightMm)
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

function samplePathPoints(
  path: paper.Path,
  pageHeightMm: number,
  stepPx = 2,
): { x: number; y: number }[] {
  const len = path.length
  const pts: { x: number; y: number }[] = []
  if (len === 0 && path.segments.length) {
    for (const s of path.segments) {
      pts.push({
        x: s.point.x / PX_PER_MM,
        y: pageHeightMm - s.point.y / PX_PER_MM,
      })
    }
    return pts
  }
  const n = Math.max(2, Math.ceil(len / stepPx))
  for (let i = 0; i <= n; i++) {
    const p = path.getPointAt((i / n) * len)
    if (!p) continue
    pts.push({
      x: p.x / PX_PER_MM,
      y: pageHeightMm - p.y / PX_PER_MM,
    })
  }
  return pts
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

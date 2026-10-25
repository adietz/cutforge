import paper from 'paper'
import { PX_PER_MM } from '../types'
import type { SnapSettings } from '../types'

export interface SnapResult {
  point: paper.Point
  guideX: number | null
  guideY: number | null
  snapped: boolean
}

function collectAnchors(
  items: paper.Item[],
  exclude: Set<string>,
): { x: number[]; y: number[]; points: paper.Point[] } {
  const xs: number[] = []
  const ys: number[] = []
  const points: paper.Point[] = []
  for (const item of items) {
    if (!item.visible || exclude.has(String(item.data?.cfId))) continue
    const b = item.bounds
    xs.push(b.left, b.center.x, b.right)
    ys.push(b.top, b.center.y, b.bottom)
    points.push(b.topLeft, b.topRight, b.bottomLeft, b.bottomRight, b.center)
    if (item instanceof paper.Path) {
      for (const seg of item.segments) {
        points.push(seg.point.clone())
        xs.push(seg.point.x)
        ys.push(seg.point.y)
      }
    }
  }
  return { x: xs, y: ys, points }
}

/**
 * Snap a project-space point to grid, endpoints/edges, and smart-guide axes.
 */
export function snapPoint(
  raw: paper.Point,
  settings: SnapSettings,
  docItems: paper.Item[],
  excludeIds: string[],
  tolerancePx: number,
): SnapResult {
  let x = raw.x
  let y = raw.y
  let guideX: number | null = null
  let guideY: number | null = null
  let snapped = false
  const exclude = new Set(excludeIds)
  const tol = tolerancePx

  if (settings.grid) {
    const step = settings.gridMm * PX_PER_MM
    if (step > 0) {
      const gx = Math.round(x / step) * step
      const gy = Math.round(y / step) * step
      if (Math.abs(gx - x) <= tol) {
        x = gx
        snapped = true
      }
      if (Math.abs(gy - y) <= tol) {
        y = gy
        snapped = true
      }
    }
  }

  if (settings.edges || settings.smartGuides) {
    const anchors = collectAnchors(docItems, exclude)
    if (settings.edges) {
      let best = tol + 1
      let bestPt: paper.Point | null = null
      for (const p of anchors.points) {
        const d = p.getDistance(new paper.Point(x, y))
        if (d < best) {
          best = d
          bestPt = p
        }
      }
      if (bestPt && best <= tol) {
        x = bestPt.x
        y = bestPt.y
        snapped = true
      }
    }
    if (settings.smartGuides) {
      let bestDx = tol + 1
      let bestDy = tol + 1
      for (const ax of anchors.x) {
        const d = Math.abs(ax - x)
        if (d < bestDx) {
          bestDx = d
          guideX = ax
        }
      }
      for (const ay of anchors.y) {
        const d = Math.abs(ay - y)
        if (d < bestDy) {
          bestDy = d
          guideY = ay
        }
      }
      if (bestDx <= tol && guideX != null) {
        x = guideX
        snapped = true
      } else guideX = null
      if (bestDy <= tol && guideY != null) {
        y = guideY
        snapped = true
      } else guideY = null
    }
  }

  return { point: new paper.Point(x, y), guideX, guideY, snapped }
}

/** Snap a translation delta so selection edges align to anchors. */
export function snapDelta(
  delta: paper.Point,
  selectionBounds: paper.Rectangle,
  settings: SnapSettings,
  docItems: paper.Item[],
  excludeIds: string[],
  tolerancePx: number,
): SnapResult {
  const moved = selectionBounds.clone()
  moved.x += delta.x
  moved.y += delta.y
  const corners = [
    moved.topLeft,
    moved.topRight,
    moved.bottomLeft,
    moved.bottomRight,
    moved.center,
  ]
  // Try snapping each corner; pick strongest
  let best = delta.clone()
  let guideX: number | null = null
  let guideY: number | null = null
  let snapped = false
  for (const c of corners) {
    const r = snapPoint(c, settings, docItems, excludeIds, tolerancePx)
    if (r.snapped) {
      const nd = delta.add(r.point.subtract(c))
      best = nd
      guideX = r.guideX
      guideY = r.guideY
      snapped = true
      break
    }
  }
  // Also try grid on the delta itself via center
  if (settings.grid && !snapped) {
    const r = snapPoint(moved.center, settings, docItems, excludeIds, tolerancePx)
    if (r.snapped) {
      best = delta.add(r.point.subtract(moved.center))
      snapped = true
      guideX = r.guideX
      guideY = r.guideY
    }
  }
  return { point: best, guideX, guideY, snapped }
}

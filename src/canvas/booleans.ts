import paper from 'paper'
import ClipperLib from 'clipper-lib'
import type { BooleanOp } from '../types'

void paper

type IntPoint = { X: number; Y: number }

/** Clipper integer scale — ~0.001 px resolution */
const CLIP_SCALE = 1000

function asPathItem(item: paper.Item): paper.PathItem | null {
  if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
    return item
  }
  return null
}

function ensureClosed(path: paper.PathItem): boolean {
  if (path instanceof paper.Path) return path.closed
  if (path instanceof paper.CompoundPath) {
    return path.children.every((c) => !(c instanceof paper.Path) || c.closed)
  }
  return false
}

function isEmptyPath(path: paper.PathItem): boolean {
  if (path instanceof paper.Path) return path.segments.length === 0
  if (path instanceof paper.CompoundPath) return path.children.length === 0
  return path.bounds.width === 0 && path.bounds.height === 0
}

/**
 * Boolean ops on two+ closed paths. First selected is the subject for subtract.
 */
export function booleanOperate(
  items: paper.Item[],
  op: BooleanOp,
): paper.PathItem | null {
  const paths = items.map(asPathItem).filter(Boolean) as paper.PathItem[]
  if (paths.length < 2) return null
  if (!paths.every(ensureClosed)) return null

  let result: paper.PathItem | null = paths[0].clone({
    insert: false,
  }) as paper.PathItem
  for (let i = 1; i < paths.length; i++) {
    const other = paths[i]
    let next: paper.PathItem | null = null
    if (op === 'unite') next = result.unite(other)
    else if (op === 'subtract') next = result.subtract(other)
    else next = result.intersect(other)
    result.remove()
    if (!next || isEmptyPath(next)) {
      next?.remove()
      return null
    }
    result = next
  }
  return result
}

/** Sample a Paper path into a Clipper polygon (closed). */
function pathToClipper(path: paper.Path): IntPoint[] {
  const pts: IntPoint[] = []
  const len = path.length
  if (len === 0 && path.segments.length) {
    for (const s of path.segments) {
      pts.push({
        X: Math.round(s.point.x * CLIP_SCALE),
        Y: Math.round(s.point.y * CLIP_SCALE),
      })
    }
  } else {
    // Adaptive sampling — denser on curves
    const step = Math.max(0.4, len / 250)
    const n = Math.max(8, Math.ceil(len / step))
    for (let i = 0; i < n; i++) {
      const pt = path.getPointAt((i / n) * len)
      if (!pt) continue
      pts.push({
        X: Math.round(pt.x * CLIP_SCALE),
        Y: Math.round(pt.y * CLIP_SCALE),
      })
    }
  }
  // Drop near-duplicates
  const cleaned: IntPoint[] = []
  for (const p of pts) {
    const last = cleaned[cleaned.length - 1]
    if (last && last.X === p.X && last.Y === p.Y) continue
    cleaned.push(p)
  }
  if (
    cleaned.length > 2 &&
    cleaned[0].X === cleaned[cleaned.length - 1].X &&
    cleaned[0].Y === cleaned[cleaned.length - 1].Y
  ) {
    cleaned.pop()
  }
  return cleaned
}

function clipperToPath(poly: IntPoint[]): paper.Path {
  const path = new paper.Path({ insert: false })
  if (!poly.length) return path
  path.moveTo(
    new paper.Point(poly[0].X / CLIP_SCALE, poly[0].Y / CLIP_SCALE),
  )
  for (let i = 1; i < poly.length; i++) {
    path.lineTo(
      new paper.Point(poly[i].X / CLIP_SCALE, poly[i].Y / CLIP_SCALE),
    )
  }
  path.closePath()
  path.simplify(0.15)
  return path
}

/**
 * True parallel kerf offset via Clipper (Angus Johnson).
 * Positive = outset (expand), negative = inset (shrink). Units: document pixels.
 */
export function offsetPath(
  item: paper.Item,
  offsetPx: number,
): paper.PathItem | null {
  const path = asPathItem(item)
  if (!path || !ensureClosed(path)) return null
  if (Math.abs(offsetPx) < 1e-6) {
    return path.clone({ insert: false }) as paper.PathItem
  }

  const sourcePaths: paper.Path[] =
    path instanceof paper.CompoundPath
      ? (path.children.filter((c) => c instanceof paper.Path) as paper.Path[])
      : [path as paper.Path]

  const clipPaths: IntPoint[][] = []
  for (const sp of sourcePaths) {
    if (!sp.closed || sp.segments.length < 2) continue
    const poly = pathToClipper(sp)
    if (poly.length >= 3) clipPaths.push(poly)
  }
  if (!clipPaths.length) return null

  const co = new ClipperLib.ClipperOffset(2.0, 0.25 * CLIP_SCALE)
  co.AddPaths(
    clipPaths,
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon,
  )
  const solution: IntPoint[][] = []
  co.Execute(solution, offsetPx * CLIP_SCALE)

  if (!solution.length) return null

  const paperPaths = solution
    .filter((poly) => poly.length >= 3)
    .map((poly) => clipperToPath(poly))
  if (!paperPaths.length) return null

  if (paperPaths.length === 1) return paperPaths[0]
  return new paper.CompoundPath({
    children: paperPaths,
    insert: false,
  })
}

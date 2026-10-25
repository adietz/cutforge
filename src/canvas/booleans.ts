import paper from 'paper'
import type { BooleanOp } from '../types'

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

/**
 * Kerf-style offset via scale-about-center (not a true parallel curve).
 * Positive = outset, negative = inset.
 */
export function offsetPath(
  item: paper.Item,
  offsetPx: number,
): paper.PathItem | null {
  const path = asPathItem(item)
  if (!path || !ensureClosed(path)) return null
  const clone = path.clone({ insert: false }) as paper.PathItem
  const b = clone.bounds
  const rx = b.width / 2
  const ry = b.height / 2
  const r = Math.max(1, (rx + ry) / 2)
  const factor = Math.max(0.05, (r + offsetPx) / r)
  clone.scale(factor, b.center)
  return clone
}

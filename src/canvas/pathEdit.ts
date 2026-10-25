/** Path / node editing helpers (CorelDRAW Shape-tool inspired, Paper.js). */

export function collectPaths(item: paper.Item): paper.Path[] {
  if (item instanceof paper.Path) return [item]
  if (item instanceof paper.CompoundPath) {
    return item.children.filter((c): c is paper.Path => c instanceof paper.Path)
  }
  return []
}

export function isPathLike(item: paper.Item): boolean {
  return item instanceof paper.Path || item instanceof paper.CompoundPath
}

export interface NearestCurveHit {
  root: paper.Item
  path: paper.Path
  curve: paper.Curve
  location: paper.CurveLocation
  distance: number
}

export interface NodeRef {
  path: paper.Path
  index: number
}

export function findNearestCurve(
  roots: paper.Item[],
  point: paper.Point,
  maxDist: number,
  isEditable: (item: paper.Item) => boolean,
): NearestCurveHit | null {
  let best: NearestCurveHit | null = null
  for (const root of roots) {
    if (!isEditable(root)) continue
    for (const path of collectPaths(root)) {
      if (path.segments.length < 2 || !path.curves.length) continue
      const loc = path.getNearestLocation(point)
      if (!loc?.curve) continue
      const distance = point.getDistance(loc.point)
      if (distance > maxDist) continue
      if (!best || distance < best.distance) {
        best = { root, path, curve: loc.curve, location: loc, distance }
      }
    }
  }
  return best
}

export function findNearestNode(
  roots: paper.Item[],
  point: paper.Point,
  maxDist: number,
  isEditable: (item: paper.Item) => boolean,
): { root: paper.Item; ref: NodeRef; distance: number } | null {
  let best: { root: paper.Item; ref: NodeRef; distance: number } | null = null
  for (const root of roots) {
    if (!isEditable(root)) continue
    for (const path of collectPaths(root)) {
      path.segments.forEach((seg, index) => {
        const distance = point.getDistance(seg.point)
        if (distance > maxDist) return
        if (!best || distance < best.distance) {
          best = { root, ref: { path, index }, distance }
        }
      })
    }
  }
  return best
}

/** Corel-like: insert node at the nearest point on the segment (not only midpoint). */
export function insertNodeAtClick(
  curve: paper.Curve,
  click: paper.Point,
): paper.Segment | null {
  const path = curve.path
  if (!path) return null
  const loc = curve.getNearestLocation(click)
  if (!loc) return null

  const linear =
    typeof curve.isLinear === 'function'
      ? curve.isLinear()
      : curve.handle1.length < 1e-6 && curve.handle2.length < 1e-6

  if (linear) {
    const mid = loc.point.clone()
    return path.insert(curve.segment1.index + 1, mid)
  }
  // Preserve bezier: split at hit parameter
  const divided = path.divideAt(loc) as paper.Segment | paper.Path | null
  if (divided && (divided as paper.Segment).point) {
    return divided as paper.Segment
  }
  return path.insert(curve.segment1.index + 1, loc.point.clone())
}

/** Midpoint insert (Andy’s first ask) — chord mid for linear, t=0.5 for curves. */
export function insertMidpointOnCurve(curve: paper.Curve): paper.Segment | null {
  const path = curve.path
  if (!path) return null
  const linear =
    typeof curve.isLinear === 'function'
      ? curve.isLinear()
      : curve.handle1.length < 1e-6 && curve.handle2.length < 1e-6
  if (linear) {
    const mid = curve.point1.add(curve.point2).multiply(0.5)
    return path.insert(curve.segment1.index + 1, mid)
  }
  if (typeof curve.divideAtTime === 'function') {
    const d = curve.divideAtTime(0.5) as unknown
    if (d && (d as paper.Segment).point) return d as paper.Segment
  }
  const loc = curve.getLocationAtTime?.(0.5)
  if (loc) {
    const d = path.divideAt(loc) as unknown
    if (d && (d as paper.Segment).point) return d as paper.Segment
  }
  const mid = curve.point1.add(curve.point2).multiply(0.5)
  return path.insert(curve.segment1.index + 1, mid)
}

export function deleteNodes(refs: NodeRef[]): boolean {
  if (!refs.length) return false
  // Group by path; delete high indices first
  const byPath = new Map<paper.Path, number[]>()
  for (const r of refs) {
    const list = byPath.get(r.path) || []
    list.push(r.index)
    byPath.set(r.path, list)
  }
  let changed = false
  for (const [path, indices] of byPath) {
    const uniq = [...new Set(indices)].sort((a, b) => b - a)
    const minKeep = path.closed ? 3 : 2
    for (const i of uniq) {
      if (path.segments.length <= minKeep) break
      if (i < 0 || i >= path.segments.length) continue
      path.removeSegment(i)
      changed = true
    }
  }
  return changed
}

/** Break open the path at a node (Corel Break curve). Closed → open at node; open → split into two paths. */
export function breakAtNode(
  path: paper.Path,
  index: number,
): paper.Path | null {
  if (index < 0 || index >= path.segments.length) return null
  if (path.closed) {
    const segs = path.segments.map((s) => s.clone())
    const rotated = [...segs.slice(index), ...segs.slice(0, index)]
    path.removeSegments()
    for (const s of rotated) path.add(s)
    path.closed = false
    return null
  }
  // Open path: split into two (node becomes end of first + start of second)
  if (path.segments.length < 3) return null
  if (index === 0 || index === path.segments.length - 1) return null
  const left = path.segments.slice(0, index + 1).map((s) => s.clone())
  const right = path.segments.slice(index).map((s) => s.clone())
  path.removeSegments()
  for (const s of left) path.add(s)
  path.closed = false
  const other = new paper.Path()
  for (const s of right) other.add(s)
  other.closed = false
  return other
}

/** Join two open endpoints if within `maxDist`. Mutates `a`, removes `b` if joined. */
export function joinOpenEndpoints(
  a: paper.Path,
  b: paper.Path,
  maxDist: number,
): boolean {
  if (a.closed || b.closed) return false
  if (a.segments.length < 2 || b.segments.length < 2) return false
  const a0 = a.firstSegment.point
  const a1 = a.lastSegment.point
  const b0 = b.firstSegment.point
  const b1 = b.lastSegment.point
  type Pair = [paper.Point, paper.Point, 'a-start' | 'a-end', 'b-start' | 'b-end']
  const pairs: Pair[] = [
    [a0, b0, 'a-start', 'b-start'],
    [a0, b1, 'a-start', 'b-end'],
    [a1, b0, 'a-end', 'b-start'],
    [a1, b1, 'a-end', 'b-end'],
  ]
  let best: Pair | null = null
  let bestD = maxDist
  for (const p of pairs) {
    const d = p[0].getDistance(p[1])
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  if (!best) return false
  const [, , ae, be] = best
  // Orient b so we append/prepend cleanly
  if (ae === 'a-end' && be === 'b-start') {
    // append b to a
  } else if (ae === 'a-end' && be === 'b-end') {
    b.reverse()
  } else if (ae === 'a-start' && be === 'b-end') {
    // prepend reversed... easier: reverse a, append
    a.reverse()
  } else if (ae === 'a-start' && be === 'b-start') {
    a.reverse()
    b.reverse()
  }
  // Snap join point
  a.lastSegment.point = b.firstSegment.point.clone()
  const segs = b.segments.slice(1).map((s) => s.clone())
  for (const s of segs) a.add(s)
  b.remove()
  return true
}

export function segmentsToLine(refs: NodeRef[]): boolean {
  // Convert curves adjacent to selected nodes to linear (clear handles)
  let changed = false
  for (const { path, index } of refs) {
    const seg = path.segments[index]
    if (!seg) continue
    if (seg.handleIn.length > 0 || seg.handleOut.length > 0) {
      seg.handleIn = new paper.Point(0, 0)
      seg.handleOut = new paper.Point(0, 0)
      changed = true
    }
    // Also clear neighbor handles that affect adjoining curves
    const prev = seg.previous
    if (prev && prev.handleOut.length > 0) {
      prev.handleOut = new paper.Point(0, 0)
      changed = true
    }
    const next = seg.next
    if (next && next.handleIn.length > 0) {
      next.handleIn = new paper.Point(0, 0)
      changed = true
    }
  }
  return changed
}

export function segmentsToCurve(refs: NodeRef[]): boolean {
  let changed = false
  for (const { path, index } of refs) {
    const seg = path.segments[index]
    if (!seg) continue
    // Create smooth handles if flat
    if (seg.handleIn.length < 1e-6 && seg.handleOut.length < 1e-6) {
      try {
        seg.smooth()
        changed = true
      } catch {
        const prev = seg.previous?.point
        const next = seg.next?.point
        if (prev && next) {
          const t = next.subtract(prev).multiply(0.25)
          seg.handleIn = t.multiply(-1)
          seg.handleOut = t
          changed = true
        }
      }
    } else {
      try {
        seg.smooth()
        changed = true
      } catch {
        /* */
      }
    }
  }
  return changed
}

/** Cusp: independent handles (zero them for hard corner). */
export function nodesToCusp(refs: NodeRef[]): boolean {
  let changed = false
  for (const { path, index } of refs) {
    const seg = path.segments[index]
    if (!seg) continue
    if (seg.handleIn.length > 0 || seg.handleOut.length > 0) {
      seg.handleIn = new paper.Point(0, 0)
      seg.handleOut = new paper.Point(0, 0)
      changed = true
    }
  }
  return changed
}

export function nodesToSmooth(refs: NodeRef[]): boolean {
  return segmentsToCurve(refs)
}

export function nodeKey(ref: NodeRef): string {
  return `${(ref.path as unknown as { id?: number }).id ?? ref.path.data?.cfId ?? 'p'}:${ref.index}`
}


/** Greedy end-to-end join of open paths within maxDist (project units). Mutates list; returns survivor paths. */
export function joinOpenPathChain(
  paths: paper.Path[],
  maxDist: number,
): { joined: paper.Path[]; mergeCount: number } {
  const open = paths.filter((p) => !p.closed && p.segments.length >= 2)
  if (open.length < 2) return { joined: open, mergeCount: 0 }
  let mergeCount = 0
  const live = [...open]
  let changed = true
  while (changed && live.length > 1) {
    changed = false
    outer: for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]
        const b = live[j]
        if (joinOpenEndpoints(a, b, maxDist)) {
          live.splice(j, 1)
          mergeCount++
          changed = true
          break outer
        }
      }
    }
  }
  return { joined: live, mergeCount }
}

/**
 * Bounding-box shelf nesting with optional 90° rotations.
 * Limits: no arbitrary-angle nesting, no true NFP / shape interlocking —
 * packs axis-aligned AABBs only (practical for laser/vinyl sheets).
 */

export interface NestPart {
  id: string
  width: number
  height: number
}

export interface NestPlacement {
  id: string
  /** Top-left of placed AABB relative to bin origin */
  x: number
  y: number
  rotated: boolean
}

export interface NestPackResult {
  placements: NestPlacement[]
  failedIds: string[]
}

export interface NestPackOptions {
  binWidth: number
  binHeight: number
  gap: number
  allowRotate90?: boolean
}

interface Orient {
  w: number
  h: number
  rotated: boolean
}

/**
 * First-fit decreasing shelf packer.
 * Tallest-first; fills left→right on a shelf, then opens a new shelf below.
 */
export function packShelf(
  parts: NestPart[],
  opts: NestPackOptions,
): NestPackResult {
  const gap = Math.max(0, opts.gap)
  const allowRot = opts.allowRotate90 !== false
  const binW = opts.binWidth
  const binH = opts.binHeight

  const sorted = [...parts].sort(
    (a, b) =>
      Math.max(b.width, b.height) - Math.max(a.width, a.height) ||
      b.width * b.height - a.width * a.height,
  )

  const placements: NestPlacement[] = []
  const failedIds: string[] = []

  let shelfY = 0
  let shelfH = 0
  let cursorX = 0
  let shelfOpen = false

  const orientsFor = (p: NestPart): Orient[] => {
    const w = Math.max(0.01, p.width)
    const h = Math.max(0.01, p.height)
    const list: Orient[] = [{ w, h, rotated: false }]
    if (allowRot && Math.abs(w - h) > 1e-3) {
      list.push({ w: h, h: w, rotated: true })
    }
    // Prefer wider-on-bottom for shelf stability when both fit equally — keep 0° first
    return list
  }

  const fitsInBin = (o: Orient) => o.w <= binW + 1e-6 && o.h <= binH + 1e-6

  const openShelf = (y: number) => {
    shelfY = y
    shelfH = 0
    cursorX = 0
    shelfOpen = true
  }

  for (const part of sorted) {
    const orients = orientsFor(part).filter(fitsInBin)
    if (!orients.length) {
      failedIds.push(part.id)
      continue
    }

    let placed: NestPlacement | null = null

    // Try current shelf
    if (shelfOpen) {
      for (const o of orients) {
        const x = cursorX === 0 ? 0 : cursorX + gap
        const nextH = Math.max(shelfH, o.h)
        if (x + o.w <= binW + 1e-6 && shelfY + nextH <= binH + 1e-6) {
          placed = { id: part.id, x, y: shelfY, rotated: o.rotated }
          cursorX = x + o.w
          shelfH = nextH
          break
        }
      }
    }

    // New shelf
    if (!placed) {
      const y = shelfOpen && shelfH > 0 ? shelfY + shelfH + gap : 0
      for (const o of orients) {
        if (y + o.h <= binH + 1e-6 && o.w <= binW + 1e-6) {
          openShelf(y)
          placed = { id: part.id, x: 0, y, rotated: o.rotated }
          cursorX = o.w
          shelfH = o.h
          break
        }
      }
    }

    if (placed) placements.push(placed)
    else failedIds.push(part.id)
  }

  return { placements, failedIds }
}

import paper from 'paper'
import type { CutType, PagePreset } from '../types'
import { PX_PER_MM } from '../types'
import type { SilhouettePresets } from './presets'

void paper

const ETX = '\x03'
/** 1 mm = 20 Silhouette Units */
const MM_TO_SU = 20

export interface GpglJob {
  /** Full command stream ready to send (ETX-delimited). */
  bytes: string
  /** Human-readable preview (ETX shown as ¦). */
  preview: string
  pathCount: number
  deviceHint: string
}

/**
 * Build Graphtec GPGL for Silhouette Cameo / Portrait.
 * Coordinate system matches SVG/Inkscape: origin top-left, X right, Y down (mm).
 * CutForge canvas uses the same Y-down layout — no flip needed for GPGL M/D
 * (Graphtec plot uses M y,x / D y,x with carriage/roller swap per inkscape-silhouette).
 *
 * Mapping:
 * - Cut → blade (pressure/speed from cut preset)
 * - Score → lighter blade pressure
 * - Engrave → pen/draw mode (FC0) for sketch fills as outlines
 */
export function generateGpgl(
  items: paper.Item[],
  page: PagePreset,
  presets: SilhouettePresets,
): GpglJob {
  const cmds: string[] = []
  const flat = flattenByType(items)

  // Init sequence (simplified from inkscape-silhouette / robocut)
  cmds.push('\x1b\x04') // ESC EOT initialize
  cmds.push(`FW${presets.media}`)
  cmds.push('FN0')
  cmds.push('TB50,0') // portrait orientation
  cmds.push(`\\0,0`)
  cmds.push(`Z${su(page.heightMm)},${su(page.widthMm)}`)
  cmds.push('L0')
  cmds.push('FE0,0')
  cmds.push('FF0,0,0')

  let pathCount = 0

  const emitGroup = (
    label: string,
    list: paper.Item[],
    pressure: number,
    speed: number,
    pen: boolean,
  ) => {
    if (!list.length) return
    cmds.push(`;${label}`)
    cmds.push(`!${clamp(speed, 1, 10)}`)
    cmds.push(`FX${clamp(pressure, 1, 33)}`)
    cmds.push(pen ? 'FC0' : 'FC18')
    for (const item of list) {
      for (const path of pathsOf(item)) {
        const pts = samplePath(path)
        if (pts.length < 2) continue
        pathCount++
        const p0 = toMm(pts[0])
        // Graphtec: M/D take (y, x) in SU — carriage, roller
        cmds.push(`M${su(p0.y)},${su(p0.x)}`)
        for (let i = 1; i < pts.length; i++) {
          const p = toMm(pts[i])
          cmds.push(`D${su(p.y)},${su(p.x)}`)
        }
        if (path.closed) {
          cmds.push(`D${su(p0.y)},${su(p0.x)}`)
        }
      }
    }
  }

  emitGroup(
    'CUT',
    flat.cut,
    presets.cut.pressure,
    presets.cut.speed,
    presets.cut.tool === 'pen',
  )
  emitGroup(
    'SCORE',
    flat.score,
    presets.score.pressure,
    presets.score.speed,
    presets.score.tool === 'pen',
  )
  emitGroup(
    'ENGRAVE',
    flat.engrave,
    presets.engrave.pressure,
    presets.engrave.speed,
    presets.engrave.tool === 'pen',
  )

  cmds.push('H') // home

  const body = cmds
    .filter((c) => !c.startsWith(';'))
    .map((c) => {
      // Escape sequences (ESC …) are not ETX-terminated
      if (c.charCodeAt(0) === 0x1b) return c
      return c.endsWith(ETX) ? c : c + ETX
    })
    .join('')

  const preview = cmds
    .map((c) => (c.startsWith(';') ? c : c.replace(/\x03/g, '') + '¦'))
    .join('\n')

  return {
    bytes: body,
    preview,
    pathCount,
    deviceHint:
      'Cameo 1–5 / Portrait 1–4 (USB VID 0x0b4d). Based on inkscape-silhouette GPGL.',
  }
}

function flattenByType(items: paper.Item[]): Record<CutType, paper.Item[]> {
  const out: Record<CutType, paper.Item[]> = {
    cut: [],
    score: [],
    engrave: [],
  }
  const walk = (item: paper.Item) => {
    if (!item.visible || item.data?.locked) return
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) return
    if (item.className === 'Path' || item.className === 'CompoundPath') {
      const ct = ((item.data?.cutType as CutType) || 'cut') as CutType
      out[ct === 'score' || ct === 'engrave' ? ct : 'cut'].push(item)
      return
    }
    if (item.children) for (const c of item.children) walk(c)
  }
  for (const i of items) walk(i)
  return out
}

function pathsOf(item: paper.Item): paper.Path[] {
  if (item.className === 'CompoundPath') {
    return (item as paper.CompoundPath).children.filter(
      (c) => c.className === 'Path',
    ) as paper.Path[]
  }
  return [item as paper.Path]
}

function samplePath(path: paper.Path): paper.Point[] {
  const len = path.length
  if (len === 0) return path.segments.map((s) => s.point.clone())
  const step = Math.max(0.4 * PX_PER_MM, len / 160)
  const n = Math.max(2, Math.ceil(len / step))
  const pts: paper.Point[] = []
  for (let i = 0; i <= n; i++) {
    const pt = path.getPointAt((i / n) * len)
    if (pt) pts.push(pt)
  }
  return pts
}

function toMm(pt: paper.Point) {
  return { x: pt.x / PX_PER_MM, y: pt.y / PX_PER_MM }
}

function su(mm: number): number {
  return Math.round(mm * MM_TO_SU)
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

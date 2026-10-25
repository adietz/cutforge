import paper from 'paper'
import type { CutType, PagePreset } from '../types'
import { PX_PER_MM } from '../types'
import type { SilhouettePresets } from './presets'
import { REG_MARK_INSET_MM, REG_MARK_SIZE_MM } from '../canvas/regMarks'

void paper

const ETX = '\x03'
/** 1 mm = 20 Silhouette Units */
const MM_TO_SU = 20

export type RegMarkSeekMode = 'off' | 'auto' | 'manual'

export interface GpglOptions {
  presets: SilhouettePresets
  /** Optical registration before cut (Graphtec TB123 / TB23) */
  regMarkSeek?: RegMarkSeekMode
}

export interface GpglJob {
  /** Full command stream ready to send (ETX-delimited). */
  bytes: string
  /** Human-readable preview (ETX shown as ¦). */
  preview: string
  pathCount: number
  deviceHint: string
  /** True when stream includes sensor seek commands */
  includesRegSeek: boolean
}

/**
 * Build Graphtec GPGL for Silhouette Cameo / Portrait.
 * Origin top-left, Y-down (mm). M/D use (y,x) in SU.
 */
export function generateGpgl(
  items: paper.Item[],
  page: PagePreset,
  presetsOrOpts: SilhouettePresets | GpglOptions,
): GpglJob {
  const opts: GpglOptions =
    'presets' in (presetsOrOpts as GpglOptions) &&
    (presetsOrOpts as GpglOptions).presets
      ? (presetsOrOpts as GpglOptions)
      : { presets: presetsOrOpts as SilhouettePresets }
  const presets = opts.presets
  const seek = opts.regMarkSeek ?? 'off'

  const cmds: string[] = []
  const flat = flattenByType(items)

  cmds.push('\x1b\x04') // ESC EOT initialize
  cmds.push(`FW${presets.media}`)
  cmds.push('FN0')
  cmds.push('TB50,0')

  let includesRegSeek = false
  if (seek !== 'off') {
    includesRegSeek = true
    const { regW, regH, originX, originY } = regGeometry(page)
    cmds.push(';REGMARK SEEK')
    cmds.push('TB50,0')
    cmds.push('TB99')
    cmds.push('TB52,2') // Cameo / Portrait style marks
    cmds.push('TB51,400')
    cmds.push('TB53,10')
    cmds.push('TB55,1')
    if (seek === 'auto') {
      // TB123,height,width,top,left — search from origin with small margin
      const top = Math.max(0, originY - 10)
      const left = Math.max(0, originX - 10)
      cmds.push(
        `TB123,${su(regH)},${su(regW)},${su(top)},${su(left)}`,
      )
    } else {
      cmds.push(`TB23,${su(regH)},${su(regW)}`)
    }
  }

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

  const runPasses = (
    label: string,
    list: paper.Item[],
    pressure: number,
    speed: number,
    pen: boolean,
    passes: number | undefined,
  ) => {
    const n = Math.max(1, Math.round(passes ?? 1))
    for (let i = 0; i < n; i++) {
      if (n > 1) cmds.push(`;${label} pass ${i + 1}/${n}`)
      emitGroup(label, list, pressure, speed, pen)
    }
  }
  runPasses(
    'CUT',
    flat.cut,
    presets.cut.pressure,
    presets.cut.speed,
    presets.cut.tool === 'pen',
    presets.cut.passes,
  )
  runPasses(
    'SCORE',
    flat.score,
    presets.score.pressure,
    presets.score.speed,
    presets.score.tool === 'pen',
    presets.score.passes,
  )
  runPasses(
    'ENGRAVE',
    flat.engrave,
    presets.engrave.pressure,
    presets.engrave.speed,
    presets.engrave.tool === 'pen',
    presets.engrave.passes,
  )

  cmds.push('H')

  const body = cmds
    .filter((c) => !c.startsWith(';'))
    .map((c) => {
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
    includesRegSeek,
    deviceHint:
      seek === 'off'
        ? 'Cameo/Portrait USB GPGL. Enable optical seek for print-and-cut.'
        : seek === 'auto'
          ? 'Includes TB123 auto reg-mark seek (wait for sensor). Falls back to Studio if seek fails.'
          : 'Includes TB23 manual reg-mark. Align marks; Studio preferred for finicky sensors.',
  }
}

function regGeometry(page: PagePreset) {
  const originX = REG_MARK_INSET_MM
  const originY = REG_MARK_INSET_MM
  const regW = Math.max(
    10,
    page.widthMm - 2 * REG_MARK_INSET_MM - REG_MARK_SIZE_MM,
  )
  const regH = Math.max(
    10,
    page.heightMm - 2 * REG_MARK_INSET_MM - REG_MARK_SIZE_MM,
  )
  return { regW, regH, originX, originY }
}

function flattenByType(
  items: paper.Item[],
): Record<'cut' | 'score' | 'engrave', paper.Item[]> {
  const out: Record<'cut' | 'score' | 'engrave', paper.Item[]> = {
    cut: [],
    score: [],
    engrave: [],
  }
  const walk = (item: paper.Item) => {
    if (!item.visible || item.data?.locked) return
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) return
    if (item.className === 'Path' || item.className === 'CompoundPath') {
      const ct = ((item.data?.cutType as CutType) || 'cut') as CutType
      if (ct === 'print') return
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

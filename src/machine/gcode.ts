import paper from 'paper'
import type { CutType, PagePreset } from '../types'
import { PX_PER_MM } from '../types'
import type { MachineLaserPresets, OpPreset } from './presets'

void paper

export interface GcodeOptions {
  presets: MachineLaserPresets
  /** Include header comments */
  comments?: boolean
  /** Return to origin after job */
  returnHome?: boolean
}

/**
 * Build GRBL G-code for IKIER K1 / diode lasers.
 * Coordinates: millimeters, absolute (G90), origin at page **lower-left** (Y-up),
 * matching typical LightBurn/LaserGRBL machine origin advice.
 * Canvas is Y-down from top-left → y_gcode = pageHeightMm - y_mm.
 */
export function generateGcode(
  items: paper.Item[],
  page: PagePreset,
  options: GcodeOptions,
): string {
  const p = options.presets
  const lines: string[] = []
  const h = page.heightMm
  const toMachine = (pt: paper.Point) => ({
    x: pt.x / PX_PER_MM,
    y: h - pt.y / PX_PER_MM,
  })

  if (options.comments !== false) {
    lines.push('; CutForge G-code for GRBL diode laser (IKIER K1 class)')
    lines.push(`; Page ${page.widthMm.toFixed(2)} x ${page.heightMm.toFixed(2)} mm`)
    lines.push('; Origin: lower-left, Y-up, absolute mm (G21/G90)')
    lines.push('; Laser: M4 dynamic / M5 off — calibrate power/speed on scrap!')
  }

  lines.push('G21 ; mm')
  lines.push('G90 ; absolute')
  lines.push('G94 ; feed per minute')
  lines.push('M5 ; laser off')
  lines.push(`G0 X0 Y0 F${Math.round(p.travel)}`)

  const flat = flatten(items)
  for (const item of flat) {
    const cutType = ((item.data?.cutType as CutType) || 'cut') as CutType
    if (cutType === 'engrave') {
      emitEngrave(item, toMachine, p.engrave, p.travel, lines)
    } else if (cutType === 'score') {
      emitVector(item, toMachine, p.score, p.travel, lines, 'score')
    } else {
      emitVector(item, toMachine, p.cut, p.travel, lines, 'cut')
    }
  }

  lines.push('M5 ; laser off')
  if (options.returnHome !== false) {
    lines.push(`G0 X0 Y0 F${Math.round(p.travel)}`)
  }
  lines.push('M2 ; program end')
  return lines.join('\n') + '\n'
}

function flatten(items: paper.Item[]): paper.Item[] {
  const out: paper.Item[] = []
  const walk = (item: paper.Item) => {
    if (!item.visible || item.data?.locked) return
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) return
    if (item.className === 'Path' || item.className === 'CompoundPath') {
      out.push(item)
      return
    }
    if (item.children) for (const c of item.children) walk(c)
  }
  for (const i of items) walk(i)
  return out
}

function emitVector(
  item: paper.Item,
  toMachine: (pt: paper.Point) => { x: number; y: number },
  preset: OpPreset,
  travel: number,
  lines: string[],
  label: string,
) {
  const paths =
    item.className === 'CompoundPath'
      ? (item as paper.CompoundPath).children.filter(
          (c) => c.className === 'Path',
        )
      : [item]
  for (const raw of paths) {
    const path = raw as paper.Path
    if (!path.segments.length) continue
    const pts = samplePath(path)
    if (pts.length < 2) continue
    lines.push(`; --- ${label}: ${String(item.data?.name || 'path')} ---`)
    const start = toMachine(pts[0])
    lines.push('M5')
    lines.push(
      `G0 X${fmt(start.x)} Y${fmt(start.y)} F${Math.round(travel)}`,
    )
    lines.push(`M4 S${Math.round(preset.power)}`)
    for (let i = 1; i < pts.length; i++) {
      const m = toMachine(pts[i])
      lines.push(
        `G1 X${fmt(m.x)} Y${fmt(m.y)} F${Math.round(preset.speed)}`,
      )
    }
    if (path.closed) {
      const m = toMachine(pts[0])
      lines.push(
        `G1 X${fmt(m.x)} Y${fmt(m.y)} F${Math.round(preset.speed)}`,
      )
    }
    lines.push('M5')
  }
}

/** Simple horizontal hatch fill for closed paths; open paths stroke at engrave power. */
function emitEngrave(
  item: paper.Item,
  toMachine: (pt: paper.Point) => { x: number; y: number },
  preset: OpPreset,
  travel: number,
  lines: string[],
) {
  const spacing = Math.max(0.1, preset.hatchMm ?? 0.25) * PX_PER_MM
  const paths =
    item.className === 'CompoundPath'
      ? (item as paper.CompoundPath).children.filter(
          (c) => c.className === 'Path',
        )
      : [item]

  for (const raw of paths) {
    const path = raw as paper.Path
    if (!path.closed || path.segments.length < 3) {
      emitVector(path, toMachine, preset, travel, lines, 'engrave-stroke')
      continue
    }
    lines.push(`; --- engrave hatch: ${String(item.data?.name || 'path')} ---`)
    const b = path.bounds
    let y = b.top + spacing / 2
    let flip = false
    while (y <= b.bottom) {
      const x0 = b.left - 1
      const x1 = b.right + 1
      const probe = new paper.Path.Line(
        new paper.Point(x0, y),
        new paper.Point(x1, y),
      )
      probe.remove()
      const xs: number[] = []
      // Sample containment along the scanline
      const steps = Math.max(20, Math.ceil(b.width / (PX_PER_MM * 0.5)))
      let inside = false
      let segStart: number | null = null
      const spans: Array<[number, number]> = []
      for (let i = 0; i <= steps; i++) {
        const x = b.left + (b.width * i) / steps
        const hit = path.contains(new paper.Point(x, y))
        if (hit && !inside) {
          inside = true
          segStart = x
        } else if (!hit && inside && segStart != null) {
          spans.push([segStart, x])
          inside = false
          segStart = null
        }
      }
      if (inside && segStart != null) spans.push([segStart, b.right])

      for (const [a, c] of spans) {
        const p0 = flip
          ? toMachine(new paper.Point(c, y))
          : toMachine(new paper.Point(a, y))
        const p1 = flip
          ? toMachine(new paper.Point(a, y))
          : toMachine(new paper.Point(c, y))
        lines.push('M5')
        lines.push(`G0 X${fmt(p0.x)} Y${fmt(p0.y)} F${Math.round(travel)}`)
        lines.push(`M4 S${Math.round(preset.power)}`)
        lines.push(
          `G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${Math.round(preset.speed)}`,
        )
        lines.push('M5')
        void xs
      }
      flip = !flip
      y += spacing
    }
  }
}

function samplePath(path: paper.Path): paper.Point[] {
  const len = path.length
  if (len === 0) return path.segments.map((s) => s.point.clone())
  const step = Math.max(0.5 * PX_PER_MM, len / 200)
  const n = Math.max(2, Math.ceil(len / step))
  const pts: paper.Point[] = []
  for (let i = 0; i <= n; i++) {
    const pt = path.getPointAt((i / n) * len)
    if (pt) pts.push(pt)
  }
  return pts
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3)
}

export function gcodeToLines(gcode: string): string[] {
  return gcode
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

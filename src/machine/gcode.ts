import paper from 'paper'
import type { CutType, PagePreset } from '../types'
import { PX_PER_MM } from '../types'
import type { MachineLaserPresets, OpPreset } from './presets'
import {
  lookupColorMap,
  type LaserColorMapEntry,
} from './colorMap'

void paper

export interface GcodeOptions {
  presets: MachineLaserPresets
  /** Color → power/speed overrides (stroke for vectors, fill for engrave) */
  colorMap?: LaserColorMapEntry[]
  comments?: boolean
  returnHome?: boolean
}

/**
 * GRBL G-code for IKIER K1 / diode lasers.
 * mm, absolute, origin lower-left (Y-up).
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
    const e = p.engrave
    lines.push(
      `; Engrave hatch ${e.hatchMm ?? 0.2}mm @ ${e.hatchAngleDeg ?? 0}°` +
        (e.crossHatch ? ' cross' : ''),
    )
    lines.push(
      `; Color map entries: ${(options.colorMap || []).length} — match overrides S/F`,
    )
    lines.push('; Laser: M4 dynamic / M5 off — calibrate on scrap!')
  }

  lines.push('G21 ; mm')
  lines.push('G90 ; absolute')
  lines.push('G94 ; feed per minute')
  lines.push('M5 ; laser off')
  lines.push(`G0 X0 Y0 F${Math.round(p.travel)}`)

  const flat = flatten(items)
  const colorMap = options.colorMap ?? []
  for (const item of flat) {
    const cutType = ((item.data?.cutType as CutType) || 'cut') as CutType
    if (cutType === 'print') continue // inkjet only — not lasered
    const base =
      cutType === 'engrave'
        ? p.engrave
        : cutType === 'score'
          ? p.score
          : p.cut
    const preset = resolvePreset(item, cutType, base, colorMap)
    const passes = Math.max(1, Math.round(preset.passes ?? 1))
    for (let pass = 0; pass < passes; pass++) {
      if (passes > 1) lines.push(`; pass ${pass + 1}/${passes}`)
      if (cutType === 'engrave') {
        emitEngrave(item, toMachine, preset, p.travel, lines)
      } else if (cutType === 'score') {
        emitVector(item, toMachine, preset, p.travel, lines, 'score')
      } else {
        emitVector(item, toMachine, preset, p.travel, lines, 'cut')
      }
    }
  }

  lines.push('M5 ; laser off')
  if (options.returnHome !== false) {
    lines.push(`G0 X0 Y0 F${Math.round(p.travel)}`)
  }
  lines.push('M2 ; program end')
  return lines.join('\n') + '\n'
}


function resolvePreset(
  item: paper.Item,
  cutType: CutType,
  base: OpPreset,
  colorMap: LaserColorMapEntry[],
): OpPreset {
  if (!colorMap.length) return base
  const hit = lookupColorMap(colorMap, {
    strokeColor: (item.data?.strokeColor as string) || null,
    fillColor: (item.data?.fillColor as string) || null,
    prefer: cutType === 'engrave' ? 'fill' : 'stroke',
  })
  if (!hit) return base
  return {
    ...base,
    power: hit.power,
    speed: hit.speed != null ? hit.speed : base.speed,
  }
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
      ? (item as paper.CompoundPath).children.filter((c) => c.className === 'Path')
      : [item]
  for (const raw of paths) {
    const path = raw as paper.Path
    if (!path.segments.length) continue
    const pts = samplePath(path)
    if (pts.length < 2) continue
    lines.push(`; --- ${label}: ${String(item.data?.name || 'path')} ---`)
    const start = toMachine(pts[0])
    lines.push('M5')
    lines.push(`G0 X${fmt(start.x)} Y${fmt(start.y)} F${Math.round(travel)}`)
    lines.push(`M4 S${Math.round(preset.power)}`)
    for (let i = 1; i < pts.length; i++) {
      const m = toMachine(pts[i])
      lines.push(`G1 X${fmt(m.x)} Y${fmt(m.y)} F${Math.round(preset.speed)}`)
    }
    if (path.closed) {
      const m = toMachine(pts[0])
      lines.push(`G1 X${fmt(m.x)} Y${fmt(m.y)} F${Math.round(preset.speed)}`)
    }
    lines.push('M5')
  }
}

function emitEngrave(
  item: paper.Item,
  toMachine: (pt: paper.Point) => { x: number; y: number },
  preset: OpPreset,
  travel: number,
  lines: string[],
) {
  const spacingMm = Math.max(0.05, preset.hatchMm ?? 0.2)
  const angle = preset.hatchAngleDeg ?? 0
  const paths =
    item.className === 'CompoundPath'
      ? (item as paper.CompoundPath).children.filter((c) => c.className === 'Path')
      : [item]

  for (const raw of paths) {
    const path = raw as paper.Path
    if (!path.closed || path.segments.length < 3) {
      emitVector(path, toMachine, preset, travel, lines, 'engrave-stroke')
      continue
    }
    lines.push(
      `; --- engrave hatch ${spacingMm}mm @ ${angle}°: ${String(item.data?.name || 'path')} ---`,
    )
    emitHatchPass(path, spacingMm, angle, toMachine, preset, travel, lines)
    if (preset.crossHatch) {
      lines.push(`; --- cross-hatch @ ${angle + 90}° ---`)
      emitHatchPass(path, spacingMm, angle + 90, toMachine, preset, travel, lines)
    }
  }
}

/**
 * Fill a closed path with parallel hatch lines at `angleDeg`.
 * Works in canvas space, then maps via toMachine.
 */
function emitHatchPass(
  path: paper.Path,
  spacingMm: number,
  angleDeg: number,
  toMachine: (pt: paper.Point) => { x: number; y: number },
  preset: OpPreset,
  travel: number,
  lines: string[],
) {
  const spacing = spacingMm * PX_PER_MM
  const rad = (angleDeg * Math.PI) / 180
  // Unit vector along hatch lines; scan advances along perpendicular
  const alongX = Math.cos(rad)
  const alongY = Math.sin(rad)
  const perpX = -Math.sin(rad)
  const perpY = Math.cos(rad)

  const b = path.bounds
  const cx = b.center.x
  const cy = b.center.y
  // Project corners onto perpendicular to find scan range
  const corners = [
    new paper.Point(b.left, b.top),
    new paper.Point(b.right, b.top),
    new paper.Point(b.left, b.bottom),
    new paper.Point(b.right, b.bottom),
  ]
  let minP = Infinity
  let maxP = -Infinity
  let minA = Infinity
  let maxA = -Infinity
  for (const c of corners) {
    const dx = c.x - cx
    const dy = c.y - cy
    const pr = dx * perpX + dy * perpY
    const al = dx * alongX + dy * alongY
    minP = Math.min(minP, pr)
    maxP = Math.max(maxP, pr)
    minA = Math.min(minA, al)
    maxA = Math.max(maxA, al)
  }
  // Pad along-axis so lines cover rotated AABB
  const pad = Math.hypot(b.width, b.height)
  minA -= pad
  maxA += pad

  let flip = false
  for (let pr = minP; pr <= maxP + spacing * 0.5; pr += spacing) {
    const spans = scanlineSpans(path, cx, cy, alongX, alongY, perpX, perpY, pr, minA, maxA)
    for (const [a0, a1] of spans) {
      const pStart = flip
        ? pointFrom(cx, cy, alongX, alongY, perpX, perpY, a1, pr)
        : pointFrom(cx, cy, alongX, alongY, perpX, perpY, a0, pr)
      const pEnd = flip
        ? pointFrom(cx, cy, alongX, alongY, perpX, perpY, a0, pr)
        : pointFrom(cx, cy, alongX, alongY, perpX, perpY, a1, pr)
      const m0 = toMachine(pStart)
      const m1 = toMachine(pEnd)
      lines.push('M5')
      lines.push(`G0 X${fmt(m0.x)} Y${fmt(m0.y)} F${Math.round(travel)}`)
      lines.push(`M4 S${Math.round(preset.power)}`)
      lines.push(`G1 X${fmt(m1.x)} Y${fmt(m1.y)} F${Math.round(preset.speed)}`)
      lines.push('M5')
    }
    if (spans.length) flip = !flip
  }
}

function pointFrom(
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  px: number,
  py: number,
  along: number,
  perp: number,
): paper.Point {
  return new paper.Point(cx + ax * along + px * perp, cy + ay * along + py * perp)
}

/** Sample along a hatch line; return inside spans as [alongStart, alongEnd]. */
function scanlineSpans(
  path: paper.Path,
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  px: number,
  py: number,
  perp: number,
  minA: number,
  maxA: number,
): Array<[number, number]> {
  const len = maxA - minA
  if (len <= 0) return []
  const step = Math.max(0.35 * PX_PER_MM, len / 400)
  const spans: Array<[number, number]> = []
  let inside = false
  let segStart = 0
  for (let a = minA; a <= maxA + step * 0.5; a += step) {
    const pt = pointFrom(cx, cy, ax, ay, px, py, a, perp)
    const hit = path.contains(pt)
    if (hit && !inside) {
      inside = true
      segStart = a
    } else if (!hit && inside) {
      spans.push([segStart, a])
      inside = false
    }
  }
  if (inside) spans.push([segStart, maxA])
  // Drop tiny spans
  return spans.filter(([s, e]) => e - s > step * 0.5)
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

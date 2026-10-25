import type { PagePreset } from '../types'
import { PX_PER_MM } from '../types'

export interface FrameBoundsMm {
  /** Machine coords: lower-left origin, Y-up */
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface FrameOptions {
  /** Travel / frame feed mm/min */
  feed: number
  /**
   * If > 0, enable laser at this S while tracing (LightBurn-style low-power frame).
   * 0 = laser off (safer default).
   */
  laserPower: number
  /** Use G1 (feed) vs G0 when laser off */
  useFeedMoves?: boolean
}

/** Paper.js canvas bounds (Y-down px) → machine mm Y-up. */
export function paperBoundsToMachine(
  bounds: { x: number; y: number; width: number; height: number },
  page: PagePreset,
): FrameBoundsMm {
  const minX = bounds.x / PX_PER_MM
  const maxX = (bounds.x + bounds.width) / PX_PER_MM
  const topCanvas = bounds.y / PX_PER_MM
  const botCanvas = (bounds.y + bounds.height) / PX_PER_MM
  const maxY = page.heightMm - topCanvas
  const minY = page.heightMm - botCanvas
  return {
    minX: round3(minX),
    maxX: round3(maxX),
    minY: round3(minY),
    maxY: round3(maxY),
  }
}

/**
 * LightBurn-style frame: move around bounding box.
 * Default laser OFF (M5). Optional low-power M4 while on the path.
 * Never a cut job — outline only, then M5.
 */
export function buildFrameGcode(
  box: FrameBoundsMm,
  opts: FrameOptions,
): string[] {
  const { minX, minY, maxX, maxY } = box
  const feed = Math.max(100, Math.round(opts.feed))
  const power = Math.max(0, Math.round(opts.laserPower))
  const move = power > 0 || opts.useFeedMoves ? 'G1' : 'G0'
  const f = `F${feed}`
  const lines: string[] = [
    '; CutForge frame (bbox outline — not a cut)',
    'M5',
    'G21',
    'G90',
    `G0 X${minX} Y${minY} ${f}`,
  ]
  if (power > 0) {
    lines.push(`M4 S${power}`)
  }
  lines.push(`${move} X${maxX} Y${minY} ${f}`)
  lines.push(`${move} X${maxX} Y${maxY} ${f}`)
  lines.push(`${move} X${minX} Y${maxY} ${f}`)
  lines.push(`${move} X${minX} Y${minY} ${f}`)
  lines.push('M5')
  return lines
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

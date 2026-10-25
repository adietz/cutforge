import type { CutType } from '../types'

/** Map a CSS/hex color to a CutForge cut type (LightBurn + CutForge conventions). */
export function cutTypeFromColor(
  stroke: string | null | undefined,
  fill: string | null | undefined,
): CutType {
  const c = normalizeColor(stroke) || normalizeColor(fill)
  if (!c) return 'cut'
  const { h, s, l } = rgbToHsl(c.r, c.g, c.b)
  if (s < 0.12) {
    // gray / black → engrave
    return l < 0.55 ? 'engrave' : 'cut'
  }
  // Magenta / purple → print
  if (h >= 270 && h <= 330) return 'print'
  // Red / orange-red → cut
  if (h <= 25 || h >= 345) return 'cut'
  // Orange / amber → score (CutForge UI)
  if (h > 25 && h < 55) return 'score'
  // Yellow → score-ish
  if (h >= 55 && h < 75) return 'score'
  // Green → cut (common scrap)
  if (h >= 75 && h < 160) return 'cut'
  // Cyan / blue → score (LightBurn blue = score); deep blue also score
  if (h >= 160 && h < 270) return 'score'
  return 'cut'
}

function normalizeColor(
  input: string | null | undefined,
): { r: number; g: number; b: number } | null {
  if (!input || input === 'none' || input === 'transparent') return null
  const s = input.trim().toLowerCase()
  if (s.startsWith('#')) {
    let h = s.slice(1)
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    if (h.length === 8) h = h.slice(0, 6)
    if (h.length !== 6) return null
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  const m = s.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/,
  )
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3] }
  }
  const named: Record<string, [number, number, number]> = {
    red: [255, 0, 0],
    blue: [0, 0, 255],
    black: [0, 0, 0],
    green: [0, 128, 0],
    magenta: [255, 0, 255],
    cyan: [0, 255, 255],
    orange: [255, 165, 0],
    purple: [128, 0, 128],
  }
  if (named[s]) {
    const [r, g, b] = named[s]
    return { r, g, b }
  }
  return null
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60
        break
      case g:
        h = ((b - r) / d + 2) * 60
        break
      default:
        h = ((r - g) / d + 4) * 60
    }
  }
  return { h, s, l }
}

/** Prefer ACI / common DXF layer color indices. */
export function cutTypeFromAci(aci: number | undefined): CutType {
  if (aci == null) return 'cut'
  // AutoCAD Color Index common laser mapping
  if (aci === 1 || aci === 10) return 'cut' // red
  if (aci === 5 || aci === 150 || aci === 160) return 'score' // blue
  if (aci === 7 || aci === 8 || aci === 250 || aci === 251) return 'engrave'
  if (aci === 6 || aci === 210) return 'print' // magenta
  if (aci === 2 || aci === 30 || aci === 40) return 'score' // yellow/orange
  return 'cut'
}

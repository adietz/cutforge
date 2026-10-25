/** Color → laser power/speed map for IKIER K1 G-code. */

export type ColorMatchMode = 'stroke' | 'fill' | 'either'

export interface LaserColorMapEntry {
  id: string
  /** Hex color, normalized on lookup */
  color: string
  match: ColorMatchMode
  /** GRBL S power (typically 0–1000) */
  power: number
  /** Optional feed mm/min override */
  speed?: number
  label?: string
}

export const DEFAULT_LASER_COLOR_MAP: LaserColorMapEntry[] = [
  {
    id: 'cut-red',
    color: '#e74c3c',
    match: 'stroke',
    power: 1000,
    speed: 400,
    label: 'Cut red',
  },
  {
    id: 'score-orange',
    color: '#f39c12',
    match: 'stroke',
    power: 200,
    speed: 800,
    label: 'Score orange',
  },
  {
    id: 'engrave-blue',
    color: '#3498db',
    match: 'fill',
    power: 450,
    speed: 1800,
    label: 'Engrave blue fill',
  },
]

/** Normalize to lowercase #rrggbb (or empty if invalid). */
export function normalizeHex(input: string | null | undefined): string {
  if (!input) return ''
  let s = String(input).trim().toLowerCase()
  if (s.startsWith('rgb')) {
    const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (!m) return ''
    const hex = (n: number) =>
      Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
    return `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`
  }
  if (!s.startsWith('#')) s = `#${s}`
  if (/^#[0-9a-f]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
  }
  if (/^#[0-9a-f]{6}$/.test(s)) return s
  if (/^#[0-9a-f]{8}$/.test(s)) return s.slice(0, 7)
  return ''
}

export function newColorMapEntry(
  partial?: Partial<LaserColorMapEntry>,
): LaserColorMapEntry {
  return {
    id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    color: '#ffffff',
    match: 'stroke',
    power: 500,
    ...partial,
  }
}

export interface ColorResolveInput {
  strokeColor?: string | null
  fillColor?: string | null
  /** Prefer fill matches for engrave, stroke for cut/score */
  prefer: 'stroke' | 'fill'
}

/**
 * Find the first map entry that matches. Returns null if none.
 */
export function lookupColorMap(
  map: LaserColorMapEntry[],
  input: ColorResolveInput,
): LaserColorMapEntry | null {
  const stroke = normalizeHex(input.strokeColor)
  const fill = normalizeHex(input.fillColor)
  const order =
    input.prefer === 'fill'
      ? (['fill', 'stroke', 'either'] as const)
      : (['stroke', 'fill', 'either'] as const)

  for (const mode of order) {
    for (const entry of map) {
      const c = normalizeHex(entry.color)
      if (!c) continue
      if (mode === 'either') {
        if (entry.match !== 'either') continue
        if ((stroke && stroke === c) || (fill && fill === c)) return entry
      } else if (entry.match === mode || entry.match === 'either') {
        if (mode === 'stroke' && stroke && stroke === c) return entry
        if (mode === 'fill' && fill && fill === c) return entry
      }
    }
  }
  return null
}

export function parseColorMap(raw: unknown): LaserColorMapEntry[] {
  if (!Array.isArray(raw)) return DEFAULT_LASER_COLOR_MAP.map((e) => ({ ...e }))
  const out: LaserColorMapEntry[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const color = normalizeHex(String(r.color ?? ''))
    if (!color) continue
    const match =
      r.match === 'fill' || r.match === 'either' || r.match === 'stroke'
        ? (r.match as ColorMatchMode)
        : 'stroke'
    out.push({
      id: String(r.id || newColorMapEntry().id),
      color,
      match,
      power: Math.max(0, Number(r.power) || 0),
      speed:
        r.speed == null || r.speed === ''
          ? undefined
          : Math.max(1, Number(r.speed) || 1),
      label: r.label != null ? String(r.label) : undefined,
    })
  }
  return out.length ? out : DEFAULT_LASER_COLOR_MAP.map((e) => ({ ...e }))
}

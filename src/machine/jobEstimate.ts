/**
 * Rough job time from GRBL-ish G-code: path length / feed.
 * Ignores accel, pierce dwell, and laser-on delays — underestimate vs reality.
 */

export interface JobEstimate {
  /** Estimated seconds (motion only) */
  seconds: number
  cutMm: number
  travelMm: number
  cutSeconds: number
  travelSeconds: number
  moves: number
}

function parseWords(line: string): Record<string, number> {
  const out: Record<string, number> = {}
  const re = /([A-Za-z])\s*(-?\d+\.?\d*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    out[m[1].toUpperCase()] = parseFloat(m[2])
  }
  return out
}

function motionKind(line: string): 'rapid' | 'feed' | null {
  // Match G0 / G00 but not G01–G09; match G1 / G01 / G2 / G3
  if (/\bG0(?:0+)?\b/i.test(line) && !/\bG0*[1-9]\b/i.test(line.replace(/\bG00?\b/i, 'G0'))) {
    // simpler:
  }
  const g = line.match(/\bG0*(\d+)\b/i)
  if (!g) return null
  const n = parseInt(g[1], 10)
  if (n === 0) return 'rapid'
  if (n === 1 || n === 2 || n === 3) return 'feed'
  return null
}

export function estimateGcodeTime(gcode: string): JobEstimate {
  let x = 0
  let y = 0
  let feed = 1000
  let mode: 'rapid' | 'feed' = 'rapid'
  let cutMm = 0
  let travelMm = 0
  let cutSeconds = 0
  let travelSeconds = 0
  let moves = 0

  for (const raw of gcode.split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, '').trim()
    if (!line || line.startsWith('(')) continue
    const w = parseWords(line)
    if ('F' in w && w.F > 0) feed = w.F

    const mk = motionKind(line)
    if (mk) mode = mk

    if (!('X' in w || 'Y' in w)) continue

    const nx = 'X' in w ? w.X : x
    const ny = 'Y' in w ? w.Y : y
    const dist = Math.hypot(nx - x, ny - y)
    if (dist > 1e-6) {
      moves++
      const f = Math.max(1, feed) // mm/min
      const sec = (dist / f) * 60
      if (mode === 'rapid') {
        travelMm += dist
        travelSeconds += sec
      } else {
        cutMm += dist
        cutSeconds += sec
      }
    }
    x = nx
    y = ny
  }

  return {
    seconds: cutSeconds + travelSeconds,
    cutMm,
    travelMm,
    cutSeconds,
    travelSeconds,
    moves,
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `~${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return `~${m}m ${s.toString().padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `~${h}h ${m % 60}m`
}

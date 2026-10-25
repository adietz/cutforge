import DxfParser from 'dxf-parser'
import { cutTypeFromAci } from './colorCutTypes'
import type { CutType } from '../types'

/**
 * Convert a DXF string into a simple SVG suitable for Paper.js importSVG.
 * Supports LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, SPLINE (approx).
 */
export function dxfToSvg(dxfText: string): { svg: string; pathCount: number } {
  const parser = new DxfParser()
  const dxf = parser.parseSync(dxfText)
  if (!dxf?.entities?.length) {
    throw new Error('DXF has no drawable entities')
  }

  const parts: string[] = []
  let pathCount = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const touch = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const strokeFor = (ent: { color?: number; layer?: string }): {
    stroke: string
    cutType: CutType
  } => {
    const ct = cutTypeFromAci(ent.color)
    const stroke =
      ct === 'cut'
        ? '#FF0000'
        : ct === 'score'
          ? '#0000FF'
          : ct === 'engrave'
            ? '#000000'
            : '#FF00FF'
    return { stroke, cutType: ct }
  }

  for (const ent of dxf.entities as DxfEntity[]) {
    const { stroke } = strokeFor(ent)
    const type = (ent.type || '').toUpperCase()
    if (type === 'LINE' && ent.vertices?.length >= 2) {
      const a = ent.vertices[0]
      const b = ent.vertices[1]
      touch(a.x, a.y)
      touch(b.x, b.y)
      parts.push(
        `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${stroke}" fill="none" data-cuttype="${strokeFor(ent).cutType}"/>`,
      )
      pathCount++
    } else if (
      (type === 'LWPOLYLINE' || type === 'POLYLINE') &&
      ent.vertices?.length
    ) {
      const pts = ent.vertices
      pts.forEach((v) => touch(v.x, v.y))
      const d =
        pts
          .map((v, i) => `${i === 0 ? 'M' : 'L'}${f(v.x)},${f(v.y)}`)
          .join(' ') + (ent.shape || ent.closed ? ' Z' : '')
      parts.push(
        `<path d="${d}" stroke="${stroke}" fill="none" data-cuttype="${strokeFor(ent).cutType}"/>`,
      )
      pathCount++
    } else if (type === 'CIRCLE' && ent.center && ent.radius != null) {
      const { x, y } = ent.center
      touch(x - ent.radius, y - ent.radius)
      touch(x + ent.radius, y + ent.radius)
      parts.push(
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(ent.radius)}" stroke="${stroke}" fill="none" data-cuttype="${strokeFor(ent).cutType}"/>`,
      )
      pathCount++
    } else if (
      type === 'ARC' &&
      ent.center &&
      ent.radius != null &&
      ent.startAngle != null &&
      ent.endAngle != null
    ) {
      const { x, y } = ent.center
      const r = ent.radius
      // DXF angles are degrees CCW from +X
      const a0 = (ent.startAngle * Math.PI) / 180
      const a1 = (ent.endAngle * Math.PI) / 180
      const x0 = x + r * Math.cos(a0)
      const y0 = y + r * Math.sin(a0)
      const x1 = x + r * Math.cos(a1)
      const y1 = y + r * Math.sin(a1)
      touch(x0, y0)
      touch(x1, y1)
      let delta = ent.endAngle - ent.startAngle
      while (delta < 0) delta += 360
      while (delta > 360) delta -= 360
      const large = delta > 180 ? 1 : 0
      parts.push(
        `<path d="M${f(x0)},${f(y0)} A${f(r)},${f(r)} 0 ${large} 1 ${f(x1)},${f(y1)}" stroke="${stroke}" fill="none" data-cuttype="${strokeFor(ent).cutType}"/>`,
      )
      pathCount++
    } else if (type === 'SPLINE' && ent.controlPoints?.length) {
      const pts = ent.controlPoints
      pts.forEach((v) => touch(v.x, v.y))
      if (pts.length === 1) continue
      let d = `M${f(pts[0].x)},${f(pts[0].y)}`
      if (pts.length === 2) {
        d += ` L${f(pts[1].x)},${f(pts[1].y)}`
      } else {
        for (let i = 1; i < pts.length - 1; i += 2) {
          const c = pts[i]
          const e = pts[Math.min(i + 1, pts.length - 1)]
          d += ` Q${f(c.x)},${f(c.y)} ${f(e.x)},${f(e.y)}`
        }
        const last = pts[pts.length - 1]
        d += ` L${f(last.x)},${f(last.y)}`
      }
      parts.push(
        `<path d="${d}" stroke="${stroke}" fill="none" data-cuttype="${strokeFor(ent).cutType}"/>`,
      )
      pathCount++
    }
  }

  if (!pathCount) throw new Error('DXF entities not supported (need LINE/POLYLINE/CIRCLE/ARC)')

  // DXF is Y-up; SVG is Y-down — flip in viewBox via transform
  const pad = 1
  const w = Math.max(1, maxX - minX + pad * 2)
  const h = Math.max(1, maxY - minY + pad * 2)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">
  <g transform="translate(${f(-minX + pad)}, ${f(maxY + pad)}) scale(1,-1)" fill="none" stroke-width="0.25">
    ${parts.join('\n    ')}
  </g>
</svg>`
  return { svg, pathCount }
}

function f(n: number) {
  return (Math.round(n * 1000) / 1000).toString()
}

interface DxfEntity {
  type?: string
  color?: number
  layer?: string
  vertices?: { x: number; y: number }[]
  center?: { x: number; y: number }
  radius?: number
  startAngle?: number
  endAngle?: number
  shape?: boolean
  closed?: boolean
  controlPoints?: { x: number; y: number }[]
}

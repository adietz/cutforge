import paper from 'paper'

void paper
import type { PagePreset, Unit } from '../types'
import { INCH_TO_MM, PX_PER_MM } from '../types'

/**
 * Silhouette-friendly SVG: mm (or in) units, viewBox matching page,
 * paths as stroke/fill with cut-type data attributes.
 */
export function exportSvg(
  project: paper.Project,
  page: PagePreset,
  unit: Unit,
): string {
  const w = unit === 'in' ? page.widthMm / INCH_TO_MM : page.widthMm
  const h = unit === 'in' ? page.heightMm / INCH_TO_MM : page.heightMm
  const u = unit

  const parts: string[] = []
  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}${u}" height="${fmt(h)}${u}" viewBox="0 0 ${fmt(w)} ${fmt(h)}">`,
    `<!-- CutForge export — Silhouette / laser friendly -->`,
  )

  const scale = unit === 'in' ? 1 / (PX_PER_MM * INCH_TO_MM) : 1 / PX_PER_MM

  for (const item of project.activeLayer.children) {
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) continue
    const svgChunk = itemToSvg(item, scale)
    if (svgChunk) parts.push(svgChunk)
  }

  parts.push(`</svg>`)
  return parts.join('\n')
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString()
}

function itemToSvg(item: paper.Item, scale: number): string | null {
  const cutType = (item.data?.cutType as string) || 'cut'
  const strokeWMm = (item.data?.strokeWidthMm as number) || 0.2
  const strokeW = scale === 1 / PX_PER_MM ? strokeWMm : strokeWMm / INCH_TO_MM

  if (item.className === 'PointText') {
    const t = item as paper.PointText
    const p = t.point
    const fill = colorStr(t.fillColor) || '#000'
    const escaped = escapeXml(t.content)
    return `  <text x="${fmt(p.x * scale)}" y="${fmt(p.y * scale)}" font-size="${fmt(Number(t.fontSize) * scale)}" fill="${fill}" data-cut-type="${cutType}">${escaped}</text>`
  }

  if (item.className === 'Path' || item.className === 'CompoundPath') {
    const path = item as paper.Path | paper.CompoundPath
    const d = pathToD(path, scale)
    if (!d) return null
    const stroke = colorStr(path.strokeColor) || 'none'
    const fill = colorStr(path.fillColor) || 'none'
    const dash =
      path.dashArray && path.dashArray.length
        ? ` stroke-dasharray="${path.dashArray.map((x) => fmt(x * scale)).join(' ')}"`
        : ''
    return `  <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(strokeW)}"${dash} data-cut-type="${cutType}"/>`
  }

  return null
}

function pathToD(
  path: paper.Path | paper.CompoundPath,
  scale: number,
): string {
  if (path.className === 'CompoundPath') {
    return (path as paper.CompoundPath).children
      .map((c) => (c.className === 'Path' ? singlePathD(c as paper.Path, scale) : ''))
      .filter(Boolean)
      .join(' ')
  }
  return singlePathD(path as paper.Path, scale)
}

function singlePathD(path: paper.Path, scale: number): string {
  if (!path.segments.length) return ''
  const parts: string[] = []
  const first = path.segments[0]
  parts.push(`M ${fmt(first.point.x * scale)} ${fmt(first.point.y * scale)}`)
  for (let i = 1; i < path.segments.length; i++) {
    const seg = path.segments[i]
    const prev = path.segments[i - 1]
    const hasCurve = !prev.handleOut.isZero() || !seg.handleIn.isZero()
    if (hasCurve) {
      const cp1 = prev.point.add(prev.handleOut)
      const cp2 = seg.point.add(seg.handleIn)
      parts.push(
        `C ${fmt(cp1.x * scale)} ${fmt(cp1.y * scale)} ${fmt(cp2.x * scale)} ${fmt(cp2.y * scale)} ${fmt(seg.point.x * scale)} ${fmt(seg.point.y * scale)}`,
      )
    } else {
      parts.push(`L ${fmt(seg.point.x * scale)} ${fmt(seg.point.y * scale)}`)
    }
  }
  if (path.closed) parts.push('Z')
  return parts.join(' ')
}

function colorStr(c: paper.Color | null): string | null {
  if (!c) return null
  if (c.alpha === 0) return 'none'
  if (c.alpha < 1) {
    return `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${fmt(c.alpha)})`
  }
  const hex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(c.red)}${hex(c.green)}${hex(c.blue)}`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

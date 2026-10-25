import paper from 'paper'
import type { CutType, PagePreset, Unit } from '../types'
import { HAIRLINE_IN, HAIRLINE_MM, INCH_TO_MM, PX_PER_MM } from '../types'
import { MACHINE_CUT_COLORS, type SvgStyleMode } from './profiles'

void paper

export interface SvgExportOptions {
  /** Force Silhouette hairline (0.001 in) stroke on paths. */
  hairline?: boolean
  /** Skip locked items (and their descendants when parent is locked). */
  excludeLocked?: boolean
  /** Style preset for stroke/fill/layer grouping. */
  styleMode?: SvgStyleMode
  /** Extra HTML comment in the SVG header. */
  comment?: string
}

/**
 * Machine / cutter SVG export.
 * Coordinate system: origin at top-left of the page, Y increases downward (Y-down).
 * Page size is written in the chosen unit; path data matches the viewBox.
 */
export function exportSvg(
  items: paper.Item[],
  page: PagePreset,
  unit: Unit,
  options: SvgExportOptions = {},
): string {
  const w = unit === 'in' ? page.widthMm / INCH_TO_MM : page.widthMm
  const h = unit === 'in' ? page.heightMm / INCH_TO_MM : page.heightMm
  const u = unit
  const mode: SvgStyleMode = options.styleMode || 'generic'
  const scale = unit === 'in' ? 1 / (PX_PER_MM * INCH_TO_MM) : 1 / PX_PER_MM

  const parts: string[] = []
  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}${u}" height="${fmt(h)}${u}" viewBox="0 0 ${fmt(w)} ${fmt(h)}">`,
    `<!-- CutForge SVG — origin top-left, Y-down. mode=${mode} -->`,
  )
  if (options.comment) {
    parts.push(`<!-- ${options.comment.replace(/--/g, '—')} -->`)
  }

  const flat = flattenItems(items, options.excludeLocked !== false)
  const useGroups = mode === 'lightburn' || mode === 'glowforge'

  if (useGroups) {
    const buckets: Record<string, paper.Item[]> = {
      cut: [],
      score: [],
      engrave: [],
      print: [],
    }
    for (const item of flat) {
      const ct = ((item.data?.cutType as CutType) || 'cut') as CutType
      if (ct === 'print') buckets.print.push(item)
      else buckets[ct === 'score' || ct === 'engrave' ? ct : 'cut'].push(item)
    }
    for (const ct of ['cut', 'score', 'engrave', 'print'] as const) {
      if (!buckets[ct].length) continue
      const label = ct.charAt(0).toUpperCase() + ct.slice(1)
      parts.push(`  <g id="${label}" data-cut-type="${ct}">`)
      for (const item of buckets[ct]) {
        const chunk = itemToSvg(item, scale, unit, options, mode)
        if (chunk) parts.push(indent(chunk, 4))
      }
      parts.push(`  </g>`)
    }
  } else {
    for (const item of flat) {
      const chunk = itemToSvg(item, scale, unit, options, mode)
      if (chunk) parts.push(chunk)
    }
  }

  parts.push(`</svg>`)
  return parts.join('\n')
}

function indent(s: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return s
    .split('\n')
    .map((line) => (line.startsWith('  ') ? pad + line.slice(2) : pad + line.trimStart()))
    .join('\n')
}

function flattenItems(items: paper.Item[], excludeLocked: boolean): paper.Item[] {
  const out: paper.Item[] = []
  const walk = (item: paper.Item) => {
    if (!item.visible) return
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) return
    if (excludeLocked && item.data?.locked) return
    if (
      item.className === 'Path' ||
      item.className === 'CompoundPath' ||
      item.className === 'PointText'
    ) {
      out.push(item)
      return
    }
    if (item.children?.length) {
      for (const c of item.children) walk(c)
    }
  }
  for (const item of items) walk(item)
  return out
}

function fmt(n: number): string {
  return (Math.round(n * 100000) / 100000).toString()
}

function itemToSvg(
  item: paper.Item,
  scale: number,
  unit: Unit,
  options: SvgExportOptions,
  mode: SvgStyleMode,
): string | null {
  const cutType = ((item.data?.cutType as string) || 'cut') as CutType
  const useHairline =
    options.hairline ||
    !!item.data?.hairline ||
    Math.abs(Number(item.data?.strokeWidthMm) - HAIRLINE_MM) < 1e-6

  let strokeW: number
  if (useHairline || mode === 'silhouette') {
    strokeW = unit === 'in' ? HAIRLINE_IN : HAIRLINE_MM
  } else if (mode === 'lightburn' || mode === 'glowforge') {
    // Thin but visible stroke for layer mapping (not Silhouette hairline)
    strokeW = unit === 'in' ? 0.003 : 0.05
  } else {
    const strokeWMm = (item.data?.strokeWidthMm as number) || 0.2
    strokeW = unit === 'in' ? strokeWMm / INCH_TO_MM : strokeWMm
  }

  if (item.className === 'PointText') {
    const t = item as paper.PointText
    const p = t.point
    const fill =
      mode === 'lightburn' || mode === 'glowforge'
        ? cutType === 'print'
          ? '#9b59b6'
          : MACHINE_CUT_COLORS[cutType === 'score' || cutType === 'engrave' ? cutType : 'cut']
        : colorStr(t.fillColor) || '#000'
    const escaped = escapeXml(t.content)
    return `  <text x="${fmt(p.x * scale)}" y="${fmt(p.y * scale)}" font-size="${fmt(Number(t.fontSize) * scale)}" fill="${fill}" data-cut-type="${cutType}" data-name="${escapeXml(String(item.data?.name || ''))}">${escaped}</text>`
  }

  if (item.className === 'Path' || item.className === 'CompoundPath') {
    const path = item as paper.Path | paper.CompoundPath
    const d = pathToD(path, scale)
    if (!d) return null

    let stroke = colorStr(path.strokeColor) || 'none'
    let fill = colorStr(path.fillColor) || 'none'

    if (mode === 'lightburn') {
      if (cutType === 'print') {
        stroke = '#9b59b6'
        // keep fill for print artwork
      } else {
        stroke =
          MACHINE_CUT_COLORS[
            cutType === 'score' || cutType === 'engrave' ? cutType : 'cut'
          ]
        fill = 'none'
      }
    } else if (mode === 'glowforge') {
      if (cutType === 'print') {
        stroke = '#9b59b6'
      } else if (cutType === 'engrave') {
        stroke = MACHINE_CUT_COLORS.engrave
        fill = MACHINE_CUT_COLORS.engrave
      } else if (cutType === 'score') {
        stroke = MACHINE_CUT_COLORS.score
        fill = 'none'
      } else {
        stroke = MACHINE_CUT_COLORS.cut
        fill = 'none'
      }
    } else if (mode === 'silhouette') {
      // Keep document colors; hairline stroke already applied
      // Print keeps fills; cut/score typically stroke-only
      if (cutType !== 'engrave' && cutType !== 'print' && fill !== 'none') {
        fill = 'none'
      }
    }

    const dash =
      mode === 'silhouette' && path.dashArray && path.dashArray.length
        ? ` stroke-dasharray="${path.dashArray.map((x) => fmt(x * scale)).join(' ')}"`
        : ''
    const hair = useHairline || mode === 'silhouette' ? ` data-hairline="true"` : ''
    return `  <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(strokeW)}"${dash} data-cut-type="${cutType}" data-name="${escapeXml(String(item.data?.name || ''))}"${hair}/>`
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

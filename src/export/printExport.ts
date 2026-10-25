import paper from 'paper'
import { jsPDF } from 'jspdf'
import type { PagePreset } from '../types'
import { PX_PER_MM } from '../types'
import { REG_MARK_INSET_MM, REG_MARK_SIZE_MM } from '../canvas/regMarks'

void paper

export type PrintExportKind = 'png' | 'pdf'

/**
 * Rasterize printable artwork (cutType=print + registration marks) to PNG/PDF.
 * Cut/Score/Engrave strokes are hidden so the inkjet sheet only has artwork + marks.
 */
export async function exportPrintSheet(
  items: paper.Item[],
  page: PagePreset,
  kind: PrintExportKind,
  dpi = 150,
): Promise<{ blob: Blob; filename: string; mime: string }> {
  const scale = (dpi / 25.4) / PX_PER_MM // px per document-px at target dpi
  const wPx = Math.max(1, Math.round(page.widthMm * dpi / 25.4))
  const hPx = Math.max(1, Math.round(page.heightMm * dpi / 25.4))

  const canvas = document.createElement('canvas')
  canvas.width = wPx
  canvas.height = hPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')

  // White page
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, wPx, hPx)

  const mm = (n: number) => (n * dpi) / 25.4

  // Draw reg marks (always — needed for print-and-cut alignment)
  drawRegMarks(ctx, page, mm)

  for (const item of items) {
    walkDraw(item, ctx, scale, true)
  }

  const pngBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
      'image/png',
    )
  })

  if (kind === 'png') {
    return {
      blob: pngBlob,
      filename: 'cutforge-print.png',
      mime: 'image/png',
    }
  }

  // PDF in mm page size with embedded PNG
  const pdf = new jsPDF({
    orientation: page.widthMm >= page.heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [page.widthMm, page.heightMm],
  })
  const dataUrl = canvas.toDataURL('image/png')
  pdf.addImage(dataUrl, 'PNG', 0, 0, page.widthMm, page.heightMm)
  const pdfBlob = pdf.output('blob')
  return {
    blob: pdfBlob,
    filename: 'cutforge-print.pdf',
    mime: 'application/pdf',
  }
}

function drawRegMarks(
  ctx: CanvasRenderingContext2D,
  page: PagePreset,
  mm: (n: number) => number,
) {
  const size = mm(REG_MARK_SIZE_MM)
  const inset = mm(REG_MARK_INSET_MM)
  const w = mm(page.widthMm)
  const h = mm(page.heightMm)
  ctx.fillStyle = '#000000'
  const corners = [
    [inset, inset],
    [w - inset - size, inset],
    [inset, h - inset - size],
    [w - inset - size, h - inset - size],
  ]
  for (const [x, y] of corners) {
    ctx.fillRect(x, y, size, size)
  }
}

function walkDraw(
  item: paper.Item,
  ctx: CanvasRenderingContext2D,
  scale: number,
  printOnly: boolean,
) {
  if (!item.visible) return
  if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) return
  // Reg marks drawn separately at known positions
  if (item.data?.isRegMark) return

  const ct = (item.data?.cutType as string) || 'cut'
  if (printOnly && ct !== 'print') {
    // Still walk groups
    if (item.children?.length) {
      for (const c of item.children) walkDraw(c, ctx, scale, printOnly)
    }
    return
  }

  if (item.className === 'PointText') {
    const t = item as paper.PointText
    ctx.save()
    ctx.fillStyle = colorCss(t.fillColor) || '#000'
    ctx.font = `${Number(t.fontSize) * scale}px Inter, sans-serif`
    ctx.fillText(t.content || '', t.point.x * scale, t.point.y * scale)
    ctx.restore()
    return
  }

  if (item.className === 'Path' || item.className === 'CompoundPath') {
    drawPathItem(item as paper.PathItem, ctx, scale)
    return
  }

  if (item.children?.length) {
    for (const c of item.children) walkDraw(c, ctx, scale, printOnly)
  }
}

function drawPathItem(
  item: paper.PathItem,
  ctx: CanvasRenderingContext2D,
  scale: number,
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
    ctx.beginPath()
    const first = path.segments[0]
    ctx.moveTo(first.point.x * scale, first.point.y * scale)
    for (let i = 1; i < path.segments.length; i++) {
      const seg = path.segments[i]
      const prev = path.segments[i - 1]
      if (!prev.handleOut.isZero() || !seg.handleIn.isZero()) {
        const cp1 = prev.point.add(prev.handleOut)
        const cp2 = seg.point.add(seg.handleIn)
        ctx.bezierCurveTo(
          cp1.x * scale,
          cp1.y * scale,
          cp2.x * scale,
          cp2.y * scale,
          seg.point.x * scale,
          seg.point.y * scale,
        )
      } else {
        ctx.lineTo(seg.point.x * scale, seg.point.y * scale)
      }
    }
    if (path.closed) ctx.closePath()

    const fill = colorCss(path.fillColor)
    const stroke = colorCss(path.strokeColor)
    if (fill && fill !== 'none') {
      ctx.fillStyle = fill
      ctx.fill()
    }
    if (stroke && stroke !== 'none') {
      ctx.strokeStyle = stroke
      ctx.lineWidth = Math.max(
        0.5,
        ((path.strokeWidth as number) || 1) * scale,
      )
      ctx.stroke()
    }
  }
}

function colorCss(c: paper.Color | null): string | null {
  if (!c) return null
  if (c.alpha === 0) return 'none'
  const r = Math.round(c.red * 255)
  const g = Math.round(c.green * 255)
  const b = Math.round(c.blue * 255)
  if (c.alpha < 1) return `rgba(${r},${g},${b},${c.alpha})`
  return `rgb(${r},${g},${b})`
}

/** Filter items for cut send/export: exclude print artwork. */
export function filterCutItems(items: paper.Item[]): paper.Item[] {
  const out: paper.Item[] = []
  const walk = (item: paper.Item) => {
    if (!item.visible || item.data?.locked) return
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) return
    const ct = (item.data?.cutType as string) || 'cut'
    if (ct === 'print') return
    if (
      item.className === 'Path' ||
      item.className === 'CompoundPath' ||
      item.className === 'PointText' ||
      item.data?.isRegMark
    ) {
      out.push(item)
      return
    }
    if (item.children) for (const c of item.children) walk(c)
  }
  for (const i of items) walk(i)
  return out
}

export function filterPrintItems(items: paper.Item[]): paper.Item[] {
  const out: paper.Item[] = []
  const walk = (item: paper.Item) => {
    if (!item.visible) return
    if (item.data?.isGuide || item.data?.isHandle || item.data?.isPage) return
    if (item.data?.isRegMark) return
    const ct = (item.data?.cutType as string) || 'cut'
    if (ct === 'print') {
      out.push(item)
      return
    }
    if (item.children) for (const c of item.children) walk(c)
  }
  for (const i of items) walk(i)
  return out
}

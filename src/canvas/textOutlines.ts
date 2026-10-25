import opentype from 'opentype.js'
import paper from 'paper'
import { fontById } from '../fonts/catalog'

const fontCache = new Map<string, opentype.Font>()

async function loadFont(fontId: string): Promise<opentype.Font> {
  const meta = fontById(fontId)
  const cached = fontCache.get(meta.id)
  if (cached) return cached
  const buf = await fetch(meta.url).then((r) => {
    if (!r.ok) throw new Error(`Font load failed: ${meta.url}`)
    return r.arrayBuffer()
  })
  const font = opentype.parse(buf)
  fontCache.set(meta.id, font)
  return font
}

/** Build a Paper path (or compound) from opentype.js path commands. */
function paperFromOtPath(otPath: opentype.Path): paper.Path | paper.CompoundPath {
  const paths: paper.Path[] = []
  let current: paper.Path | null = null

  const ensure = () => {
    if (!current) {
      current = new paper.Path({ insert: false })
      paths.push(current)
    }
    return current
  }

  for (const cmd of otPath.commands) {
    if (cmd.type === 'M') {
      current = new paper.Path({ insert: false })
      paths.push(current)
      current.moveTo(new paper.Point(cmd.x!, cmd.y!))
    } else if (cmd.type === 'L') {
      ensure().lineTo(new paper.Point(cmd.x!, cmd.y!))
    } else if (cmd.type === 'C') {
      ensure().cubicCurveTo(
        new paper.Point(cmd.x1!, cmd.y1!),
        new paper.Point(cmd.x2!, cmd.y2!),
        new paper.Point(cmd.x!, cmd.y!),
      )
    } else if (cmd.type === 'Q') {
      ensure().quadraticCurveTo(
        new paper.Point(cmd.x1!, cmd.y1!),
        new paper.Point(cmd.x!, cmd.y!),
      )
    } else if (cmd.type === 'Z') {
      if (current) current.closePath()
      current = null
    }
  }

  const nonempty = paths.filter((p) => p.segments.length > 0)
  if (nonempty.length === 0) return new paper.Path({ insert: false })
  if (nonempty.length === 1) return nonempty[0]
  return new paper.CompoundPath({ children: nonempty, insert: false })
}

/**
 * Convert a Paper PointText into outlined vector paths using a bundled font.
 * Caller inserts into the document layer and removes the original text.
 */
export async function convertPointTextToOutlines(
  item: paper.PointText,
  fontId = 'inter',
): Promise<paper.Item | null> {
  const content = item.content?.trim()
  if (!content) return null

  const font = await loadFont(fontId)
  const fontSize = Number(item.fontSize) || 18
  const otPath = font.getPath(content, 0, 0, fontSize)
  const outlined = paperFromOtPath(otPath)
  if (outlined instanceof paper.Path && outlined.segments.length === 0) {
    outlined.remove()
    return null
  }

  // Place at text baseline; then apply linear part of matrix (rotation/scale)
  const pivot = item.point.clone()
  outlined.translate(pivot)

  const rot = item.rotation
  const sx = item.scaling.x
  const sy = item.scaling.y
  if (rot) outlined.rotate(rot, pivot)
  if (sx !== 1 || sy !== 1) outlined.scale(sx, sy, pivot)

  outlined.data.cutType = item.data.cutType || 'cut'
  outlined.data.strokeWidthMm = item.data.strokeWidthMm
  outlined.data.strokeColor = item.data.strokeColor
  outlined.data.fillColor = item.data.fillColor
  outlined.data.hairline = item.data.hairline
  outlined.data.name = `${item.data.name || content.slice(0, 16)} outlines`
  outlined.data.fromText = true

  return outlined
}

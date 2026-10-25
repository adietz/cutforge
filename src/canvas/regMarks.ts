
import paper from 'paper'
import { PX_PER_MM } from '../types'

/** Silhouette-style filled square registration marks (Cameo print-and-cut). */
export const REG_MARK_SIZE_MM = 5
export const REG_MARK_INSET_MM = 8

export function buildRegistrationMarks(
  pageWidthMm: number,
  pageHeightMm: number,
): paper.Group {
  const size = REG_MARK_SIZE_MM * PX_PER_MM
  const inset = REG_MARK_INSET_MM * PX_PER_MM
  const w = pageWidthMm * PX_PER_MM
  const h = pageHeightMm * PX_PER_MM
  const group = new paper.Group()
  group.data.isRegMark = true
  group.data.isGuide = false
  group.data.name = 'Registration marks'
  group.data.cfId = 'reg-marks'
  group.data.locked = true
  group.data.cutType = 'cut'

  const corners = [
    new paper.Point(inset, inset),
    new paper.Point(w - inset - size, inset),
    new paper.Point(inset, h - inset - size),
    new paper.Point(w - inset - size, h - inset - size),
  ]

  for (const origin of corners) {
    const sq = new paper.Path.Rectangle(new paper.Rectangle(origin, new paper.Size(size, size)))
    sq.fillColor = new paper.Color('#000000')
    sq.strokeColor = null
    sq.data.isRegMark = true
    sq.data.cutType = 'cut'
    sq.data.strokeWidthMm = 0
    group.addChild(sq)
  }
  return group
}

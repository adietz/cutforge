import paper from 'paper'
import type { CutType, DocStyle } from '../types'

export const CUT_TYPE_DEFAULTS: Record<
  CutType,
  { stroke: string; fill: string | null; dash?: number[] }
> = {
  cut: { stroke: '#e74c3c', fill: null },
  score: { stroke: '#f39c12', fill: null, dash: [6, 4] },
  engrave: { stroke: '#3498db', fill: 'rgba(52,152,219,0.25)' },
}

export function applyCutTypeVisual(
  item: paper.Item,
  cutType: CutType,
  style?: Partial<DocStyle>,
) {
  void paper
  const defaults = CUT_TYPE_DEFAULTS[cutType]
  const stroke = style?.strokeColor ?? defaults.stroke
  const fill =
    style?.fillColor !== undefined
      ? style.fillColor
      : cutType === 'engrave'
        ? defaults.fill
        : null

  if (
    item.className === 'Path' ||
    item.className === 'CompoundPath' ||
    item.className === 'Shape'
  ) {
    const path = item as paper.Path
    path.strokeColor = stroke as unknown as paper.Color
    path.fillColor = (fill as unknown as paper.Color) ?? null
    path.dashArray = defaults.dash ?? []
  }
  if (item.className === 'PointText') {
    const t = item as paper.PointText
    t.fillColor = stroke as unknown as paper.Color
    t.strokeColor = null
  }

  item.data.cutType = cutType
  if (style?.strokeWidthMm != null) item.data.strokeWidthMm = style.strokeWidthMm
  if (style?.strokeColor) item.data.strokeColor = style.strokeColor
  if (style?.fillColor !== undefined) item.data.fillColor = style.fillColor
}

export function styleFromItem(item: paper.Item): DocStyle {
  return {
    strokeColor: (item.data.strokeColor as string) || '#e74c3c',
    strokeWidthMm: (item.data.strokeWidthMm as number) || 0.2,
    fillColor: (item.data.fillColor as string | null) ?? null,
    cutType: (item.data.cutType as CutType) || 'cut',
  }
}

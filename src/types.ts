export type Tool =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'freehand'
  | 'text'

export type CutType = 'cut' | 'score' | 'engrave'

export type Unit = 'mm' | 'in'

export type AlignMode =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distributeH'
  | 'distributeV'

export interface PagePreset {
  id: string
  name: string
  widthMm: number
  heightMm: number
}

export interface DocStyle {
  strokeColor: string
  strokeWidthMm: number
  fillColor: string | null
  cutType: CutType
  /** Silhouette hairline ≈ 0.001 in */
  hairline?: boolean
}

export interface LayerInfo {
  id: string
  name: string
  visible: boolean
  locked: boolean
  selected: boolean
  className: string
}

export interface CursorInfo {
  xMm: number
  yMm: number
  xView: number
  yView: number
}

export interface EditorSnapshot {
  selectedCount: number
  style: DocStyle | null
  zoom: number
  status: string
  canUndo: boolean
  canRedo: boolean
  layers: LayerInfo[]
  cursor: CursorInfo | null
  selectedIds: string[]
}

export const INCH_TO_MM = 25.4

/** Internal document units are millimeters. Canvas draws at PX_PER_MM. */
export const PX_PER_MM = 3.7795275591 // ~96dpi

/** Silhouette hairline stroke width. */
export const HAIRLINE_IN = 0.001
export const HAIRLINE_MM = HAIRLINE_IN * INCH_TO_MM

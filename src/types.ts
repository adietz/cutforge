export type Tool =
  | 'select'
  | 'shape'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'freehand'
  | 'text'

export type CutType = 'cut' | 'score' | 'engrave' | 'print'

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

export type BooleanOp = 'unite' | 'subtract' | 'intersect'

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

export interface SnapSettings {
  grid: boolean
  edges: boolean
  smartGuides: boolean
  /** Grid spacing in mm */
  gridMm: number
}

export interface LayerInfo {
  id: string
  name: string
  color: string
  visible: boolean
  locked: boolean
  /** Active layer for new shapes */
  active: boolean
  /** True if any object on this layer is selected */
  selected: boolean
  itemCount: number
  cutType: CutType
  power: number | null
  speed: number | null
  passes: number | null
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
  snap: SnapSettings
  fileName: string | null
  dirty: boolean
  regMarks: boolean
  tool: Tool
  objectCount: number
  canBoolean: boolean
  hasText: boolean
  printAndCut: boolean
  activeLayerId: string
}

export const INCH_TO_MM = 25.4

/** Internal document units are millimeters. Canvas draws at PX_PER_MM. */
export const PX_PER_MM = 3.7795275591 // ~96dpi

/** Silhouette hairline stroke width. */
export const HAIRLINE_IN = 0.001
export const HAIRLINE_MM = HAIRLINE_IN * INCH_TO_MM

export const DEFAULT_SNAP: SnapSettings = {
  grid: true,
  edges: true,
  smartGuides: true,
  gridMm: 5,
}

export const CUTFORGE_VERSION = 2
export const RECOVERY_KEY = 'cutforge-recovery-v1'


export interface ContextMenuAction {
  id: string
  label: string
  disabled?: boolean
  separator?: boolean
}

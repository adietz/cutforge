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
}

export interface EditorState {
  tool: Tool
  unit: Unit
  page: PagePreset
  style: DocStyle
  zoom: number
  selectedCount: number
  status: string
}

export const INCH_TO_MM = 25.4

/** Internal document units are millimeters. Canvas draws at PX_PER_MM. */
export const PX_PER_MM = 3.7795275591 // ~96dpi

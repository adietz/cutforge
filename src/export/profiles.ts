import type { Unit } from '../types'

export type ExportFormat = 'svg' | 'dxf'
export type SvgStyleMode = 'silhouette' | 'lightburn' | 'glowforge' | 'generic'

export interface MachineProfile {
  id: string
  name: string
  description: string
  format: ExportFormat
  /** Profiles that allow switching SVG ↔ DXF in the dialog */
  allowFormatSwitch?: boolean
  unit: Unit
  hairline: boolean
  includeRegMarks: boolean
  flattenText: boolean
  excludeHiddenLocked: boolean
  svgMode: SvgStyleMode
  /** Suggested page preset id (applied when profile is chosen if user opts in) */
  suggestedPageId?: string
  defaultFilename: string
  /** Human-readable coordinate note for Help / dialog */
  coordNote: string
  /** Soft note shown in the export dialog (e.g. no USB send) */
  workflowNote?: string
}

/** Distinct stroke colors for LightBurn / Glowforge / IKIER workflows. */
export const MACHINE_CUT_COLORS = {
  cut: '#FF0000',
  score: '#0000FF',
  engrave: '#000000',
} as const

export const MACHINE_PROFILES: MachineProfile[] = [
  {
    id: 'ikier-k1',
    name: 'IKIER K1',
    description:
      'Primary diode/GRBL laser profile — 410×410 mm. LightBurn-colored SVG or mm DXF for LightBurn / LaserGRBL.',
    format: 'svg',
    allowFormatSwitch: true,
    unit: 'mm',
    hairline: false,
    includeRegMarks: false,
    flattenText: true,
    excludeHiddenLocked: true,
    svgMode: 'lightburn',
    suggestedPageId: 'ikier-k1',
    defaultFilename: 'cutforge-ikier-k1.svg',
    coordNote:
      'SVG: origin top-left, Y-down (LightBurn imports and remaps). DXF: origin bottom-left, Y-up (common CAD/LaserGRBL). LightBurn job origin is typically lower-left on the machine.',
    workflowNote:
      'Open the exported file in LightBurn (Mac/Windows) or LaserGRBL (Windows). CutForge does not send G-code or talk to the laser over USB yet.',
  },
  {
    id: 'silhouette-cameo4',
    name: 'Silhouette Cameo 4',
    description: 'Hairline SVG in inches for Studio / Cameo 4 (12×12 mat).',
    format: 'svg',
    unit: 'in',
    hairline: true,
    includeRegMarks: false,
    flattenText: true,
    excludeHiddenLocked: true,
    svgMode: 'silhouette',
    suggestedPageId: 'cameo4',
    defaultFilename: 'cutforge-cameo4.svg',
    coordNote: 'SVG: origin top-left, Y increases downward (Y-down).',
    workflowNote: 'Import into Silhouette Studio. CutForge does not drive the cutter over USB.',
  },
  {
    id: 'silhouette-cameo4plus',
    name: 'Silhouette Cameo 4 Plus',
    description: 'Hairline SVG in inches for Cameo 4 Plus (15×15 mat).',
    format: 'svg',
    unit: 'in',
    hairline: true,
    includeRegMarks: false,
    flattenText: true,
    excludeHiddenLocked: true,
    svgMode: 'silhouette',
    suggestedPageId: 'cameo4plus',
    defaultFilename: 'cutforge-cameo4plus.svg',
    coordNote: 'SVG: origin top-left, Y increases downward (Y-down).',
    workflowNote: 'Import into Silhouette Studio. CutForge does not drive the cutter over USB.',
  },
  {
    id: 'silhouette-portrait',
    name: 'Silhouette Portrait',
    description: 'Hairline SVG in inches for Portrait (8×12).',
    format: 'svg',
    unit: 'in',
    hairline: true,
    includeRegMarks: false,
    flattenText: true,
    excludeHiddenLocked: true,
    svgMode: 'silhouette',
    suggestedPageId: 'portrait',
    defaultFilename: 'cutforge-portrait.svg',
    coordNote: 'SVG: origin top-left, Y increases downward (Y-down).',
    workflowNote: 'Import into Silhouette Studio. CutForge does not drive the cutter over USB.',
  },
  {
    id: 'generic-laser',
    name: 'Generic laser',
    description: 'Millimeter DXF (layers CUT/SCORE/ENGRAVE) or plain SVG.',
    format: 'dxf',
    allowFormatSwitch: true,
    unit: 'mm',
    hairline: false,
    includeRegMarks: false,
    flattenText: true,
    excludeHiddenLocked: true,
    svgMode: 'generic',
    defaultFilename: 'cutforge-laser.dxf',
    coordNote:
      'DXF: origin bottom-left, Y-up. SVG: origin top-left, Y-down.',
    workflowNote: 'No USB/G-code send from CutForge — open the file in your laser software.',
  },
  {
    id: 'lightburn',
    name: 'LightBurn-friendly SVG',
    description:
      'SVG groups by Cut / Score / Engrave with distinct stroke colors for layer mapping.',
    format: 'svg',
    unit: 'mm',
    hairline: false,
    includeRegMarks: false,
    flattenText: true,
    excludeHiddenLocked: true,
    svgMode: 'lightburn',
    defaultFilename: 'cutforge-lightburn.svg',
    coordNote: 'SVG: origin top-left, Y-down. Map colors to operations in LightBurn.',
    workflowNote: 'No USB send from CutForge — import into LightBurn.',
  },
  {
    id: 'glowforge',
    name: 'Glowforge-style SVG',
    description:
      'Simple SVG: red stroke = cut, blue = score, black fill/stroke = engrave.',
    format: 'svg',
    unit: 'in',
    hairline: false,
    includeRegMarks: false,
    flattenText: true,
    excludeHiddenLocked: true,
    svgMode: 'glowforge',
    defaultFilename: 'cutforge-glowforge.svg',
    coordNote: 'SVG: origin top-left, Y-down. Glowforge maps by stroke/fill color.',
    workflowNote: 'No USB send from CutForge — upload in the Glowforge app.',
  },
]

export function profileById(id: string): MachineProfile {
  return MACHINE_PROFILES.find((p) => p.id === id) ?? MACHINE_PROFILES[0]
}

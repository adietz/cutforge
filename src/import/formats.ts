/** Unified vector import format catalog for CutForge. */

export type ImportEngine = 'pure-js' | 'helper' | 'either'

export interface ImportFormatInfo {
  id: string
  extensions: string[]
  label: string
  engine: ImportEngine
  /** Short note shown in the Import dialog */
  note: string
}

export const IMPORT_FORMATS: ImportFormatInfo[] = [
  {
    id: 'svg',
    extensions: ['svg', 'svgz'],
    label: 'SVG',
    engine: 'pure-js',
    note: 'Native Paper.js import. Stroke/fill colors mapped to cut types.',
  },
  {
    id: 'dxf',
    extensions: ['dxf'],
    label: 'DXF (AutoCAD)',
    engine: 'pure-js',
    note: 'Parsed in JS (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, SPLINE).',
  },
  {
    id: 'pdf',
    extensions: ['pdf'],
    label: 'PDF (vectors)',
    engine: 'helper',
    note: 'Desktop: pdftocairo or LibreOffice → SVG. Browser: export SVG first.',
  },
  {
    id: 'ai',
    extensions: ['ai'],
    label: 'Adobe Illustrator',
    engine: 'helper',
    note: 'PDF-based AI via pdftocairo/LibreOffice. Legacy AI/EPS need Ghostscript.',
  },
  {
    id: 'eps',
    extensions: ['eps', 'ps'],
    label: 'EPS / PostScript',
    engine: 'helper',
    note: 'Ghostscript → PDF → SVG, or LibreOffice Draw.',
  },
  {
    id: 'cdr',
    extensions: ['cdr', 'cmx'],
    label: 'CorelDRAW',
    engine: 'helper',
    note: 'LibreOffice Draw (libcdr) or Inkscape CLI if installed. Else export SVG/PDF from Corel.',
  },
  {
    id: 'emf',
    extensions: ['emf', 'wmf', 'emz', 'wmz'],
    label: 'EMF / WMF',
    engine: 'helper',
    note: 'LibreOffice Draw → SVG (desktop). Inkscape preferred when available.',
  },
]

export function formatByExtension(ext: string): ImportFormatInfo | undefined {
  const e = ext.replace(/^\./, '').toLowerCase()
  return IMPORT_FORMATS.find((f) => f.extensions.includes(e))
}

export function acceptAttribute(): string {
  const exts = IMPORT_FORMATS.flatMap((f) => f.extensions.map((e) => `.${e}`))
  return [...new Set(exts)].join(',')
}

export function allExtensions(): string[] {
  return [...new Set(IMPORT_FORMATS.flatMap((f) => f.extensions))]
}

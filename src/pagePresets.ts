import { INCH_TO_MM, type PagePreset } from './types'

export const PAGE_PRESETS: PagePreset[] = [
  {
    id: 'letter',
    name: 'Letter (8.5×11 in)',
    widthMm: 8.5 * INCH_TO_MM,
    heightMm: 11 * INCH_TO_MM,
  },
  {
    id: 'a4',
    name: 'A4 (210×297 mm)',
    widthMm: 210,
    heightMm: 297,
  },
  {
    id: 'cameo4',
    name: 'Silhouette Cameo 4 (12×12 in)',
    widthMm: 12 * INCH_TO_MM,
    heightMm: 12 * INCH_TO_MM,
  },
  {
    id: 'cameo4plus',
    name: 'Cameo 4 Plus (15×15 in)',
    widthMm: 15 * INCH_TO_MM,
    heightMm: 15 * INCH_TO_MM,
  },
  {
    id: 'portrait',
    name: 'Silhouette Portrait (8×12 in)',
    widthMm: 8 * INCH_TO_MM,
    heightMm: 12 * INCH_TO_MM,
  },
  {
    id: 'ikier-k1',
    name: 'IKIER K1 (410×410 mm)',
    widthMm: 410,
    heightMm: 410,
  },
  {
    id: 'custom',
    name: 'Custom',
    widthMm: 200,
    heightMm: 200,
  },
]

export function presetById(id: string): PagePreset {
  return PAGE_PRESETS.find((p) => p.id === id) ?? PAGE_PRESETS[2]
}

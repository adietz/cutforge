import type { LaserColorMapEntry } from './colorMap'
import type { MachineLaserPresets, SilhouettePresets } from './presets'
import {
  DEFAULT_IKIER_PRESETS,
  DEFAULT_SILHOUETTE_PRESETS,
} from './presets'

export type MaterialMachine = 'laser' | 'silhouette'

/**
 * Editable material preset — laser and/or Silhouette settings.
 * Seed defaults ship in code; user edits persist via materialsStore (localStorage).
 */
export interface MaterialPreset {
  id: string
  name: string
  description: string
  machine: MaterialMachine
  /** Thickness hint in mm (display / sorting) */
  thicknessMm?: number
  /** Laser GRBL presets */
  presets?: MachineLaserPresets
  /** Silhouette blade/pen presets */
  silhouette?: SilhouettePresets
  /** Optional color-map defaults applied with laser materials */
  colorMap?: LaserColorMapEntry[]
  /** Built-in seed — can still be edited; reset restores seed */
  builtin?: boolean
}

function laser(
  partial: Partial<MachineLaserPresets> & {
    cut: MachineLaserPresets['cut']
    score: MachineLaserPresets['score']
    engrave: MachineLaserPresets['engrave']
  },
): MachineLaserPresets {
  return {
    travel: partial.travel ?? 3000,
    powerMax: partial.powerMax ?? 1000,
    cut: { passes: 1, ...partial.cut },
    score: { passes: 1, ...partial.score },
    engrave: { passes: 1, ...partial.engrave },
  }
}

/** Built-in seeds — cloned into the editable library on first load. */
export const BUILTIN_MATERIALS: MaterialPreset[] = [
  {
    id: 'custom',
    name: 'Custom (current)',
    description: 'Keep whatever speed/power you already set.',
    machine: 'laser',
    builtin: true,
    presets: clonePresets(DEFAULT_IKIER_PRESETS),
  },
  {
    id: 'basswood-3mm',
    name: 'Basswood / plywood ~3 mm',
    description: 'Diode cut slow/full; light score; mid engrave. Test scrap.',
    machine: 'laser',
    thicknessMm: 3,
    builtin: true,
    presets: laser({
      cut: { speed: 280, power: 1000, passes: 1 },
      score: { speed: 900, power: 180, passes: 1 },
      engrave: {
        speed: 1600,
        power: 400,
        passes: 1,
        hatchMm: 0.2,
        hatchAngleDeg: 0,
        crossHatch: false,
      },
      travel: 3500,
    }),
    colorMap: [
      {
        id: 'mat-bass-cut',
        color: '#e74c3c',
        match: 'stroke',
        power: 1000,
        speed: 280,
        label: 'Basswood cut',
      },
      {
        id: 'mat-bass-score',
        color: '#f39c12',
        match: 'stroke',
        power: 180,
        speed: 900,
        label: 'Basswood score',
      },
      {
        id: 'mat-bass-eng',
        color: '#3498db',
        match: 'fill',
        power: 400,
        speed: 1600,
        label: 'Basswood engrave',
      },
    ],
  },
  {
    id: 'acrylic-3mm',
    name: 'Acrylic ~3 mm',
    description: 'Cast acrylic — slower cut, careful frost engrave. Vent well.',
    machine: 'laser',
    thicknessMm: 3,
    builtin: true,
    presets: laser({
      cut: { speed: 180, power: 1000, passes: 1 },
      score: { speed: 700, power: 220, passes: 1 },
      engrave: {
        speed: 1200,
        power: 350,
        passes: 1,
        hatchMm: 0.15,
        hatchAngleDeg: 45,
        crossHatch: false,
      },
      travel: 3000,
    }),
    colorMap: [
      {
        id: 'mat-acr-cut',
        color: '#e74c3c',
        match: 'stroke',
        power: 1000,
        speed: 180,
        label: 'Acrylic cut',
      },
      {
        id: 'mat-acr-score',
        color: '#f39c12',
        match: 'stroke',
        power: 220,
        speed: 700,
        label: 'Acrylic score',
      },
      {
        id: 'mat-acr-eng',
        color: '#3498db',
        match: 'fill',
        power: 350,
        speed: 1200,
        label: 'Acrylic engrave',
      },
    ],
  },
  {
    id: 'cardboard',
    name: 'Cardboard / chipboard',
    description: 'Corrugated or chipboard — faster; watch fire risk.',
    machine: 'laser',
    thicknessMm: 2,
    builtin: true,
    presets: laser({
      cut: { speed: 600, power: 700, passes: 1 },
      score: { speed: 1200, power: 120, passes: 1 },
      engrave: {
        speed: 2200,
        power: 250,
        passes: 1,
        hatchMm: 0.3,
        hatchAngleDeg: 0,
        crossHatch: false,
      },
      travel: 4000,
    }),
  },
  {
    id: 'leather-2mm',
    name: 'Leather ~1.5–2 mm',
    description: 'Veg-tan / chrome — low power cut; shallow engrave. Smell/vent.',
    machine: 'laser',
    thicknessMm: 2,
    builtin: true,
    presets: laser({
      cut: { speed: 350, power: 850, passes: 1 },
      score: { speed: 800, power: 150, passes: 1 },
      engrave: {
        speed: 1400,
        power: 280,
        passes: 1,
        hatchMm: 0.18,
        hatchAngleDeg: 0,
        crossHatch: false,
      },
      travel: 3000,
    }),
  },
  {
    id: 'sil-vinyl',
    name: 'Vinyl (Cameo / Portrait)',
    description: 'Adhesive vinyl — moderate blade, medium speed.',
    machine: 'silhouette',
    thicknessMm: 0.1,
    builtin: true,
    silhouette: {
      cut: { speed: 5, pressure: 10, tool: 'cut', passes: 1 },
      score: { speed: 8, pressure: 3, tool: 'cut', passes: 1 },
      engrave: { speed: 8, pressure: 6, tool: 'pen', passes: 1 },
      media: 132,
    },
  },
  {
    id: 'sil-cardstock',
    name: 'Cardstock (Silhouette)',
    description: '65–110 lb cardstock — higher force, slower.',
    machine: 'silhouette',
    thicknessMm: 0.3,
    builtin: true,
    silhouette: {
      cut: { speed: 3, pressure: 22, tool: 'cut', passes: 1 },
      score: { speed: 5, pressure: 6, tool: 'cut', passes: 1 },
      engrave: { speed: 6, pressure: 8, tool: 'pen', passes: 1 },
      media: 132,
    },
  },
  {
    id: 'sil-sticker',
    name: 'Printable sticker (Silhouette)',
    description: 'Print-then-cut sticker paper — kiss cut.',
    machine: 'silhouette',
    thicknessMm: 0.15,
    builtin: true,
    silhouette: {
      cut: { speed: 4, pressure: 8, tool: 'cut', passes: 1 },
      score: { speed: 6, pressure: 2, tool: 'cut', passes: 1 },
      engrave: { speed: 8, pressure: 5, tool: 'pen', passes: 1 },
      media: 132,
    },
  },
]

/** @deprecated use loadMaterials() — kept for callers that only need seeds */
export const MATERIAL_PRESETS = BUILTIN_MATERIALS

export function materialById(
  id: string,
  list: MaterialPreset[] = BUILTIN_MATERIALS,
): MaterialPreset {
  return list.find((m) => m.id === id) ?? list[0] ?? BUILTIN_MATERIALS[0]
}

export function clonePresets(p: MachineLaserPresets): MachineLaserPresets {
  return {
    travel: p.travel,
    powerMax: p.powerMax,
    cut: { ...p.cut },
    score: { ...p.score },
    engrave: { ...p.engrave },
  }
}

export function cloneSilhouette(p: SilhouettePresets): SilhouettePresets {
  return {
    media: p.media,
    cut: { ...p.cut },
    score: { ...p.score },
    engrave: { ...p.engrave },
  }
}

export function cloneMaterial(m: MaterialPreset): MaterialPreset {
  return {
    ...m,
    presets: m.presets ? clonePresets(m.presets) : undefined,
    silhouette: m.silhouette ? cloneSilhouette(m.silhouette) : undefined,
    colorMap: m.colorMap?.map((e) => ({ ...e })),
  }
}

export function newMaterialId(prefix = 'mat'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function emptyLaserMaterial(name = 'New laser material'): MaterialPreset {
  return {
    id: newMaterialId('laser'),
    name,
    description: '',
    machine: 'laser',
    thicknessMm: 3,
    presets: clonePresets(DEFAULT_IKIER_PRESETS),
  }
}

export function emptySilhouetteMaterial(
  name = 'New Silhouette material',
): MaterialPreset {
  return {
    id: newMaterialId('sil'),
    name,
    description: '',
    machine: 'silhouette',
    thicknessMm: 0.2,
    silhouette: cloneSilhouette(DEFAULT_SILHOUETTE_PRESETS),
  }
}

/** Power S → percent of powerMax for UI. */
export function powerToPercent(power: number, powerMax: number): number {
  const max = powerMax || 1000
  return Math.round((power / max) * 1000) / 10
}

export function percentToPower(pct: number, powerMax: number): number {
  const max = powerMax || 1000
  return Math.round((pct / 100) * max)
}

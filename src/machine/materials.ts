import type { LaserColorMapEntry } from './colorMap'
import type { MachineLaserPresets } from './presets'
import { DEFAULT_IKIER_PRESETS } from './presets'

/**
 * Material starter packs for IKIER K1–class diode lasers.
 * Values are conservative starting points — always test on scrap.
 */
export interface MaterialPreset {
  id: string
  name: string
  description: string
  presets: MachineLaserPresets
  /** Optional color-map defaults applied with the material */
  colorMap?: LaserColorMapEntry[]
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'custom',
    name: 'Custom (current)',
    description: 'Keep whatever speed/power you already set.',
    presets: { ...DEFAULT_IKIER_PRESETS },
  },
  {
    id: 'plywood-3mm',
    name: 'Plywood ~3 mm',
    description: 'Basswood/baltic birch class — cut slow/full, light score, mid engrave.',
    presets: {
      cut: { speed: 280, power: 1000 },
      score: { speed: 900, power: 180 },
      engrave: {
        speed: 1600,
        power: 400,
        hatchMm: 0.2,
        hatchAngleDeg: 0,
        crossHatch: false,
      },
      travel: 3500,
      powerMax: 1000,
    },
    colorMap: [
      {
        id: 'mat-ply-cut',
        color: '#e74c3c',
        match: 'stroke',
        power: 1000,
        speed: 280,
        label: 'Plywood cut',
      },
      {
        id: 'mat-ply-score',
        color: '#f39c12',
        match: 'stroke',
        power: 180,
        speed: 900,
        label: 'Plywood score',
      },
      {
        id: 'mat-ply-eng',
        color: '#3498db',
        match: 'fill',
        power: 400,
        speed: 1600,
        label: 'Plywood engrave',
      },
    ],
  },
  {
    id: 'acrylic-3mm',
    name: 'Acrylic ~3 mm',
    description: 'Cast acrylic — slower cut, careful engrave (frost). Vent well.',
    presets: {
      cut: { speed: 180, power: 1000 },
      score: { speed: 700, power: 220 },
      engrave: {
        speed: 1200,
        power: 350,
        hatchMm: 0.15,
        hatchAngleDeg: 45,
        crossHatch: false,
      },
      travel: 3000,
      powerMax: 1000,
    },
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
    description: 'Corrugated or chipboard — faster, watch fire risk.',
    presets: {
      cut: { speed: 600, power: 700 },
      score: { speed: 1200, power: 120 },
      engrave: {
        speed: 2200,
        power: 250,
        hatchMm: 0.3,
        hatchAngleDeg: 0,
        crossHatch: false,
      },
      travel: 4000,
      powerMax: 1000,
    },
    colorMap: [
      {
        id: 'mat-card-cut',
        color: '#e74c3c',
        match: 'stroke',
        power: 700,
        speed: 600,
        label: 'Cardboard cut',
      },
      {
        id: 'mat-card-score',
        color: '#f39c12',
        match: 'stroke',
        power: 120,
        speed: 1200,
        label: 'Cardboard score',
      },
      {
        id: 'mat-card-eng',
        color: '#3498db',
        match: 'fill',
        power: 250,
        speed: 2200,
        label: 'Cardboard engrave',
      },
    ],
  },
]

export function materialById(id: string): MaterialPreset {
  return MATERIAL_PRESETS.find((m) => m.id === id) ?? MATERIAL_PRESETS[0]
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

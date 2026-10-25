/** Speed mm/min and GRBL spindle/laser power S (typically 0–1000). */
export interface OpPreset {
  speed: number
  power: number
  /** Engrave hatch spacing in mm */
  hatchMm?: number
  /** Hatch line angle in degrees (0 = horizontal) */
  hatchAngleDeg?: number
  /** Second pass at angle+90° */
  crossHatch?: boolean
}

export interface MachineLaserPresets {
  cut: OpPreset
  score: OpPreset
  engrave: OpPreset
  /** Rapid travel feed */
  travel: number
  /** Power max scale (GRBL $30), usually 1000 */
  powerMax: number
}

/** Defaults tuned for a diode GRBL laser (IKIER K1 class) — user must calibrate. */
export const DEFAULT_IKIER_PRESETS: MachineLaserPresets = {
  cut: { speed: 400, power: 1000 },
  score: { speed: 800, power: 200 },
  engrave: {
    speed: 1800,
    power: 450,
    hatchMm: 0.2,
    hatchAngleDeg: 0,
    crossHatch: false,
  },
  travel: 3000,
  powerMax: 1000,
}

/** Silhouette cut settings (pressure 1–33, speed 1–10). */
export interface SilhouetteOpPreset {
  speed: number
  pressure: number
  /** 'cut' = blade with offset; 'pen' = draw/sketch */
  tool: 'cut' | 'pen'
}

export interface SilhouettePresets {
  cut: SilhouetteOpPreset
  score: SilhouetteOpPreset
  engrave: SilhouetteOpPreset
  media: number
}

export const DEFAULT_SILHOUETTE_PRESETS: SilhouettePresets = {
  cut: { speed: 5, pressure: 10, tool: 'cut' },
  score: { speed: 8, pressure: 3, tool: 'cut' },
  engrave: { speed: 8, pressure: 8, tool: 'pen' },
  media: 132,
}

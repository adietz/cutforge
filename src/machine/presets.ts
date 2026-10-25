/** Speed mm/min and GRBL spindle/laser power S (typically 0–1000). */
export interface OpPreset {
  speed: number
  power: number
  /** Engrave hatch spacing in mm */
  hatchMm?: number
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
  engrave: { speed: 1800, power: 450, hatchMm: 0.25 },
  travel: 3000,
  powerMax: 1000,
}

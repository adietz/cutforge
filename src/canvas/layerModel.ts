import type { CutType } from '../types'

/** Named document layer (not a Paper.js Layer). */
export interface CfLayer {
  id: string
  name: string
  /** UI swatch + default stroke hint */
  color: string
  visible: boolean
  locked: boolean
  cutType: CutType
  /** GRBL S override; null = color map / material */
  power: number | null
  /** mm/min override; null = color map / material */
  speed: number | null
  passes: number | null
}

export const LAYER_PALETTE = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#95a5a6',
]

let layerSeq = 1
export function newLayerId() {
  return `ly-${Date.now().toString(36)}-${layerSeq++}`
}

export function createLayer(
  partial?: Partial<CfLayer> & { name?: string },
): CfLayer {
  const n = layerSeq
  return {
    id: partial?.id || newLayerId(),
    name: partial?.name || `Layer ${n}`,
    color: partial?.color || LAYER_PALETTE[(n - 1) % LAYER_PALETTE.length],
    visible: partial?.visible ?? true,
    locked: partial?.locked ?? false,
    cutType: partial?.cutType || 'cut',
    power: partial?.power ?? null,
    speed: partial?.speed ?? null,
    passes: partial?.passes ?? null,
  }
}

export function cloneLayer(l: CfLayer): CfLayer {
  return { ...l }
}

export function defaultLayers(): CfLayer[] {
  layerSeq = 1
  return [
    createLayer({ name: 'Cut', color: '#e74c3c', cutType: 'cut' }),
    createLayer({ name: 'Score', color: '#f39c12', cutType: 'score' }),
    createLayer({ name: 'Engrave', color: '#3498db', cutType: 'engrave' }),
  ]
}

import type { PagePreset, DocStyle, SnapSettings, Unit } from '../types'
import { CUTFORGE_VERSION, DEFAULT_SNAP } from '../types'
import {
  DEFAULT_LASER_COLOR_MAP,
  parseColorMap,
  type LaserColorMapEntry,
} from '../machine/colorMap'
import type { CfLayer } from '../canvas/layerModel'
import { cloneLayer, defaultLayers } from '../canvas/layerModel'

/** Minimal item shape for serialization (Paper.js Item). */
export interface SerializableItem {
  exportJSON: (options?: { asString?: boolean }) => string | object
}

export interface CutForgeDocument {
  format: 'cutforge'
  version: number
  name: string
  unit: Unit
  page: PagePreset
  style: DocStyle
  snap: SnapSettings
  regMarks?: boolean
  /** Print & Cut workflow (Silhouette) */
  printAndCut?: boolean
  /** Color → laser power/speed map for Send to K1 */
  laserColorMap?: LaserColorMapEntry[]
  /** Named layers (cut order: array index 0 = top of panel = cut first) */
  layers?: CfLayer[]
  activeLayerId?: string
  objects: string[]
  savedAt: string
}

export function serializeDocument(opts: {
  name: string
  unit: Unit
  page: PagePreset
  style: DocStyle
  snap: SnapSettings
  objects: SerializableItem[]
  regMarks?: boolean
  printAndCut?: boolean
  laserColorMap?: LaserColorMapEntry[]
  layers?: CfLayer[]
  activeLayerId?: string
}): string {
  const doc: CutForgeDocument = {
    format: 'cutforge',
    version: CUTFORGE_VERSION,
    name: opts.name,
    unit: opts.unit,
    page: { ...opts.page },
    style: { ...opts.style },
    snap: { ...opts.snap },
    regMarks: !!opts.regMarks,
    printAndCut: !!opts.printAndCut,
    laserColorMap: opts.laserColorMap?.length
      ? opts.laserColorMap
      : DEFAULT_LASER_COLOR_MAP.map((e) => ({ ...e })),
    layers: (opts.layers?.length ? opts.layers : defaultLayers()).map(cloneLayer),
    activeLayerId: opts.activeLayerId,
    objects: opts.objects.map((o) => o.exportJSON({ asString: true }) as string),
    savedAt: new Date().toISOString(),
  }
  return JSON.stringify(doc, null, 2)
}

export function parseDocument(text: string): CutForgeDocument {
  const data = JSON.parse(text) as CutForgeDocument
  if (data.format !== 'cutforge') {
    throw new Error('Not a CutForge project file')
  }
  if (!data.page || !Array.isArray(data.objects)) {
    throw new Error('Invalid CutForge project')
  }
  return {
    ...data,
    version: data.version ?? 1,
    unit: data.unit ?? 'in',
    style: data.style ?? {
      strokeColor: '#e74c3c',
      strokeWidthMm: 0.2,
      fillColor: null,
      cutType: 'cut',
    },
    snap: { ...DEFAULT_SNAP, ...(data.snap || {}) },
    name: data.name || 'Untitled',
    regMarks: !!data.regMarks,
    printAndCut: !!data.printAndCut,
    laserColorMap: parseColorMap(data.laserColorMap),
    layers: Array.isArray(data.layers) && data.layers.length
      ? data.layers.map((l) => cloneLayer(l as CfLayer))
      : undefined,
    activeLayerId: data.activeLayerId,
  }
}

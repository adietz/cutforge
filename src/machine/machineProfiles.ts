/** Named machine connection / bed profiles (localStorage). */

export type MachineKind = 'laser-grbl' | 'silhouette'
export type OriginCorner = 'lower-left' | 'upper-left'
export type ConnType = 'usb' | 'wifi'

export interface MachineProfile {
  id: string
  name: string
  kind: MachineKind
  bedWidthMm: number
  bedHeightMm: number
  origin: OriginCorner
  connection: ConnType
  baud: number
  wifiHost: string
  wifiPort: number
  /** Optional materials library id */
  defaultMaterialId?: string
  /** Optional page preset id (ikier-k1, cameo4, …) */
  pagePresetId?: string
  notes: string
}

const STORAGE_KEY = 'cutforge-machine-profiles-v1'
const ACTIVE_KEY = 'cutforge-active-machine-profile'

export const BUILTIN_PROFILES: MachineProfile[] = [
  {
    id: 'k1-usb',
    name: 'IKIER K1 USB',
    kind: 'laser-grbl',
    bedWidthMm: 410,
    bedHeightMm: 410,
    origin: 'lower-left',
    connection: 'usb',
    baud: 115200,
    wifiHost: '192.168.4.1',
    wifiPort: 8080,
    pagePresetId: 'ikier-k1',
    notes: 'Primary GRBL diode laser over USB serial (115200). Origin lower-left.',
  },
  {
    id: 'k1-wifi',
    name: 'IKIER K1 Wi‑Fi',
    kind: 'laser-grbl',
    bedWidthMm: 410,
    bedHeightMm: 410,
    origin: 'lower-left',
    connection: 'wifi',
    baud: 115200,
    wifiHost: '192.168.4.1',
    wifiPort: 8080,
    pagePresetId: 'ikier-k1',
    notes: 'Experimental TCP to hub AP (often 192.168.4.1:8080). Prefer USB for jobs.',
  },
  {
    id: 'cameo4-usb',
    name: 'Silhouette Cameo 4',
    kind: 'silhouette',
    bedWidthMm: 304.8,
    bedHeightMm: 304.8,
    origin: 'upper-left',
    connection: 'usb',
    baud: 115200,
    wifiHost: '',
    wifiPort: 0,
    pagePresetId: 'cameo4',
    notes: 'Cameo 4 12×12 in mat. USB GPGL send from CutForge.',
  },
]

function clone(p: MachineProfile): MachineProfile {
  return { ...p }
}

export function loadProfiles(): MachineProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return BUILTIN_PROFILES.map(clone)
    const parsed = JSON.parse(raw) as MachineProfile[]
    if (!Array.isArray(parsed) || !parsed.length) return BUILTIN_PROFILES.map(clone)
    return parsed.map(clone)
  } catch {
    return BUILTIN_PROFILES.map(clone)
  }
}

export function saveProfiles(list: MachineProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* */
  }
}

export function getActiveProfileId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || 'k1-usb'
  } catch {
    return 'k1-usb'
  }
}

export function setActiveProfileId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* */
  }
}

export function newProfileId(prefix = 'profile'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function emptyProfile(kind: MachineKind = 'laser-grbl'): MachineProfile {
  if (kind === 'silhouette') {
    return {
      id: newProfileId('sil'),
      name: 'New Silhouette',
      kind: 'silhouette',
      bedWidthMm: 304.8,
      bedHeightMm: 304.8,
      origin: 'upper-left',
      connection: 'usb',
      baud: 115200,
      wifiHost: '',
      wifiPort: 0,
      pagePresetId: 'cameo4',
      notes: '',
    }
  }
  return {
    id: newProfileId('laser'),
    name: 'New laser',
    kind: 'laser-grbl',
    bedWidthMm: 410,
    bedHeightMm: 410,
    origin: 'lower-left',
    connection: 'usb',
    baud: 115200,
    wifiHost: '192.168.4.1',
    wifiPort: 8080,
    pagePresetId: 'ikier-k1',
    notes: '',
  }
}

export function resetProfilesToBuiltin(): MachineProfile[] {
  const list = BUILTIN_PROFILES.map(clone)
  saveProfiles(list)
  setActiveProfileId(list[0].id)
  return list
}

import {
  BUILTIN_MATERIALS,
  cloneMaterial,
  type MaterialPreset,
} from './materials'

const STORAGE_KEY = 'cutforge-materials-v1'

export function loadMaterials(): MaterialPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return BUILTIN_MATERIALS.map(cloneMaterial)
    const parsed = JSON.parse(raw) as MaterialPreset[]
    if (!Array.isArray(parsed) || !parsed.length) {
      return BUILTIN_MATERIALS.map(cloneMaterial)
    }
    // Migrate: ensure machine field
    return parsed.map((m) =>
      cloneMaterial({
        ...m,
        machine: m.machine || 'laser',
      }),
    )
  } catch {
    return BUILTIN_MATERIALS.map(cloneMaterial)
  }
}

export function saveMaterials(list: MaterialPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* quota / private mode */
  }
}

export function resetMaterialsToBuiltin(): MaterialPreset[] {
  const list = BUILTIN_MATERIALS.map(cloneMaterial)
  saveMaterials(list)
  return list
}

/** Upsert one material and persist. */
export function upsertMaterial(
  list: MaterialPreset[],
  mat: MaterialPreset,
): MaterialPreset[] {
  const i = list.findIndex((m) => m.id === mat.id)
  const next =
    i >= 0
      ? list.map((m, idx) => (idx === i ? cloneMaterial(mat) : m))
      : [...list, cloneMaterial(mat)]
  saveMaterials(next)
  return next
}

export function deleteMaterial(
  list: MaterialPreset[],
  id: string,
): MaterialPreset[] {
  const next = list.filter((m) => m.id !== id)
  if (!next.length) return resetMaterialsToBuiltin()
  saveMaterials(next)
  return next
}

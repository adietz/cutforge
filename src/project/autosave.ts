import { RECOVERY_KEY } from '../types'

export function writeRecovery(json: string) {
  try {
    localStorage.setItem(
      RECOVERY_KEY,
      JSON.stringify({ savedAt: Date.now(), json }),
    )
  } catch {
    /* quota */
  }
}

export function readRecovery(): { savedAt: number; json: string } | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt: number; json: string }
    if (!parsed?.json) return null
    return parsed
  } catch {
    return null
  }
}

export function clearRecovery() {
  try {
    localStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* */
  }
}

/** Shift-constrain angles to 15° increments (lines, polygons, rotate). */
export const ANGLE_SNAP_DEG = 15

export function snapAngleRad(radians: number, stepDeg = ANGLE_SNAP_DEG): number {
  const step = (stepDeg * Math.PI) / 180
  return Math.round(radians / step) * step
}

export function snapAngleDeg(degrees: number, stepDeg = ANGLE_SNAP_DEG): number {
  return Math.round(degrees / stepDeg) * stepDeg
}

/** Project `to` onto an angle-snapped ray from `from`. */
export function constrainPointToAngle(
  from: { x: number; y: number },
  to: { x: number; y: number },
  stepDeg = ANGLE_SNAP_DEG,
): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { x: to.x, y: to.y }
  const ang = snapAngleRad(Math.atan2(dy, dx), stepDeg)
  return {
    x: from.x + Math.cos(ang) * len,
    y: from.y + Math.sin(ang) * len,
  }
}

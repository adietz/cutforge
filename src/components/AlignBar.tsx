import { useEffect, useState } from 'react'
import type { AlignMode, BooleanOp } from '../types'

const ACTIONS: {
  id: AlignMode
  label: string
  title: string
  min: number
}[] = [
  { id: 'left', label: '⫷', title: 'Align left (2+ selected)', min: 2 },
  { id: 'center', label: '☰', title: 'Align center (2+ selected)', min: 2 },
  { id: 'right', label: '⫸', title: 'Align right (2+ selected)', min: 2 },
  { id: 'top', label: '⤒', title: 'Align top (2+ selected)', min: 2 },
  { id: 'middle', label: '↕', title: 'Align middle (2+ selected)', min: 2 },
  { id: 'bottom', label: '⤓', title: 'Align bottom (2+ selected)', min: 2 },
  {
    id: 'distributeH',
    label: '⇔',
    title: 'Distribute horizontally (3+ selected)',
    min: 3,
  },
  {
    id: 'distributeV',
    label: '⇕',
    title: 'Distribute vertically (3+ selected)',
    min: 3,
  },
]

const NEST_GAP_KEY = 'cutforge-nest-gap-mm'
const JOIN_TOL_KEY = 'cutforge-join-tol-mm'

export function AlignBar({
  selectedCount,
  objectCount,
  canBoolean,
  canUngroup,
  canJoin,
  joinTolMm,
  onAlign,
  onNest,
  onJoin,
  onBoolean,
  onGroup,
  onUngroup,
  onJoinTol,
}: {
  selectedCount: number
  objectCount: number
  canBoolean: boolean
  canUngroup: boolean
  canJoin: boolean
  joinTolMm: number
  onAlign: (mode: AlignMode) => void
  onNest: (
    mode: 'selection' | 'all',
    opts: { gapMm: number; marginMm: number; allowRotate90: boolean },
  ) => void
  onJoin: () => void
  onBoolean: (op: BooleanOp) => void
  onGroup: () => void
  onUngroup: () => void
  onJoinTol: (mm: number) => void
}) {
  const [gapMm, setGapMm] = useState(2.5)
  const [marginMm, setMarginMm] = useState(3)
  const [rotate90, setRotate90] = useState(true)

  useEffect(() => {
    try {
      const g = localStorage.getItem(NEST_GAP_KEY)
      if (g) setGapMm(Math.max(0, parseFloat(g) || 2.5))
    } catch {
      /* */
    }
  }, [])

  const setGap = (v: number) => {
    setGapMm(v)
    try {
      localStorage.setItem(NEST_GAP_KEY, String(v))
    } catch {
      /* */
    }
  }

  const setTol = (v: number) => {
    onJoinTol(v)
    try {
      localStorage.setItem(JOIN_TOL_KEY, String(v))
    } catch {
      /* */
    }
  }

  const nestOpts = {
    gapMm,
    marginMm,
    allowRotate90: rotate90,
  }

  return (
    <div className="align-bar">
      <div className={`align-group ${selectedCount >= 2 ? '' : 'disabled'}`}>
        <span className="align-label">Align</span>
        {ACTIONS.map((a) => {
          const ok = selectedCount >= a.min
          return (
            <button
              key={a.id}
              type="button"
              className="align-btn"
              title={
                ok
                  ? a.title
                  : `Select ${a.min}+ objects${a.min === 3 ? ' to distribute' : ' to align'}`
              }
              disabled={!ok}
              onClick={() => onAlign(a.id)}
            >
              {a.label}
            </button>
          )
        })}
      </div>

      <div className="align-sep" aria-hidden />

      <div className="align-group">
        <span className="align-label">Arrange</span>
        <button
          type="button"
          className="btn nest-btn"
          disabled={!canJoin}
          title={`Join open paths end-to-end when endpoints ≤ ${joinTolMm} mm`}
          onClick={onJoin}
        >
          Join
        </button>
        <label className="nest-field" title="Join endpoint tolerance">
          Tol
          <input
            type="number"
            min={0.05}
            max={20}
            step={0.1}
            value={joinTolMm}
            onChange={(e) => setTol(+e.target.value)}
          />
          mm
        </label>
        <button
          type="button"
          className="btn nest-btn"
          disabled={!canBoolean}
          title="Weld / Unite closed paths (first + rest)"
          onClick={() => onBoolean('unite')}
        >
          Weld
        </button>
        <button
          type="button"
          className="btn nest-btn"
          disabled={!canBoolean}
          title="Clip / Intersect — keep overlap. First selected = subject"
          onClick={() => onBoolean('intersect')}
        >
          Clip
        </button>
        <button
          type="button"
          className="btn nest-btn"
          disabled={!canBoolean}
          title="Subtract — first selected minus the rest"
          onClick={() => onBoolean('subtract')}
        >
          Subtract
        </button>
        <button
          type="button"
          className="btn nest-btn"
          disabled={!canBoolean}
          title="Exclude / XOR"
          onClick={() => onBoolean('exclude')}
        >
          Exclude
        </button>
        <button
          type="button"
          className="btn nest-btn"
          disabled={selectedCount < 2}
          title="Group selection (⌘G)"
          onClick={onGroup}
        >
          Group
        </button>
        <button
          type="button"
          className="btn nest-btn"
          disabled={!canUngroup}
          title="Ungroup (⌘⇧G)"
          onClick={onUngroup}
        >
          Ungroup
        </button>
      </div>

      <div className="align-sep" aria-hidden />

      <div className="align-group nest-group">
        <span className="align-label">Nest</span>
        <button
          type="button"
          className="btn nest-btn"
          disabled={selectedCount < 1}
          title="Pack selected shapes onto the bed (AABB shelf, optional 90°)"
          onClick={() => onNest('selection', nestOpts)}
        >
          Nest selection
        </button>
        <button
          type="button"
          className="btn nest-btn"
          disabled={objectCount < 1}
          title="Pack all unlocked visible shapes onto the bed"
          onClick={() => onNest('all', nestOpts)}
        >
          Nest all
        </button>
        <label className="nest-field" title="Gap between parts">
          Gap
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={gapMm}
            onChange={(e) => setGap(+e.target.value)}
          />
          mm
        </label>
        <label className="nest-field" title="Margin from sheet edge">
          Margin
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={marginMm}
            onChange={(e) => setMarginMm(+e.target.value)}
          />
          mm
        </label>
        <label className="check nest-check" title="Allow 90° rotations">
          <input
            type="checkbox"
            checked={rotate90}
            onChange={(e) => setRotate90(e.target.checked)}
          />
          90°
        </label>
      </div>
    </div>
  )
}

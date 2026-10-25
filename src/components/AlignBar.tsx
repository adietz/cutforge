
import type { AlignMode } from '../types'

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

export function AlignBar({
  selectedCount,
  onAlign,
}: {
  selectedCount: number
  onAlign: (mode: AlignMode) => void
}) {
  return (
    <div className={`align-bar ${selectedCount >= 2 ? '' : 'disabled'}`}>
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
  )
}

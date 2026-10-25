import type { AlignMode } from '../types'

const ACTIONS: { id: AlignMode; label: string; title: string }[] = [
  { id: 'left', label: '⫷', title: 'Align left' },
  { id: 'center', label: '☰', title: 'Align center' },
  { id: 'right', label: '⫸', title: 'Align right' },
  { id: 'top', label: '⤒', title: 'Align top' },
  { id: 'middle', label: '↕', title: 'Align middle' },
  { id: 'bottom', label: '⤓', title: 'Align bottom' },
  { id: 'distributeH', label: '⇔', title: 'Distribute horizontally' },
  { id: 'distributeV', label: '⇕', title: 'Distribute vertically' },
]

export function AlignBar({
  enabled,
  onAlign,
}: {
  enabled: boolean
  onAlign: (mode: AlignMode) => void
}) {
  return (
    <div className={`align-bar ${enabled ? '' : 'disabled'}`}>
      <span className="align-label">Align</span>
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          className="align-btn"
          title={a.title}
          disabled={!enabled}
          onClick={() => onAlign(a.id)}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}

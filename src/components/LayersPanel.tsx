import type { LayerInfo } from '../types'

export function LayersPanel({
  layers,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onRename,
  onReorder,
}: {
  layers: LayerInfo[]
  onSelect: (id: string, additive: boolean) => void
  onToggleVisible: (id: string, visible: boolean) => void
  onToggleLocked: (id: string, locked: boolean) => void
  onRename: (id: string, name: string) => void
  onReorder: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
}) {
  return (
    <div className="layers-panel">
      <h2>Layers</h2>
      {!layers.length && <p className="hint">No objects yet</p>}
      <ul className="layer-list">
        {layers.map((layer) => (
          <li
            key={layer.id}
            className={layer.selected ? 'layer selected' : 'layer'}
            onClick={(e) => onSelect(layer.id, e.shiftKey)}
          >
            <button
              type="button"
              className="icon-btn"
              title={layer.visible ? 'Hide' : 'Show'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleVisible(layer.id, !layer.visible)
              }}
            >
              {layer.visible ? '👁' : '—'}
            </button>
            <button
              type="button"
              className="icon-btn"
              title={layer.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleLocked(layer.id, !layer.locked)
              }}
            >
              {layer.locked ? '🔒' : '○'}
            </button>
            <input
              className="layer-name"
              value={layer.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRename(layer.id, e.target.value)}
            />
            <div className="layer-order">
              <button
                type="button"
                className="icon-btn"
                title="Bring forward"
                onClick={(e) => {
                  e.stopPropagation()
                  onReorder(layer.id, 'up')
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Send backward"
                onClick={(e) => {
                  e.stopPropagation()
                  onReorder(layer.id, 'down')
                }}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

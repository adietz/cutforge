import type { CutType, LayerInfo } from '../types'

const CUT_TYPES: CutType[] = ['cut', 'score', 'engrave', 'print']

export function LayersPanel({
  layers,
  selectedCount,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onRename,
  onReorder,
  onAdd,
  onDuplicate,
  onDelete,
  onUpdate,
  onMoveSelectionToLayer,
  onSetActive,
}: {
  layers: LayerInfo[]
  selectedCount: number
  onSelect: (id: string, additive: boolean) => void
  onToggleVisible: (id: string, visible: boolean) => void
  onToggleLocked: (id: string, locked: boolean) => void
  onRename: (id: string, name: string) => void
  onReorder: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  onAdd: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (
    id: string,
    partial: Partial<
      Pick<LayerInfo, 'color' | 'cutType' | 'power' | 'speed' | 'passes'>
    >,
  ) => void
  onMoveSelectionToLayer: (id: string) => void
  onSetActive: (id: string) => void
}) {
  return (
    <div className="layers-panel">
      <div className="layers-header">
        <h2>Layers</h2>
        <button type="button" className="btn" onClick={onAdd} title="Add layer">
          +
        </button>
      </div>
      <p className="hint tight">
        Top = cut first. Hidden layers are skipped on export/send. Locked layers
        cannot be edited or nested.
      </p>
      {!layers.length && <p className="hint">No layers</p>}
      <ul className="layer-list">
        {layers.map((layer, idx) => (
          <li
            key={layer.id}
            className={
              'layer' +
              (layer.active ? ' active-layer' : '') +
              (layer.selected ? ' selected' : '')
            }
            onClick={(e) => onSelect(layer.id, e.shiftKey)}
            onDoubleClick={() => onSetActive(layer.id)}
          >
            <button
              type="button"
              className="icon-btn"
              title={layer.visible ? 'Hide (skip cut)' : 'Show'}
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
              type="color"
              className="layer-swatch"
              value={normalizeSwatch(layer.color)}
              title="Layer color"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdate(layer.id, { color: e.target.value })}
            />
            <div className="layer-main">
              <input
                className="layer-name"
                value={layer.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onRename(layer.id, e.target.value)}
              />
              <div className="layer-meta">
                <span className="hint tight">
                  {layer.itemCount} obj
                  {layer.active ? ' · active' : ''} · {layer.cutType}
                </span>
              </div>
              <div
                className="layer-ops"
                onClick={(e) => e.stopPropagation()}
              >
                <select
                  value={layer.cutType}
                  title="Operation"
                  onChange={(e) =>
                    onUpdate(layer.id, {
                      cutType: e.target.value as CutType,
                    })
                  }
                >
                  {CUT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <label title="Power S override (blank = material/color map)">
                  S
                  <input
                    type="number"
                    placeholder="—"
                    value={layer.power ?? ''}
                    onChange={(e) =>
                      onUpdate(layer.id, {
                        power:
                          e.target.value === '' ? null : +e.target.value,
                      })
                    }
                  />
                </label>
                <label title="Speed mm/min override">
                  F
                  <input
                    type="number"
                    placeholder="—"
                    value={layer.speed ?? ''}
                    onChange={(e) =>
                      onUpdate(layer.id, {
                        speed:
                          e.target.value === '' ? null : +e.target.value,
                      })
                    }
                  />
                </label>
                <label title="Passes override">
                  ×
                  <input
                    type="number"
                    min={1}
                    placeholder="—"
                    value={layer.passes ?? ''}
                    onChange={(e) =>
                      onUpdate(layer.id, {
                        passes:
                          e.target.value === '' ? null : +e.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="layer-order">
              <button
                type="button"
                className="icon-btn"
                title="Move up (cut earlier)"
                disabled={idx === 0}
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
                title="Move down (cut later)"
                disabled={idx === layers.length - 1}
                onClick={(e) => {
                  e.stopPropagation()
                  onReorder(layer.id, 'down')
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Duplicate layer"
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate(layer.id)
                }}
              >
                ⧉
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Delete layer"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(layer.id)
                }}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <select
          disabled={selectedCount < 1 || layers.length < 1}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onMoveSelectionToLayer(e.target.value)
              e.target.value = ''
            }
          }}
          title="Move selection to layer"
        >
          <option value="">Move selection to…</option>
          {layers.map((l) => (
            <option key={l.id} value={l.id} disabled={l.locked}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function normalizeSwatch(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return (
      '#' +
      c
        .slice(1)
        .split('')
        .map((ch) => ch + ch)
        .join('')
    )
  }
  return '#e74c3c'
}

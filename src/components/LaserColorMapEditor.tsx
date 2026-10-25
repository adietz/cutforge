import {
  DEFAULT_LASER_COLOR_MAP,
  newColorMapEntry,
  normalizeHex,
  type ColorMatchMode,
  type LaserColorMapEntry,
} from '../machine/colorMap'

export function LaserColorMapEditor({
  map,
  onChange,
  compact,
}: {
  map: LaserColorMapEntry[]
  onChange: (next: LaserColorMapEntry[]) => void
  compact?: boolean
}) {
  const update = (id: string, partial: Partial<LaserColorMapEntry>) => {
    onChange(
      map.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...partial }
        if (partial.color != null) {
          const n = normalizeHex(partial.color)
          next.color = n || partial.color
        }
        return next
      }),
    )
  }

  return (
    <div className={`color-map-editor ${compact ? 'compact' : ''}`}>
      <p className="hint tight">
        Matching colors override Cut/Score/Engrave power (and speed if set) when
        sending to the K1. Stroke → vectors; fill → engrave fills.
      </p>
      <div className="color-map-rows">
        {map.map((row) => (
          <div key={row.id} className="color-map-row">
            <input
              type="color"
              value={normalizeHex(row.color) || '#ffffff'}
              title="Color"
              onChange={(e) => update(row.id, { color: e.target.value })}
            />
            <input
              type="text"
              className="hex-input"
              value={row.color}
              spellCheck={false}
              onChange={(e) => update(row.id, { color: e.target.value })}
              onBlur={(e) => {
                const n = normalizeHex(e.target.value)
                if (n) update(row.id, { color: n })
              }}
            />
            <select
              value={row.match}
              title="Match stroke, fill, or either"
              onChange={(e) =>
                update(row.id, { match: e.target.value as ColorMatchMode })
              }
            >
              <option value="stroke">Stroke</option>
              <option value="fill">Fill</option>
              <option value="either">Either</option>
            </select>
            <label className="mini">
              S
              <input
                type="number"
                min={0}
                max={1000}
                value={row.power}
                onChange={(e) => update(row.id, { power: +e.target.value })}
              />
            </label>
            <label className="mini">
              F
              <input
                type="number"
                min={0}
                placeholder="—"
                value={row.speed ?? ''}
                onChange={(e) =>
                  update(row.id, {
                    speed: e.target.value === '' ? undefined : +e.target.value,
                  })
                }
              />
            </label>
            <input
              type="text"
              className="label-input"
              placeholder="Label"
              value={row.label ?? ''}
              onChange={(e) => update(row.id, { label: e.target.value })}
            />
            <button
              type="button"
              className="btn"
              title="Remove"
              onClick={() => onChange(map.filter((r) => r.id !== row.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange([
              ...map,
              newColorMapEntry({ color: '#ffffff', power: 500, match: 'stroke' }),
            ])
          }
        >
          Add color
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange(DEFAULT_LASER_COLOR_MAP.map((e) => ({ ...e })))
          }
        >
          Reset defaults
        </button>
      </div>
    </div>
  )
}

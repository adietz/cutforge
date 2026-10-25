import { PAGE_PRESETS } from '../pagePresets'
import type { CutType, DocStyle, LayerInfo, PagePreset, Unit } from '../types'
import { HAIRLINE_MM, INCH_TO_MM } from '../types'
import { LayersPanel } from './LayersPanel'

export function Inspector({
  unit,
  page,
  style,
  selectedCount,
  zoom,
  layers,
  onUnit,
  onPage,
  onCustomSize,
  onStyle,
  onDelete,
  onDuplicate,
  onFit,
  onZoom,
  onSelectLayer,
  onToggleVisible,
  onToggleLocked,
  onRenameLayer,
  onReorderLayer,
}: {
  unit: Unit
  page: PagePreset
  style: DocStyle
  selectedCount: number
  zoom: number
  layers: LayerInfo[]
  onUnit: (u: Unit) => void
  onPage: (id: string) => void
  onCustomSize: (w: number, h: number) => void
  onStyle: (partial: Partial<DocStyle>) => void
  onDelete: () => void
  onDuplicate: () => void
  onFit: () => void
  onZoom: (z: number) => void
  onSelectLayer: (id: string, additive: boolean) => void
  onToggleVisible: (id: string, visible: boolean) => void
  onToggleLocked: (id: string, locked: boolean) => void
  onRenameLayer: (id: string, name: string) => void
  onReorderLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
}) {
  const toDisplay = (mm: number) =>
    unit === 'in' ? +(mm / INCH_TO_MM).toFixed(3) : +mm.toFixed(2)
  const fromDisplay = (v: number) => (unit === 'in' ? v * INCH_TO_MM : v)

  return (
    <aside className="inspector">
      <h2>Document</h2>
      <label className="field">
        <span>Page</span>
        <select value={page.id} onChange={(e) => onPage(e.target.value)}>
          {PAGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <label className="field">
          <span>W ({unit})</span>
          <input
            type="number"
            step="0.1"
            value={toDisplay(page.widthMm)}
            onChange={(e) =>
              onCustomSize(fromDisplay(+e.target.value), page.heightMm)
            }
          />
        </label>
        <label className="field">
          <span>H ({unit})</span>
          <input
            type="number"
            step="0.1"
            value={toDisplay(page.heightMm)}
            onChange={(e) =>
              onCustomSize(page.widthMm, fromDisplay(+e.target.value))
            }
          />
        </label>
      </div>

      <div className="seg">
        <button
          type="button"
          className={unit === 'mm' ? 'active' : ''}
          onClick={() => onUnit('mm')}
        >
          mm
        </button>
        <button
          type="button"
          className={unit === 'in' ? 'active' : ''}
          onClick={() => onUnit('in')}
        >
          in
        </button>
      </div>

      <h2>View</h2>
      <div className="row">
        <button type="button" className="btn" onClick={onFit}>
          Fit page
        </button>
        <label className="field grow">
          <span>Zoom {(zoom * 100).toFixed(0)}%</span>
          <input
            type="range"
            min={10}
            max={400}
            value={Math.round(zoom * 100)}
            onChange={(e) => onZoom(+e.target.value / 100)}
          />
        </label>
      </div>

      <h2>Style {selectedCount ? `(${selectedCount})` : ''}</h2>

      <div className="seg cut-types">
        {(['cut', 'score', 'engrave'] as CutType[]).map((ct) => (
          <button
            key={ct}
            type="button"
            className={`${ct} ${style.cutType === ct ? 'active' : ''}`}
            onClick={() => onStyle({ cutType: ct })}
          >
            {ct}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Stroke</span>
        <input
          type="color"
          value={style.strokeColor.startsWith('#') ? style.strokeColor : '#e74c3c'}
          onChange={(e) => onStyle({ strokeColor: e.target.value })}
        />
      </label>

      <label className="check-field">
        <input
          type="checkbox"
          checked={!!style.hairline}
          onChange={(e) =>
            onStyle(
              e.target.checked
                ? { hairline: true, strokeWidthMm: HAIRLINE_MM }
                : { hairline: false, strokeWidthMm: 0.2 },
            )
          }
        />
        <span>Hairline (0.001 in) — Silhouette SVG</span>
      </label>

      <label className="field">
        <span>Stroke width (mm)</span>
        <input
          type="number"
          min={0.001}
          step={0.001}
          disabled={!!style.hairline}
          value={+style.strokeWidthMm.toFixed(4)}
          onChange={(e) =>
            onStyle({ strokeWidthMm: +e.target.value, hairline: false })
          }
        />
      </label>

      <label className="field">
        <span>Fill (engrave / none for cut)</span>
        <div className="row">
          <input
            type="color"
            value={
              style.fillColor && style.fillColor.startsWith('#')
                ? style.fillColor
                : '#3498db'
            }
            onChange={(e) => onStyle({ fillColor: e.target.value })}
          />
          <button
            type="button"
            className="btn"
            onClick={() => onStyle({ fillColor: null })}
          >
            None
          </button>
        </div>
      </label>

      <h2>Selection</h2>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={onDuplicate}
          disabled={!selectedCount}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={onDelete}
          disabled={!selectedCount}
        >
          Delete
        </button>
      </div>

      <LayersPanel
        layers={layers}
        onSelect={onSelectLayer}
        onToggleVisible={onToggleVisible}
        onToggleLocked={onToggleLocked}
        onRename={onRenameLayer}
        onReorder={onReorderLayer}
      />

      <p className="hint">
        Cut = stroke only. Score = dashed. Engrave = filled. Hairline SVG for
        Silhouette Studio; DXF for laser controllers.
      </p>
    </aside>
  )
}

import { PAGE_PRESETS } from '../pagePresets'
import type { CutType, DocStyle, PagePreset, Unit } from '../types'
import { INCH_TO_MM } from '../types'

export function Inspector({
  unit,
  page,
  style,
  selectedCount,
  zoom,
  onUnit,
  onPage,
  onCustomSize,
  onStyle,
  onDelete,
  onDuplicate,
  onFit,
  onZoom,
}: {
  unit: Unit
  page: PagePreset
  style: DocStyle
  selectedCount: number
  zoom: number
  onUnit: (u: Unit) => void
  onPage: (id: string) => void
  onCustomSize: (w: number, h: number) => void
  onStyle: (partial: Partial<DocStyle>) => void
  onDelete: () => void
  onDuplicate: () => void
  onFit: () => void
  onZoom: (z: number) => void
}) {
  const toDisplay = (mm: number) =>
    unit === 'in' ? +(mm / INCH_TO_MM).toFixed(3) : +mm.toFixed(2)
  const fromDisplay = (v: number) => (unit === 'in' ? v * INCH_TO_MM : v)

  return (
    <aside className="inspector">
      <h2>Document</h2>
      <label className="field">
        <span>Page</span>
        <select
          value={page.id}
          onChange={(e) => onPage(e.target.value)}
        >
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

      <label className="field">
        <span>Stroke width (mm)</span>
        <input
          type="number"
          min={0.05}
          step={0.05}
          value={style.strokeWidthMm}
          onChange={(e) => onStyle({ strokeWidthMm: +e.target.value })}
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
        <button type="button" className="btn" onClick={onDuplicate} disabled={!selectedCount}>
          Duplicate
        </button>
        <button type="button" className="btn danger" onClick={onDelete} disabled={!selectedCount}>
          Delete
        </button>
      </div>

      <p className="hint">
        Cut = stroke only (Silhouette / laser cut). Score = dashed. Engrave = filled.
        Export SVG for Silhouette Studio; DXF for most laser controllers.
      </p>
    </aside>
  )
}

import { useState } from 'react'
import { PAGE_PRESETS } from '../pagePresets'
import type {
  BooleanOp,
  CutType,
  DocStyle,
  LayerInfo,
  PagePreset,
  SnapSettings,
  Unit,
} from '../types'
import { HAIRLINE_MM, INCH_TO_MM } from '../types'
import { LayersPanel } from './LayersPanel'
import { BUNDLED_FONTS } from '../fonts/catalog'
import { LaserColorMapEditor } from './LaserColorMapEditor'
import { normalizeHex, type LaserColorMapEntry } from '../machine/colorMap'

export function Inspector({
  unit,
  page,
  style,
  selectedCount,
  zoom,
  layers,
  snap,
  onUnit,
  onPage,
  onCustomSize,
  onStyle,
  onSnap,
  onDelete,
  onDuplicate,
  onFit,
  onZoom,
  onSelectLayer,
  onToggleVisible,
  onToggleLocked,
  onRenameLayer,
  onReorderLayer,
  onBoolean,
  onOffset,
  regMarks,
  onRegMarks,
  printAndCut,
  onPrintAndCut,
  onExportPrintPng,
  onExportPrintPdf,
  onExportCutSvg,
  canBoolean,
  hasText,
  outlineFontId,
  onOutlineFont,
  onConvertOutlines,
  onOpenTrace,
  laserColorMap,
  onLaserColorMap,
}: {
  unit: Unit
  page: PagePreset
  style: DocStyle
  selectedCount: number
  zoom: number
  layers: LayerInfo[]
  snap: SnapSettings
  onUnit: (u: Unit) => void
  onPage: (id: string) => void
  onCustomSize: (w: number, h: number) => void
  onStyle: (partial: Partial<DocStyle>) => void
  onSnap: (partial: Partial<SnapSettings>) => void
  onDelete: () => void
  onDuplicate: () => void
  onFit: () => void
  onZoom: (z: number) => void
  onSelectLayer: (id: string, additive: boolean) => void
  onToggleVisible: (id: string, visible: boolean) => void
  onToggleLocked: (id: string, locked: boolean) => void
  onRenameLayer: (id: string, name: string) => void
  onReorderLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  onBoolean: (op: BooleanOp) => void
  onOffset: (offsetMm: number) => void
  regMarks: boolean
  onRegMarks: (enabled: boolean) => void
  printAndCut: boolean
  onPrintAndCut: (enabled: boolean) => void
  onExportPrintPng: () => void
  onExportPrintPdf: () => void
  onExportCutSvg: () => void
  canBoolean: boolean
  hasText: boolean
  outlineFontId: string
  onOutlineFont: (id: string) => void
  onConvertOutlines: () => void
  onOpenTrace: () => void
  laserColorMap: LaserColorMapEntry[]
  onLaserColorMap: (map: LaserColorMapEntry[]) => void
}) {
  const toDisplay = (mm: number) =>
    unit === 'in' ? +(mm / INCH_TO_MM).toFixed(3) : +mm.toFixed(2)
  const fromDisplay = (v: number) => (unit === 'in' ? v * INCH_TO_MM : v)
  const [kerf, setKerf] = useState(0.1)

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

            <label className="check-field">
        <input
          type="checkbox"
          checked={regMarks}
          onChange={(e) => onRegMarks(e.target.checked)}
        />
        <span>Registration marks</span>
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={printAndCut}
          onChange={(e) => onPrintAndCut(e.target.checked)}
        />
        <span>Print &amp; Cut mode (enables marks)</span>
      </label>
      {printAndCut && (
        <div className="print-cut-actions">
          <p className="hint tight">
            Mark artwork as <strong>print</strong> (inkjet). Knife paths stay
            Cut/Score. Export print sheet, then cut with marks.
          </p>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={onExportPrintPng}>
              Print PNG
            </button>
            <button type="button" className="btn" onClick={onExportPrintPdf}>
              Print PDF
            </button>
            <button type="button" className="btn" onClick={onExportCutSvg}>
              Cut SVG
            </button>
          </div>
        </div>
      )}

      <p className="hint tight">
        Four corner marks for Cameo print-and-cut; included in SVG export.
      </p>

      <h2>Snap</h2>
      <label className="check-field">
        <input
          type="checkbox"
          checked={snap.grid}
          onChange={(e) => onSnap({ grid: e.target.checked })}
        />
        <span>Grid snap</span>
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={snap.edges}
          onChange={(e) => onSnap({ edges: e.target.checked })}
        />
        <span>Edge / endpoint snap</span>
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={snap.smartGuides}
          onChange={(e) => onSnap({ smartGuides: e.target.checked })}
        />
        <span>Smart guides</span>
      </label>
      <label className="field">
        <span>Grid spacing (mm)</span>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={snap.gridMm}
          onChange={(e) => onSnap({ gridMm: Math.max(0.5, +e.target.value) })}
        />
      </label>

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
        {(['cut', 'score', 'engrave', 'print'] as CutType[]).map((ct) => (
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
        <span>Line (stroke) color</span>
        <div className="row color-row">
          <input
            type="color"
            value={
              normalizeHex(style.strokeColor) || '#e74c3c'
            }
            onChange={(e) => onStyle({ strokeColor: e.target.value })}
            title="Stroke color"
          />
          <input
            type="text"
            className="hex-input"
            spellCheck={false}
            value={style.strokeColor}
            onChange={(e) => onStyle({ strokeColor: e.target.value })}
            onBlur={(e) => {
              const n = normalizeHex(e.target.value)
              if (n) onStyle({ strokeColor: n })
            }}
          />
        </div>
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
        <span>Fill color</span>
        <div className="row color-row">
          <input
            type="color"
            value={
              style.fillColor && normalizeHex(style.fillColor)
                ? normalizeHex(style.fillColor)
                : '#3498db'
            }
            onChange={(e) => onStyle({ fillColor: e.target.value })}
            title="Fill color"
          />
          <input
            type="text"
            className="hex-input"
            spellCheck={false}
            placeholder="none"
            value={style.fillColor ?? ''}
            onChange={(e) =>
              onStyle({
                fillColor: e.target.value.trim() === '' ? null : e.target.value,
              })
            }
            onBlur={(e) => {
              if (!e.target.value.trim()) {
                onStyle({ fillColor: null })
                return
              }
              const n = normalizeHex(e.target.value)
              if (n) onStyle({ fillColor: n })
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => onStyle({ fillColor: null })}
          >
            None
          </button>
        </div>
        <p className="hint tight">
          Assign freely on any object. Engrave often uses fill; cut/score usually
          stroke-only. Colors can drive laser power via the map below.
        </p>
      </label>

      <h2>Laser color map</h2>
      <LaserColorMapEditor
        map={laserColorMap}
        onChange={onLaserColorMap}
        compact
      />

      <h2>Text & images</h2>
      <label className="field">
        <span>Outline font (bundled OFL)</span>
        <select
          value={outlineFontId}
          onChange={(e) => onOutlineFont(e.target.value)}
        >
          {BUNDLED_FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.license})
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn"
        disabled={!hasText}
        title={
          hasText
            ? 'Convert selected text to editable vector paths'
            : 'Select a text object first'
        }
        onClick={onConvertOutlines}
      >
        Convert text to outlines
      </button>
      <button
        type="button"
        className="btn"
        style={{ marginTop: 8 }}
        onClick={onOpenTrace}
        title="Import PNG/JPG and vectorize for cut paths"
      >
        Trace image…
      </button>
      <p className="hint tight">
        Outlines use offline OFL fonts (Inter, Open Sans). Tracing works best on
        high-contrast logos and line art.
      </p>

      <h2>Path ops</h2>
      <div className="row wrap">
        <button
          type="button"
          className="btn"
          disabled={!canBoolean}
          title={
            canBoolean
              ? 'Unite selected closed paths'
              : 'Select 2+ closed paths (rect, ellipse, closed polygon)'
          }
          onClick={() => onBoolean('unite')}
        >
          Unite
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canBoolean}
          title={
            canBoolean
              ? 'Subtract others from first selected'
              : 'Select 2+ closed paths'
          }
          onClick={() => onBoolean('subtract')}
        >
          Subtract
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canBoolean}
          title={
            canBoolean
              ? 'Intersect selected closed paths'
              : 'Select 2+ closed paths'
          }
          onClick={() => onBoolean('intersect')}
        >
          Intersect
        </button>
      </div>
      <label className="field">
        <span>Kerf offset ({unit})</span>
        <div className="row">
          <input
            type="number"
            step={unit === 'in' ? 0.005 : 0.05}
            value={kerf}
            onChange={(e) => setKerf(+e.target.value)}
          />
          <button
            type="button"
            className="btn"
            disabled={!selectedCount}
            onClick={() =>
              onOffset(unit === 'in' ? kerf * INCH_TO_MM : kerf)
            }
          >
            Outset
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selectedCount}
            onClick={() =>
              onOffset(-(unit === 'in' ? kerf * INCH_TO_MM : kerf))
            }
          >
            Inset
          </button>
        </div>
      </label>
      <p className="hint tight">
        Kerf uses a true parallel offset (Clipper). Positive outset / negative
        inset on closed paths. Boolean needs closed paths; first selected is the
        subject for Subtract.
      </p>

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
        Use <strong>Convert text to outlines</strong> before export if your
        cutter ignores fonts. DXF still emits TEXT + bounds for unconverted
        text.
      </p>
    </aside>
  )
}

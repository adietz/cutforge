export function TopBar({
  status,
  canUndo,
  canRedo,
  cursorLabel,
  onImportSvg,
  onExportSvg,
  onExportDxf,
  onUndo,
  onRedo,
  onHelp,
}: {
  status: string
  canUndo: boolean
  canRedo: boolean
  cursorLabel: string
  onImportSvg: () => void
  onExportSvg: () => void
  onExportDxf: () => void
  onUndo: () => void
  onRedo: () => void
  onHelp: () => void
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <strong className="logo">CutForge</strong>
        <span className="tag">laser · silhouette</span>
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn" disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="btn" disabled={!canRedo} onClick={onRedo}>
          Redo
        </button>
        <button type="button" className="btn" onClick={onImportSvg}>
          Import SVG
        </button>
        <button type="button" className="btn primary" onClick={onExportSvg}>
          Export SVG
        </button>
        <button type="button" className="btn primary" onClick={onExportDxf}>
          Export DXF
        </button>
        <button type="button" className="btn" onClick={onHelp} title="Shortcuts (?)">
          Help
        </button>
      </div>
      <div className="topbar-right">
        <span className="cursor-readout" title="Cursor position">
          {cursorLabel}
        </span>
        <div className="topbar-status" title={status}>
          {status}
        </div>
      </div>
    </header>
  )
}

export function TopBar({
  status,
  onImportSvg,
  onExportSvg,
  onExportDxf,
}: {
  status: string
  onImportSvg: () => void
  onExportSvg: () => void
  onExportDxf: () => void
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <strong className="logo">CutForge</strong>
        <span className="tag">laser · silhouette</span>
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn" onClick={onImportSvg}>
          Import SVG
        </button>
        <button type="button" className="btn primary" onClick={onExportSvg}>
          Export SVG
        </button>
        <button type="button" className="btn primary" onClick={onExportDxf}>
          Export DXF
        </button>
      </div>
      <div className="topbar-status" title={status}>
        {status}
      </div>
    </header>
  )
}

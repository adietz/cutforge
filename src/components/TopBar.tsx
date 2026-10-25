export function TopBar({
  status,
  canUndo,
  canRedo,
  cursorLabel,
  fileLabel,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onImport,
  onExportSvg,
  onExportDxf,
  onMachineExport,
  onSendMachine,
  onSendSilhouette,
  onUndo,
  onRedo,
  onHelp,
}: {
  status: string
  canUndo: boolean
  canRedo: boolean
  cursorLabel: string
  fileLabel: string
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onImport: () => void
  onExportSvg: () => void
  onExportDxf: () => void
  onMachineExport: () => void
  onSendMachine: () => void
  onSendSilhouette: () => void
  onUndo: () => void
  onRedo: () => void
  onHelp: () => void
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <strong className="logo">CutForge</strong>
        <span className="tag">laser · silhouette</span>
        <span className="file-label" title={fileLabel}>
          {fileLabel}
        </span>
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn" onClick={onNew}>
          New
        </button>
        <button type="button" className="btn" onClick={onOpen}>
          Open
        </button>
        <button type="button" className="btn" onClick={onSave}>
          Save
        </button>
        <button type="button" className="btn" onClick={onSaveAs}>
          Save As
        </button>
        <button type="button" className="btn" disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="btn" disabled={!canRedo} onClick={onRedo}>
          Redo
        </button>
        <button
          type="button"
          className="btn"
          onClick={onImport}
          title="SVG, DXF, AI, PDF, CDR, EPS, EMF…"
        >
          Import
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={onSendMachine}
          title="Connect to IKIER K1 and send G-code"
        >
          Send to K1
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={onSendSilhouette}
          title="Send cut paths to Silhouette Cameo / Portrait over USB"
        >
          Send to Silhouette
        </button>
        <button
          type="button"
          className="btn"
          onClick={onMachineExport}
          title="Export SVG/DXF for LightBurn / Studio (optional)"
        >
          Export file
        </button>
        <button type="button" className="btn" onClick={onExportSvg} title="Quick SVG">
          SVG
        </button>
        <button type="button" className="btn" onClick={onExportDxf} title="Quick DXF">
          DXF
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

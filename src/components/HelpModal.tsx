export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>CutForge · v1.2</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          <table className="shortcut-table">
            <tbody>
              {[
                ['V R E L P F T', 'Tools'],
                ['Shift', '15° / square / circle'],
                ['Ctrl/Cmd+A C V D / Z / S / O', 'Edit / Undo / Save / Open'],
                ['Space+drag / Wheel', 'Pan / Zoom'],
                ['Esc / ?', 'Cancel / Help'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            <strong>Import:</strong> top bar → Import (SVG, DXF, AI/PDF, CDR,
            EPS, EMF). Pure JS for SVG/DXF; desktop helpers (LibreOffice /
            pdftocairo / gs / Inkscape) for the rest — see docs/IMPORT.md.
            <br />
            <strong>Also:</strong> Print &amp; Cut · K1 bitmap / Wi‑Fi · optical
            Silhouette seek · kerf · materials.
          </p>
        </div>
      </div>
    </div>
  )
}

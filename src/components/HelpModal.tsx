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
          <h2>CutForge · v1.1</h2>
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
            <strong>Print &amp; Cut:</strong> inspector steps → Print PNG/PDF,
            then Cut SVG or Send to Silhouette with optical seek (TB123). Studio
            remains the fallback if the sensor fails.
            <br />
            <strong>K1:</strong> USB G-code · bitmap raster engrave · experimental
            Wi‑Fi TCP (hub AP :8080) · materials · kerf · job estimate.
          </p>
        </div>
      </div>
    </div>
  )
}

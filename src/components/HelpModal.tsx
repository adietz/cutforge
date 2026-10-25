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
          <h2>CutForge shortcuts · v0.8</h2>
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
                ['Ctrl/Cmd+A C V D', 'Select all / Copy / Paste / Duplicate'],
                ['Ctrl/Cmd+Z · S · O', 'Undo / Save / Open'],
                ['Space+drag / Wheel', 'Pan / Zoom'],
                ['Esc / ?', 'Cancel or clear / Help'],
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
            <strong>Send to K1:</strong> GRBL USB G-code. Engrave fills use
            configurable hatch spacing, angle, and optional cross-hatch. Cancel
            / disconnect → <strong>M5</strong> laser off.
            <br />
            <strong>Send to Silhouette:</strong> USB GPGL to Cameo / Portrait
            (open Graphtec protocol). Cut=blade, Score=light pressure,
            Engrave=pen. Desktop only; Linux udev <code>0b4d</code> / group{' '}
            <code>lp</code>. Fallback: inkscape-silhouette.
            <br />
            File export (SVG/DXF) still available; LightBurn optional.
          </p>
        </div>
      </div>
    </div>
  )
}

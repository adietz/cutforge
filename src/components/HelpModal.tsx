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
          <h2>CutForge shortcuts · v0.9</h2>
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
            <strong>Colors:</strong> Inspector → Line (stroke) and Fill pickers +
            hex. Any object can have either.
            <br />
            <strong>Laser color map:</strong> assign power <em>S</em> (and optional
            feed <em>F</em>) per color. Send to K1 uses stroke for cut/score and
            fill for engrave when a swatch matches; Cut/Score/Engrave presets
            still set the operation and defaults.
            <br />
            Map is saved in the <code>.cutforge</code> project.
          </p>
        </div>
      </div>
    </div>
  )
}

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>CutForge shortcuts</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          <table className="shortcut-table">
            <tbody>
              {[
                ['V', 'Select tool'],
                ['R / E / L', 'Rectangle / Ellipse / Line'],
                ['P', 'Polygon (Enter or double-click to close)'],
                ['F / T', 'Freehand / Text'],
                ['Drag empty', 'Marquee multi-select'],
                ['Shift+click', 'Add/remove from selection'],
                ['Space+drag', 'Pan canvas'],
                ['Wheel', 'Zoom toward cursor'],
                ['Delete / Backspace', 'Delete selection'],
                ['Ctrl/Cmd+D', 'Duplicate'],
                ['Ctrl/Cmd+Z', 'Undo'],
                ['Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y', 'Redo'],
                ['Esc', 'Cancel / return to select'],
                ['?', 'This cheatsheet'],
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
            Tip: enable <strong>Hairline (0.001 in)</strong> in Style before Export SVG for
            Silhouette Studio cut lines.
          </p>
        </div>
      </div>
    </div>
  )
}

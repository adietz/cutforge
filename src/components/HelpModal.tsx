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
                ['V / R / E / L / P / F / T', 'Tools'],
                ['Drag empty', 'Marquee multi-select'],
                ['Shift+click', 'Add/remove from selection'],
                ['Ctrl/Cmd+A', 'Select all'],
                ['Ctrl/Cmd+C / V / D', 'Copy / Paste / Duplicate'],
                ['Ctrl/Cmd+Z / Shift+Z / Y', 'Undo / Redo'],
                ['Ctrl/Cmd+S / Shift+S', 'Save / Save As'],
                ['Ctrl/Cmd+O', 'Open project'],
                ['Space+drag / Wheel', 'Pan / Zoom'],
                ['Delete', 'Delete selection'],
                ['Esc', 'Cancel / select tool'],
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
            Projects use <strong>.cutforge</strong> JSON. Autosave recovery runs
            every 30s while dirty. Snap + smart guides live in the inspector.
            Text is not converted to glyph outlines (no bundled fonts)—export
            keeps &lt;text&gt; / DXF TEXT.
          </p>
        </div>
      </div>
    </div>
  )
}

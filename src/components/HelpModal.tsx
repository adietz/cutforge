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
                ['V R E L P F T', 'Tools'],
                ['Shift (line / polygon / rotate)', 'Snap to 15° increments'],
                ['Shift (rect / ellipse)', 'Square / circle'],
                ['Drag empty / Shift+click', 'Marquee / toggle select'],
                ['Ctrl/Cmd+A C V D', 'Select all / Copy / Paste / Duplicate'],
                ['Ctrl/Cmd+Z / Shift+Z / Y', 'Undo / Redo'],
                ['Ctrl/Cmd+S / Shift+S / O', 'Save / Save As / Open'],
                ['Space+drag / Wheel', 'Pan / Zoom'],
                ['Delete / Backspace', 'Delete selection'],
                ['Esc', 'Cancel drawing, else clear selection'],
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
            <strong>Angle constraint:</strong> hold Shift to snap lines, polygon
            segments, and rotation to <strong>15°</strong> steps. Rect/ellipse
            become square/circle with Shift.
            <br />
            Native file dialogs in the Tauri app; browser pickers when using{' '}
            <code>npm run dev</code>.
          </p>
        </div>
      </div>
    </div>
  )
}

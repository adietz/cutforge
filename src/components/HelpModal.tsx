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
          <h2>CutForge shortcuts · v0.7</h2>
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
                ['Drag empty / Shift+click', 'Marquee / toggle (Shift does not drag)'],
                ['Ctrl/Cmd+A C V D', 'Select all / Copy / Paste / Duplicate'],
                ['Ctrl/Cmd+Z / Shift+Z / Y', 'Undo / Redo'],
                ['Ctrl/Cmd+S / Shift+S · O', 'Save / Save As / Open'],
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
            <strong>Send to K1:</strong> top bar → stream GRBL G-code over USB
            serial (115200). Cut / Score / Engrave use speed &amp; power presets;
            engrave uses a simple hatch. Cancel / disconnect commands{' '}
            <strong>M5 laser off</strong>. Desktop (Tauri) only — not the browser.
            <br />
            <strong>File export</strong> (SVG/DXF) remains available; LightBurn /
            LaserGRBL are <em>optional</em>, not required.
            <br />
            G-code origin: page lower-left, Y-up, mm. Calibrate power/speed on scrap.
            No Wi‑Fi path in v0.7.
          </p>
        </div>
      </div>
    </div>
  )
}

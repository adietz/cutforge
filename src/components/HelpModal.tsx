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
          <h2>CutForge shortcuts · v0.6</h2>
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
            <strong>Machine export:</strong> top bar → <em>Machine export</em>.
            Primary laser profile is <strong>IKIER K1</strong> (410×410 mm) —
            LightBurn-colored SVG (Cut=red, Score=blue, Engrave=black) or mm DXF.
            Also Silhouette Cameo/Portrait hairline SVG, generic laser, Glowforge.
            Open files in LightBurn / LaserGRBL / Studio —{' '}
            <strong>CutForge does not send G-code or USB</strong> yet.
            <br />
            <strong>Coords:</strong> SVG origin top-left (Y-down); DXF origin
            bottom-left (Y-up). LightBurn job origin is typically lower-left on
            the machine.
            <br />
            <strong>Text → outlines / Trace image:</strong> inspector — OFL fonts
            offline; imagetracer for logos/line art.
          </p>
        </div>
      </div>
    </div>
  )
}

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
          <h2>CutForge · v1.4</h2>
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
            <strong>Nest / Pack:</strong> top Arrange bar → Nest selection or Nest
            all. Packs AABB shelves onto the current page/bed with gap &amp;
            margin (default ~2.5 / 3 mm). Optional 90° rotations. Undo restores
            prior poses. Locked/hidden/guides/reg-marks skipped. Not free-angle
            nesting.
            <br />
            <strong>Also:</strong> materials library · K1 jog/frame · Import ·
            Print &amp; Cut.
          </p>
        </div>
      </div>
    </div>
  )
}

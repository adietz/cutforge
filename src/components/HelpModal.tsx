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
          <h2>CutForge · v1.3</h2>
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
            <strong>Materials:</strong> Send to K1 / Silhouette → Edit materials
            library (add/edit/delete; localStorage). Apply to job for
            speed/power/passes or Silhouette force.
            <br />
            <strong>K1 frame / jog:</strong> step 1/10/50 mm jog (laser off),
            Home, Go origin, Frame selection/job (bbox outline; optional
            low-power — never a cut). Status shows WPos/MPos when connected.
            <br />
            <strong>Also:</strong> Import AI/CDR/SVG · Print &amp; Cut · bitmap
            engrave · Wi‑Fi TCP.
          </p>
        </div>
      </div>
    </div>
  )
}

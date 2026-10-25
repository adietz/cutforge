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
          <h2>CutForge · v1.5</h2>
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
            <strong>Layers:</strong> Inspector → Layers. Top of the list cuts
            first. Visible/locked toggles; color + Cut/Score/Engrave/Print;
            optional S/F/passes overrides for K1. New shapes go on the active
            layer (double-click or +). Move selection via dropdown. Saved in
            .cutforge.
            <br />
            <strong>Also:</strong> Nest · materials · K1 frame/jog · Import ·
            Print &amp; Cut.
          </p>
        </div>
      </div>
    </div>
  )
}

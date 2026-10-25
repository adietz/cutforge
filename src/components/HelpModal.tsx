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
          <h2>CutForge · v1.7</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          <table className="shortcut-table">
            <tbody>
              {[
                ['V / A', 'Select / Shape (nodes)'],
                ['R E L P F T', 'Draw tools'],
                ['Dblclick segment / node', 'Add node at click / delete node'],
                ['Shape: C / S', 'Cusp / Smooth selected node'],
                ['Shift', '15° / square / multi-node'],
                ['Ctrl/Cmd+A C V D / Z / S / O', 'Edit / Undo / Save / Open'],
                ['Right-click', 'Context menu on shape / node'],
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
            <strong>Job controls:</strong> During Send to K1 — Pause (!), Resume (~),
            Cancel (hold → M5 → soft-reset). Check origin after a long pause.
            <br />
            <strong>Profiles:</strong> Named beds + USB/Wi‑Fi defaults; apply sets document size.
            <br />
            <strong>Layers:</strong> Inspector → Layers. Top of the list cuts
            first. Visible/locked toggles; color + Cut/Score/Engrave/Print;
            optional S/F/passes overrides for K1. New shapes go on the active
            layer (double-click or +). Move selection via dropdown. Saved in
            .cutforge.
            <br />
            <strong>Shape editing (Corel-like):</strong> Press <kbd>A</kbd> or
            double-click a path. Drag yellow nodes; Shift+click multi-select.
            Double-click a segment to add a node at the click; double-click a
            node to delete. Right-click for To line / To curve / Break / Join,
            plus Cut/Copy/Order. Bezier handles appear on selected nodes.
            <br />
            <strong>Also:</strong> Nest · materials · K1 frame/jog · Import ·
            Print &amp; Cut.
          </p>
        </div>
      </div>
    </div>
  )
}

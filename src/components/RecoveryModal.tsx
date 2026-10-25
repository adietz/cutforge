export function RecoveryModal({
  open,
  savedAtLabel,
  onRestore,
  onDiscard,
}: {
  open: boolean
  savedAtLabel: string
  onRestore: () => void
  onDiscard: () => void
}) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <h2>Recover unsaved work?</h2>
        </header>
        <div className="modal-body">
          <p>
            An autosave from <strong>{savedAtLabel}</strong> was found. Restore
            it or discard and start fresh.
          </p>
          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" className="btn primary" onClick={onRestore}>
              Restore
            </button>
            <button type="button" className="btn danger" onClick={onDiscard}>
              Discard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

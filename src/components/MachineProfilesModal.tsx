import { useEffect, useState } from 'react'
import {
  emptyProfile,
  getActiveProfileId,
  loadProfiles,
  resetProfilesToBuiltin,
  saveProfiles,
  setActiveProfileId,
  type MachineKind,
  type MachineProfile,
} from '../machine/machineProfiles'

export function MachineProfilesModal({
  open,
  onClose,
  onApply,
  onStatus,
  filterKind,
}: {
  open: boolean
  onClose: () => void
  onApply: (profile: MachineProfile) => void
  onStatus: (s: string) => void
  filterKind?: MachineKind | 'all'
}) {
  const [list, setList] = useState<MachineProfile[]>([])
  const [activeId, setActiveId] = useState('')
  const [draft, setDraft] = useState<MachineProfile | null>(null)
  const filter = filterKind || 'all'

  useEffect(() => {
    if (!open) return
    const profiles = loadProfiles()
    setList(profiles)
    const aid = getActiveProfileId()
    const first =
      profiles.find((p) => p.id === aid) ||
      profiles.find((p) => filter === 'all' || p.kind === filter) ||
      profiles[0]
    setActiveId(first?.id || '')
    setDraft(first ? { ...first } : null)
  }, [open, filter])

  if (!open) return null

  const visible = list.filter((p) => filter === 'all' || p.kind === filter)

  const select = (id: string) => {
    const p = list.find((x) => x.id === id)
    setActiveId(id)
    setDraft(p ? { ...p } : null)
  }

  const save = () => {
    if (!draft) return
    const next = list.some((p) => p.id === draft.id)
      ? list.map((p) => (p.id === draft.id ? { ...draft } : p))
      : [...list, { ...draft }]
    saveProfiles(next)
    setList(next)
    setActiveProfileId(draft.id)
    setActiveId(draft.id)
    onStatus(`Saved profile “${draft.name}”`)
  }

  const apply = () => {
    if (!draft) return
    save()
    onApply(draft)
    onClose()
  }

  const add = (kind: MachineKind) => {
    const p = emptyProfile(kind)
    const next = [p, ...list]
    saveProfiles(next)
    setList(next)
    setActiveId(p.id)
    setDraft({ ...p })
  }

  const remove = () => {
    if (!draft) return
    if (list.length <= 1) {
      onStatus('Keep at least one profile')
      return
    }
    if (!window.confirm(`Delete profile “${draft.name}”?`)) return
    const next = list.filter((p) => p.id !== draft.id)
    saveProfiles(next)
    setList(next)
    const a = next[0]
    setActiveId(a.id)
    setActiveProfileId(a.id)
    setDraft({ ...a })
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Machine profiles</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body machine-panel-body">
          <div className="machine-panel-left">
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => add('laser-grbl')}>
                + Laser
              </button>
              <button type="button" className="btn" onClick={() => add('silhouette')}>
                + Silhouette
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!window.confirm('Reset profiles to built-ins?')) return
                  const next = resetProfilesToBuiltin()
                  setList(next)
                  setActiveId(next[0].id)
                  setDraft({ ...next[0] })
                }}
              >
                Reset
              </button>
            </div>
            <ul className="materials-list">
              {visible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={
                      p.id === activeId
                        ? 'btn material-item active'
                        : 'btn material-item'
                    }
                    onClick={() => select(p.id)}
                  >
                    <strong>{p.name}</strong>
                    <span className="hint tight">
                      {p.kind} · {p.bedWidthMm}×{p.bedHeightMm} mm · {p.connection}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="machine-panel-right">
            {!draft ? (
              <p className="hint">Select a profile</p>
            ) : (
              <>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <label className="field" style={{ width: 140 }}>
                    <span>Type</span>
                    <select
                      value={draft.kind}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          kind: e.target.value as MachineKind,
                        })
                      }
                    >
                      <option value="laser-grbl">Laser GRBL</option>
                      <option value="silhouette">Silhouette</option>
                    </select>
                  </label>
                  <label className="field" style={{ width: 120 }}>
                    <span>Connection</span>
                    <select
                      value={draft.connection}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          connection: e.target.value as 'usb' | 'wifi',
                        })
                      }
                    >
                      <option value="usb">USB</option>
                      <option value="wifi">Wi‑Fi</option>
                    </select>
                  </label>
                  <label className="field" style={{ width: 120 }}>
                    <span>Origin</span>
                    <select
                      value={draft.origin}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          origin: e.target.value as MachineProfile['origin'],
                        })
                      }
                    >
                      <option value="lower-left">Lower-left</option>
                      <option value="upper-left">Upper-left</option>
                    </select>
                  </label>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <label className="field" style={{ width: 110 }}>
                    <span>Bed W mm</span>
                    <input
                      type="number"
                      value={draft.bedWidthMm}
                      onChange={(e) =>
                        setDraft({ ...draft, bedWidthMm: +e.target.value })
                      }
                    />
                  </label>
                  <label className="field" style={{ width: 110 }}>
                    <span>Bed H mm</span>
                    <input
                      type="number"
                      value={draft.bedHeightMm}
                      onChange={(e) =>
                        setDraft({ ...draft, bedHeightMm: +e.target.value })
                      }
                    />
                  </label>
                  <label className="field" style={{ width: 110 }}>
                    <span>Baud</span>
                    <input
                      type="number"
                      value={draft.baud}
                      onChange={(e) =>
                        setDraft({ ...draft, baud: +e.target.value })
                      }
                    />
                  </label>
                </div>
                {draft.connection === 'wifi' && (
                  <div className="row" style={{ gap: 8 }}>
                    <label className="field" style={{ flex: 1 }}>
                      <span>Wi‑Fi host</span>
                      <input
                        value={draft.wifiHost}
                        onChange={(e) =>
                          setDraft({ ...draft, wifiHost: e.target.value })
                        }
                      />
                    </label>
                    <label className="field" style={{ width: 90 }}>
                      <span>Port</span>
                      <input
                        type="number"
                        value={draft.wifiPort}
                        onChange={(e) =>
                          setDraft({ ...draft, wifiPort: +e.target.value })
                        }
                      />
                    </label>
                  </div>
                )}
                <label className="field">
                  <span>Notes</span>
                  <input
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                </label>
                <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={save}>
                    Save
                  </button>
                  <button type="button" className="btn primary" onClick={apply}>
                    Save &amp; apply (bed + connection)
                  </button>
                  <button type="button" className="btn danger" onClick={remove}>
                    Delete
                  </button>
                </div>
                <p className="hint tight" style={{ marginTop: 8 }}>
                  Profiles are stored in localStorage. Applying sets document bed
                  size and K1 connection defaults (baud / Wi‑Fi).
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

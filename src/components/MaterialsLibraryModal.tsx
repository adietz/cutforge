import { useEffect, useState } from 'react'
import type { MaterialPreset } from '../machine/materials'
import {
  cloneMaterial,
  clonePresets,
  cloneSilhouette,
  emptyLaserMaterial,
  emptySilhouetteMaterial,
  percentToPower,
  powerToPercent,
} from '../machine/materials'
import {
  deleteMaterial,
  loadMaterials,
  resetMaterialsToBuiltin,
  upsertMaterial,
} from '../machine/materialsStore'
import { DEFAULT_IKIER_PRESETS, DEFAULT_SILHOUETTE_PRESETS } from '../machine/presets'

export function MaterialsLibraryModal({
  open,
  onClose,
  filterMachine,
  onApplied,
  onStatus,
}: {
  open: boolean
  onClose: () => void
  filterMachine?: 'laser' | 'silhouette' | 'all'
  onApplied?: (mat: MaterialPreset) => void
  onStatus: (s: string) => void
}) {
  const [list, setList] = useState<MaterialPreset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<MaterialPreset | null>(null)
  const filter = filterMachine || 'all'

  useEffect(() => {
    if (!open) return
    const mats = loadMaterials()
    setList(mats)
    const first =
      mats.find((m) => filter === 'all' || m.machine === filter) || mats[0]
    setSelectedId(first?.id || '')
    setDraft(first ? cloneMaterial(first) : null)
  }, [open, filter])

  if (!open) return null

  const visible = list.filter(
    (m) => filter === 'all' || m.machine === filter,
  )

  const select = (id: string) => {
    const m = list.find((x) => x.id === id)
    setSelectedId(id)
    setDraft(m ? cloneMaterial(m) : null)
  }

  const persistDraft = () => {
    if (!draft) return
    const next = upsertMaterial(list, draft)
    setList(next)
    setSelectedId(draft.id)
    onStatus(`Saved material “${draft.name}”`)
  }

  const addLaser = () => {
    const m = emptyLaserMaterial()
    const next = upsertMaterial(list, m)
    setList(next)
    setSelectedId(m.id)
    setDraft(cloneMaterial(m))
  }

  const addSil = () => {
    const m = emptySilhouetteMaterial()
    const next = upsertMaterial(list, m)
    setList(next)
    setSelectedId(m.id)
    setDraft(cloneMaterial(m))
  }

  const remove = () => {
    if (!draft) return
    if (draft.id === 'custom') {
      onStatus('Cannot delete the Custom slot')
      return
    }
    if (!window.confirm(`Delete material “${draft.name}”?`)) return
    const next = deleteMaterial(list, draft.id)
    setList(next)
    const first = next.find((m) => filter === 'all' || m.machine === filter) || next[0]
    setSelectedId(first?.id || '')
    setDraft(first ? cloneMaterial(first) : null)
    onStatus('Material deleted')
  }

  const resetAll = () => {
    if (!window.confirm('Reset material library to built-in defaults?')) return
    const next = resetMaterialsToBuiltin()
    setList(next)
    setSelectedId(next[0]?.id || '')
    setDraft(next[0] ? cloneMaterial(next[0]) : null)
    onStatus('Materials reset to built-ins')
  }

  const powerMax = draft?.presets?.powerMax || 1000

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Materials library</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body machine-panel-body">
          <div className="machine-panel-left">
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={addLaser}>
                + Laser
              </button>
              <button type="button" className="btn" onClick={addSil}>
                + Silhouette
              </button>
              <button type="button" className="btn" onClick={resetAll}>
                Reset defaults
              </button>
            </div>
            <ul className="materials-list">
              {visible.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={
                      m.id === selectedId ? 'btn material-item active' : 'btn material-item'
                    }
                    onClick={() => select(m.id)}
                  >
                    <strong>{m.name}</strong>
                    <span className="hint tight">
                      {m.machine}
                      {m.thicknessMm != null ? ` · ${m.thicknessMm} mm` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="machine-panel-right">
            {!draft ? (
              <p className="hint">Select or add a material.</p>
            ) : (
              <>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Description</span>
                  <input
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </label>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <label className="field" style={{ width: 140 }}>
                    <span>Machine</span>
                    <select
                      value={draft.machine}
                      onChange={(e) => {
                        const machine = e.target.value as 'laser' | 'silhouette'
                        setDraft({
                          ...draft,
                          machine,
                          presets:
                            machine === 'laser'
                              ? draft.presets || clonePresets(DEFAULT_IKIER_PRESETS)
                              : draft.presets,
                          silhouette:
                            machine === 'silhouette'
                              ? draft.silhouette ||
                                cloneSilhouette(DEFAULT_SILHOUETTE_PRESETS)
                              : draft.silhouette,
                        })
                      }}
                    >
                      <option value="laser">Laser (K1)</option>
                      <option value="silhouette">Silhouette</option>
                    </select>
                  </label>
                  <label className="field" style={{ width: 110 }}>
                    <span>Thickness mm</span>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.thicknessMm ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          thicknessMm: e.target.value === '' ? undefined : +e.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                {draft.machine === 'laser' && draft.presets && (
                  <>
                    <h3 style={{ marginTop: 12 }}>Laser ops (power % of S{powerMax})</h3>
                    {(['cut', 'score', 'engrave'] as const).map((key) => (
                      <div key={key} className="preset-row" style={{ flexWrap: 'wrap' }}>
                        <strong>{key}</strong>
                        <label>
                          Speed
                          <input
                            type="number"
                            value={draft.presets![key].speed}
                            onChange={(e) => {
                              const presets = clonePresets(draft.presets!)
                              presets[key].speed = +e.target.value
                              setDraft({ ...draft, presets })
                            }}
                          />
                        </label>
                        <label>
                          Power %
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={powerToPercent(
                              draft.presets![key].power,
                              powerMax,
                            )}
                            onChange={(e) => {
                              const presets = clonePresets(draft.presets!)
                              presets[key].power = percentToPower(
                                +e.target.value,
                                powerMax,
                              )
                              setDraft({ ...draft, presets })
                            }}
                          />
                        </label>
                        <label>
                          Passes
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={draft.presets![key].passes ?? 1}
                            onChange={(e) => {
                              const presets = clonePresets(draft.presets!)
                              presets[key].passes = +e.target.value
                              setDraft({ ...draft, presets })
                            }}
                          />
                        </label>
                        {key === 'engrave' && (
                          <label>
                            Interval mm
                            <input
                              type="number"
                              step="0.05"
                              min={0.05}
                              value={draft.presets!.engrave.hatchMm ?? 0.2}
                              onChange={(e) => {
                                const presets = clonePresets(draft.presets!)
                                presets.engrave.hatchMm = +e.target.value
                                setDraft({ ...draft, presets })
                              }}
                            />
                          </label>
                        )}
                      </div>
                    ))}
                    <label className="field" style={{ width: 120, marginTop: 6 }}>
                      <span>Travel F</span>
                      <input
                        type="number"
                        value={draft.presets.travel}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            presets: {
                              ...draft.presets!,
                              travel: +e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </>
                )}

                {draft.machine === 'silhouette' && (
                  <>
                    <h3 style={{ marginTop: 12 }}>
                      Silhouette (force = pressure 1–33)
                    </h3>
                    {!(draft.silhouette) && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            silhouette: cloneSilhouette(DEFAULT_SILHOUETTE_PRESETS),
                          })
                        }
                      >
                        Init Silhouette settings
                      </button>
                    )}
                    {draft.silhouette &&
                      (['cut', 'score', 'engrave'] as const).map((key) => (
                        <div key={key} className="preset-row">
                          <strong>{key}</strong>
                          <label>
                            Speed
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={draft.silhouette![key].speed}
                              onChange={(e) => {
                                const silhouette = cloneSilhouette(draft.silhouette!)
                                silhouette[key].speed = +e.target.value
                                setDraft({ ...draft, silhouette })
                              }}
                            />
                          </label>
                          <label>
                            Force
                            <input
                              type="number"
                              min={1}
                              max={33}
                              value={draft.silhouette![key].pressure}
                              onChange={(e) => {
                                const silhouette = cloneSilhouette(draft.silhouette!)
                                silhouette[key].pressure = +e.target.value
                                setDraft({ ...draft, silhouette })
                              }}
                            />
                          </label>
                          <label>
                            Passes
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={draft.silhouette![key].passes ?? 1}
                              onChange={(e) => {
                                const silhouette = cloneSilhouette(draft.silhouette!)
                                silhouette[key].passes = +e.target.value
                                setDraft({ ...draft, silhouette })
                              }}
                            />
                          </label>
                        </div>
                      ))}
                  </>
                )}

                <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button type="button" className="btn primary" onClick={persistDraft}>
                    Save
                  </button>
                  {onApplied && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        if (!draft) return
                        const next = upsertMaterial(list, draft)
                        setList(next)
                        onApplied(draft)
                        onStatus(`Applied “${draft.name}” to job`)
                        onClose()
                      }}
                    >
                      Save &amp; apply to job
                    </button>
                  )}
                  <button type="button" className="btn danger" onClick={remove}>
                    Delete
                  </button>
                </div>
                <p className="hint tight" style={{ marginTop: 8 }}>
                  Stored in this browser/app (localStorage). Always calibrate on
                  scrap — seeds are starting points only.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

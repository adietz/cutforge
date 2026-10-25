import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_IKIER_PRESETS,
  type MachineLaserPresets,
} from '../machine/presets'
import {
  MATERIAL_PRESETS,
  clonePresets,
  materialById,
} from '../machine/materials'
import { gcodeToLines, generateGcode } from '../machine/gcode'
import {
  estimateGcodeTime,
  formatDuration,
} from '../machine/jobEstimate'
import {
  listSerialPorts,
  onGrblProgress,
  serialAvailable,
  serialCancelJob,
  serialConnect,
  serialDisconnect,
  serialHome,
  serialIsConnected,
  serialJog,
  serialSendGcode,
  type PortInfo,
  type SendProgress,
} from '../machine/serial'
import { saveTextFile } from '../io/files'
import type { PagePreset } from '../types'
import paper from 'paper'
import { LaserColorMapEditor } from './LaserColorMapEditor'
import type { LaserColorMapEntry } from '../machine/colorMap'

void paper

export function MachinePanel({
  open,
  onClose,
  getItems,
  page,
  onStatus,
  colorMap,
  onColorMap,
}: {
  open: boolean
  onClose: () => void
  getItems: () => paper.Item[]
  page: PagePreset
  onStatus: (s: string) => void
  colorMap: LaserColorMapEntry[]
  onColorMap: (map: LaserColorMapEntry[]) => void
}) {
  const native = serialAvailable()
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [port, setPort] = useState('')
  const [baud, setBaud] = useState(115200)
  const [connected, setConnected] = useState(false)
  const [presets, setPresets] = useState<MachineLaserPresets>({
    ...DEFAULT_IKIER_PRESETS,
    cut: { ...DEFAULT_IKIER_PRESETS.cut },
    score: { ...DEFAULT_IKIER_PRESETS.score },
    engrave: { ...DEFAULT_IKIER_PRESETS.engrave },
  })
  const [preview, setPreview] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<SendProgress | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [materialId, setMaterialId] = useState('plywood-3mm')

  const refreshPorts = useCallback(async () => {
    if (!native) return
    try {
      const list = await listSerialPorts()
      setPorts(list)
      if (!port && list.length) setPort(list[0].portName)
    } catch (e) {
      setErr(String(e))
    }
  }, [native, port])

  useEffect(() => {
    if (!open) return
    void refreshPorts()
    void serialIsConnected().then(setConnected).catch(() => setConnected(false))
    let un: (() => void) | undefined
    void onGrblProgress((p) => setProgress(p)).then((u) => {
      un = u
    })
    return () => {
      un?.()
    }
  }, [open, refreshPorts])

  const rebuildPreview = () => {
    try {
      const g = generateGcode(getItems(), page, { presets, colorMap })
      setPreview(g)
      setErr(null)
    } catch (e) {
      setErr(String(e))
    }
  }

  useEffect(() => {
    if (open) rebuildPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, presets, colorMap])

  const lineCount = useMemo(
    () => gcodeToLines(preview).length,
    [preview],
  )

  const jobEst = useMemo(() => {
    if (!preview) return null
    return estimateGcodeTime(preview)
  }, [preview])

  if (!open) return null

  const connect = async () => {
    setErr(null)
    try {
      const msg = await serialConnect(port, baud)
      setConnected(true)
      onStatus(msg)
    } catch (e) {
      setErr(String(e))
      setConnected(false)
    }
  }

  const disconnect = async () => {
    try {
      await serialDisconnect()
    } catch {
      /* still clear UI */
    }
    setConnected(false)
    setSending(false)
    onStatus('Disconnected (laser off commanded)')
  }

  const sendJob = async () => {
    if (!connected) {
      setErr('Connect to the K1 first')
      return
    }
    const lines = gcodeToLines(preview)
    if (!lines.length) {
      setErr('Nothing to send — draw cut/score/engrave paths')
      return
    }
    const est = estimateGcodeTime(preview)
    if (
      !window.confirm(
        `Send ${lines.length} G-code lines to the laser?\nEst. ${formatDuration(est.seconds)} (cut ${est.cutMm.toFixed(0)} mm).\n\nEnsure the bed is clear, lid/glasses as required, and origin is set. Cancel anytime — CutForge will command laser OFF.`,
      )
    ) {
      return
    }
    setSending(true)
    setProgress({ sent: 0, total: lines.length, line: '', done: false, cancelled: false, error: null })
    setErr(null)
    try {
      const result = await serialSendGcode(lines)
      setProgress(result)
      if (result.cancelled) onStatus('Job cancelled — laser off')
      else if (result.error) onStatus(`Job error: ${result.error}`)
      else onStatus(`Job complete (${result.sent} lines)`)
    } catch (e) {
      setErr(String(e))
      onStatus(`Send failed: ${String(e)}`)
      try {
        await serialCancelJob()
      } catch {
        /* */
      }
    } finally {
      setSending(false)
    }
  }

  const saveGcode = async () => {
    rebuildPreview()
    const g = generateGcode(getItems(), page, { presets, colorMap })
    const result = await saveTextFile('gcode', 'cutforge-ikier-k1.nc', g)
    if (result) onStatus(`Saved ${result.name}`)
  }

  const setOp = (
    key: 'cut' | 'score' | 'engrave',
    field: 'speed' | 'power' | 'hatchMm' | 'hatchAngleDeg',
    value: number,
  ) => {
    setPresets((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  const applyMaterial = (id: string) => {
    setMaterialId(id)
    if (id === 'custom') return
    const mat = materialById(id)
    setPresets(clonePresets(mat.presets))
    if (mat.colorMap?.length) onColorMap(mat.colorMap.map((e) => ({ ...e })))
    onStatus(`Material: ${mat.name} (calibrate on scrap)`)
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Send to machine"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Send to IKIER K1</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body machine-panel-body">
          <div className="machine-panel-left">
            {!native && (
              <p className="hint warn-text">
                Serial connect only works in the <strong>CutForge desktop app</strong>{' '}
                (Tauri), not the browser. You can still preview and save G-code
                here, then connect on your Mac/Windows/Linux desktop.
              </p>
            )}

            <h3>Connection</h3>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: 1, minWidth: 160 }}>
                <span>Port</span>
                <select
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={!native || connected}
                >
                  {ports.length === 0 && (
                    <option value="">(no ports — refresh)</option>
                  )}
                  {ports.map((p) => (
                    <option key={p.portName} value={p.portName}>
                      {p.portName}
                      {p.product ? ` — ${p.product}` : ` (${p.kind})`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ width: 110 }}>
                <span>Baud</span>
                <select
                  value={baud}
                  onChange={(e) => setBaud(+e.target.value)}
                  disabled={!native || connected}
                >
                  <option value={115200}>115200</option>
                  <option value={250000}>250000</option>
                  <option value={9600}>9600</option>
                </select>
              </label>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn"
                disabled={!native}
                onClick={() => void refreshPorts()}
              >
                Refresh ports
              </button>
              {!connected ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={!native || !port}
                  onClick={() => void connect()}
                >
                  Connect
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void disconnect()}
                >
                  Disconnect
                </button>
              )}
              <button
                type="button"
                className="btn"
                disabled={!connected || sending}
                onClick={() =>
                  void serialHome()
                    .then((r) => onStatus(`Home: ${r || 'sent $H'}`))
                    .catch((e) => setErr(String(e)))
                }
                title="GRBL $H — requires homing enabled on the controller"
              >
                Home
              </button>
            </div>

            <h3 style={{ marginTop: 14 }}>Jog (mm, laser off)</h3>
            <div className="jog-grid">
              {(
                [
                  [0, 10, 'Y+'],
                  [-10, 0, 'X−'],
                  [10, 0, 'X+'],
                  [0, -10, 'Y−'],
                ] as const
              ).map(([dx, dy, label]) => (
                <button
                  key={label}
                  type="button"
                  className="btn"
                  disabled={!connected || sending}
                  onClick={() =>
                    void serialJog(dx, dy, 2000).catch((e) => setErr(String(e)))
                  }
                >
                  {label} 10
                </button>
              ))}
            </div>

            <h3 style={{ marginTop: 14 }}>Material</h3>
            <label className="field">
              <span>IKIER K1 starter preset</span>
              <select
                value={materialId}
                onChange={(e) => applyMaterial(e.target.value)}
              >
                {MATERIAL_PRESETS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint tight">
              {materialById(materialId).description} Applies speed/power
              {materialById(materialId).colorMap ? ' + color map' : ''}; edit
              freely after.
            </p>

            <h3 style={{ marginTop: 14 }}>Laser color map</h3>
            <LaserColorMapEditor map={colorMap} onChange={onColorMap} compact />

            <h3 style={{ marginTop: 14 }}>Presets (calibrate on scrap!)</h3>
            {(
              [
                ['cut', 'Cut'],
                ['score', 'Score'],
                ['engrave', 'Engrave'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="preset-row">
                <strong>{label}</strong>
                <label>
                  Speed
                  <input
                    type="number"
                    value={presets[key].speed}
                    onChange={(e) => setOp(key, 'speed', +e.target.value)}
                  />
                </label>
                <label>
                  Power S
                  <input
                    type="number"
                    value={presets[key].power}
                    onChange={(e) => setOp(key, 'power', +e.target.value)}
                  />
                </label>
                {key === 'engrave' && (
                  <>
                    <label>
                      Hatch mm
                      <input
                        type="number"
                        step="0.05"
                        min={0.05}
                        value={presets.engrave.hatchMm ?? 0.2}
                        onChange={(e) => setOp('engrave', 'hatchMm', +e.target.value)}
                      />
                    </label>
                    <label>
                      Angle °
                      <input
                        type="number"
                        step="5"
                        value={presets.engrave.hatchAngleDeg ?? 0}
                        onChange={(e) =>
                          setOp('engrave', 'hatchAngleDeg', +e.target.value)
                        }
                      />
                    </label>
                    <label className="check" style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!presets.engrave.crossHatch}
                        onChange={(e) =>
                          setPresets((prev) => ({
                            ...prev,
                            engrave: {
                              ...prev.engrave,
                              crossHatch: e.target.checked,
                            },
                          }))
                        }
                      />
                      Cross-hatch
                    </label>
                  </>
                )}
              </div>
            ))}

            <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={rebuildPreview}>
                Refresh G-code
              </button>
              <button type="button" className="btn" onClick={() => void saveGcode()}>
                Save .nc (dry-run)
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!native || !connected || sending}
                onClick={() => void sendJob()}
              >
                {sending ? 'Sending…' : 'Send job'}
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={!sending && !connected}
                onClick={() =>
                  void serialCancelJob()
                    .then(() => onStatus('Cancel — laser off'))
                    .catch((e) => setErr(String(e)))
                }
              >
                Cancel / laser off
              </button>
            </div>

            {progress && (
              <p className="hint tight">
                Progress: {progress.sent}/{progress.total}
                {progress.cancelled ? ' (cancelled)' : ''}
                {progress.error ? ` — ${progress.error}` : ''}
              </p>
            )}
            {err && <p className="hint danger-text">{err}</p>}
            <p className="hint tight">
              USB Type-C → serial (usually 115200). Linux: add user to{' '}
              <code>dialout</code>. macOS: allow USB accessories. Windows: CH340/CP210
              drivers if needed. No Wi‑Fi send in v0.7.
            </p>
          </div>
          <div className="machine-panel-right">
            <h3>G-code preview ({lineCount} lines)</h3>
            {jobEst && (
              <p className="hint tight job-estimate">
                Est. {formatDuration(jobEst.seconds)} · cut{' '}
                {jobEst.cutMm.toFixed(0)} mm · travel{' '}
                {jobEst.travelMm.toFixed(0)} mm · {jobEst.moves} moves
                <br />
                Rough motion time only (no accel/pierce) — usually longer on
                machine.
              </p>
            )}
            <pre className="gcode-preview">{preview || '; empty'}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

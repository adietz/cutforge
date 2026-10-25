import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_IKIER_PRESETS,
  type MachineLaserPresets,
} from '../machine/presets'
import {
  clonePresets,
  materialById,
  type MaterialPreset,
} from '../machine/materials'
import { loadMaterials } from '../machine/materialsStore'
import { MaterialsLibraryModal } from './MaterialsLibraryModal'
import {
  buildFrameGcode,
  paperBoundsToMachine,
} from '../machine/frameGcode'
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
  serialPauseJob,
  serialResumeJob,
  serialConnect,
  serialDisconnect,
  serialHome,
  serialIsConnected,
  serialJog,
  serialSendGcode,
  serialQueryStatus,
  serialGoOrigin,
  grblTcpSend,
  type PortInfo,
  type SendProgress,
  type GrblStatus,
} from '../machine/serial'
import {
  getActiveProfileId,
  loadProfiles,
  setActiveProfileId,
  type MachineProfile,
} from '../machine/machineProfiles'
import { MachineProfilesModal } from './MachineProfilesModal'
import {
  fileToImageData,
  rasterImageToGcode,
} from '../machine/rasterEngrave'
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
  getBounds,
  getLayerMap,
  page,
  onStatus,
  colorMap,
  onColorMap,
  onApplyProfile,
}: {
  open: boolean
  onClose: () => void
  getItems: () => paper.Item[]
  /** Canvas-px bounds for framing (selection or whole job) */
  getBounds: (preferSelection?: boolean) => {
    x: number
    y: number
    width: number
    height: number
  } | null
  getLayerMap?: () => Map<
    string,
    { power: number | null; speed: number | null; passes: number | null }
  >
  page: PagePreset
  onStatus: (s: string) => void
  colorMap: LaserColorMapEntry[]
  onColorMap: (map: LaserColorMapEntry[]) => void
  /** Apply bed size / page when a machine profile is chosen */
  onApplyProfile?: (profile: MachineProfile) => void
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
  const [jobPaused, setJobPaused] = useState(false)
  const [jobPhase, setJobPhase] = useState<
    'idle' | 'running' | 'paused' | 'done' | 'cancelled' | 'error'
  >('idle')
  const [progress, setProgress] = useState<SendProgress | null>(null)
  const [profiles, setProfiles] = useState<MachineProfile[]>(() => loadProfiles())
  const [profileId, setProfileId] = useState(() => getActiveProfileId())
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [materials, setMaterials] = useState<MaterialPreset[]>(() => loadMaterials())
  const [materialId, setMaterialId] = useState('basswood-3mm')
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [jogStep, setJogStep] = useState(10)
  const [frameLowPower, setFrameLowPower] = useState(false)
  const [framePower, setFramePower] = useState(10)
  const [frameBusy, setFrameBusy] = useState(false)
  const [grblStatus, setGrblStatus] = useState<GrblStatus | null>(null)
  const [rasterDpi, setRasterDpi] = useState(150)
  const [rasterMinP, setRasterMinP] = useState(80)
  const [rasterMaxP, setRasterMaxP] = useState(650)
  const [rasterSpeed, setRasterSpeed] = useState(3000)
  const [wifiHost, setWifiHost] = useState('192.168.4.1')
  const [wifiPort, setWifiPort] = useState(8080)
  const [wifiBusy, setWifiBusy] = useState(false)

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
    setMaterials(loadMaterials())
    const profs = loadProfiles()
    setProfiles(profs)
    const aid = getActiveProfileId()
    setProfileId(aid)
    const ap = profs.find((p) => p.id === aid)
    if (ap?.kind === 'laser-grbl') {
      setBaud(ap.baud || 115200)
      if (ap.wifiHost) setWifiHost(ap.wifiHost)
      if (ap.wifiPort) setWifiPort(ap.wifiPort)
    }
    void refreshPorts()
    void serialIsConnected().then(setConnected).catch(() => setConnected(false))
    let un: (() => void) | undefined
    void onGrblProgress((p) => {
      setProgress(p)
      if (p.cancelled) setJobPhase('cancelled')
      else if (p.error) setJobPhase('error')
      else if (p.done) setJobPhase('done')
      else if (p.paused) {
        setJobPaused(true)
        setJobPhase('paused')
      } else {
        setJobPaused(false)
        setJobPhase('running')
      }
    }).then((u) => {
      un = u
    })
    let alive = true
    const poll = async () => {
      if (!alive) return
      try {
        const ok = await serialIsConnected()
        if (!alive) return
        setConnected(ok)
        if (ok) {
          const st = await serialQueryStatus()
          if (alive) setGrblStatus(st)
        } else {
          setGrblStatus(null)
        }
      } catch {
        /* ignore poll errors */
      }
    }
    void poll()
    const iv = window.setInterval(() => void poll(), 2000)
    return () => {
      alive = false
      window.clearInterval(iv)
      un?.()
    }
  }, [open, refreshPorts])

  const rebuildPreview = () => {
    try {
      const g = generateGcode(getItems(), page, {
        presets,
        colorMap,
        layerMap: getLayerMap?.(),
      })
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

  const applyMachineProfile = (id: string, list?: MachineProfile[]) => {
    const profs = list || profiles
    const p = profs.find((x) => x.id === id)
    if (!p) return
    setProfileId(id)
    setActiveProfileId(id)
    if (p.kind === 'laser-grbl') {
      setBaud(p.baud || 115200)
      if (p.wifiHost) setWifiHost(p.wifiHost)
      if (p.wifiPort) setWifiPort(p.wifiPort)
    }
    onApplyProfile?.(p)
    onStatus(`Profile: ${p.name} (${p.bedWidthMm}×${p.bedHeightMm} mm)`)
  }

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
    setJobPaused(false)
    setJobPhase('running')
    setProgress({
      sent: 0,
      total: lines.length,
      line: '',
      done: false,
      cancelled: false,
      paused: false,
      error: null,
    })
    setErr(null)
    try {
      const result = await serialSendGcode(lines)
      setProgress(result)
      if (result.cancelled) {
        setJobPhase('cancelled')
        onStatus('Job cancelled — laser off (hold + soft-reset)')
      } else if (result.error) {
        setJobPhase('error')
        onStatus(`Job error: ${result.error}`)
      } else {
        setJobPhase('done')
        onStatus(`Job complete (${result.sent} lines)`)
      }
    } catch (e) {
      setJobPhase('error')
      setErr(String(e))
      onStatus(`Send failed: ${String(e)}`)
      try {
        await serialCancelJob()
      } catch {
        /* */
      }
    } finally {
      setSending(false)
      setJobPaused(false)
    }
  }

  const saveGcode = async () => {
    rebuildPreview()
    const g = generateGcode(getItems(), page, {
      presets,
      colorMap,
      layerMap: getLayerMap?.(),
    })
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


  const importBitmapEngrave = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/bmp,image/gif'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const img = await fileToImageData(file)
        // Downscale if huge for DPI target width
        const maxPx = Math.round((page.widthMm * rasterDpi) / 25.4)
        let data = img
        if (img.width > maxPx && maxPx > 32) {
          const scale = maxPx / img.width
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(img.width * scale))
          c.height = Math.max(1, Math.round(img.height * scale))
          const ctx = c.getContext('2d')!
          const tmp = document.createElement('canvas')
          tmp.width = img.width
          tmp.height = img.height
          tmp.getContext('2d')!.putImageData(img, 0, 0)
          ctx.drawImage(tmp, 0, 0, c.width, c.height)
          data = ctx.getImageData(0, 0, c.width, c.height)
        }
        const g = rasterImageToGcode(data, {
          dpi: rasterDpi,
          minPower: rasterMinP,
          maxPower: rasterMaxP,
          speed: rasterSpeed,
          travel: presets.travel,
          page,
        })
        setPreview(g)
        setErr(null)
        onStatus(
          `Bitmap engrave: ${data.width}×${data.height} @ ${rasterDpi} dpi — Send to K1 or Save .nc`,
        )
      } catch (e) {
        setErr(String(e))
      }
    }
    input.click()
  }

  const sendWifi = async () => {
    if (!native) {
      setErr('Wi‑Fi send requires the CutForge desktop app')
      return
    }
    const lines = gcodeToLines(preview)
    if (!lines.length) {
      setErr('Nothing to send — refresh G-code or import a bitmap')
      return
    }
    if (
      !window.confirm(
        `Experimental Wi‑Fi send to ${wifiHost}:${wifiPort}?\n` +
          `${lines.length} lines. Join the laser AP first (often 192.168.4.1).\n` +
          `USB serial is still the reliable path. Cancel if unsure.`,
      )
    ) {
      return
    }
    setWifiBusy(true)
    setErr(null)
    try {
      const r = await grblTcpSend(wifiHost, wifiPort, lines)
      onStatus(r.message)
    } catch (e) {
      setErr(String(e))
      onStatus(`Wi‑Fi send failed: ${String(e)}`)
    } finally {
      setWifiBusy(false)
    }
  }

  const applyMaterial = (id: string, fromList?: MaterialPreset[]) => {
    setMaterialId(id)
    if (id === 'custom') return
    const mat = materialById(id, fromList || materials)
    if (!mat.presets) {
      onStatus(`Material “${mat.name}” has no laser presets`)
      return
    }
    setPresets(clonePresets(mat.presets))
    if (mat.colorMap?.length) onColorMap(mat.colorMap.map((e) => ({ ...e })))
    onStatus(`Material: ${mat.name} (calibrate on scrap)`)
  }

  const runFrame = async (preferSelection: boolean) => {
    const b = getBounds(preferSelection)
    if (!b || b.width < 1 || b.height < 1) {
      setErr('Nothing to frame — draw or select paths')
      return
    }
    const box = paperBoundsToMachine(b, page)
    const lines = buildFrameGcode(box, {
      feed: presets.travel,
      laserPower: frameLowPower ? framePower : 0,
    })
    const via =
      connected
        ? 'USB'
        : native
          ? 'Wi‑Fi (experimental)'
          : null
    if (!via) {
      setErr('Connect USB or use desktop Wi‑Fi send for framing')
      return
    }
    if (
      !window.confirm(
        `Frame ${preferSelection ? 'selection' : 'job'} bbox ` +
          `${(box.maxX - box.minX).toFixed(1)}×${(box.maxY - box.minY).toFixed(1)} mm via ${via}?\n` +
          (frameLowPower
            ? `Low-power laser ON at S${framePower} while tracing.\n`
            : 'Laser OFF (M5) — outline only.\n') +
          'This is NOT a cut.',
      )
    ) {
      return
    }
    setFrameBusy(true)
    setErr(null)
    try {
      if (connected) {
        const result = await serialSendGcode(lines)
        if (result.error) setErr(result.error)
        else onStatus(`Frame done (${result.sent} lines, laser off)`)
      } else {
        const r = await grblTcpSend(wifiHost, wifiPort, lines)
        onStatus(`Frame via Wi‑Fi: ${r.message}`)
      }
    } catch (e) {
      setErr(String(e))
    } finally {
      setFrameBusy(false)
    }
  }

  return (
    <>
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

            <h3>Machine profile</h3>
            <label className="field">
              <span>Active profile</span>
              <select
                value={profileId}
                onChange={(e) => applyMachineProfile(e.target.value)}
              >
                {profiles
                  .filter((p) => p.kind === 'laser-grbl')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 4 }}
              onClick={() => setProfilesOpen(true)}
            >
              Edit profiles…
            </button>
            <p className="hint tight">
              {profiles.find((p) => p.id === profileId)?.notes ||
                'Bed size and connection defaults from the profile.'}
            </p>

            <h3 style={{ marginTop: 14 }}>Connection</h3>
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

            <p className="hint tight" style={{ marginTop: 8 }}>
              Status:{' '}
              {connected ? (
                <strong className="ok-text">USB connected</strong>
              ) : (
                <span>disconnected</span>
              )}
              {grblStatus?.state ? ` · ${grblStatus.state}` : ''}
              {grblStatus &&
                (grblStatus.wposX != null || grblStatus.mposX != null) && (
                  <>
                    {' '}
                    · pos X
                    {(grblStatus.wposX ?? grblStatus.mposX)?.toFixed(2)} Y
                    {(grblStatus.wposY ?? grblStatus.mposY)?.toFixed(2)}
                    {grblStatus.wposX != null ? ' (WPos)' : ' (MPos)'}
                  </>
                )}
            </p>

            <h3 style={{ marginTop: 14 }}>Jog (laser off)</h3>
            <label className="field" style={{ width: 120 }}>
              <span>Step mm</span>
              <select
                value={jogStep}
                onChange={(e) => setJogStep(+e.target.value)}
              >
                <option value={1}>1 mm</option>
                <option value={10}>10 mm</option>
                <option value={50}>50 mm</option>
              </select>
            </label>
            <div className="jog-grid">
              {(
                [
                  [0, 1, 'Y+'],
                  [-1, 0, 'X−'],
                  [1, 0, 'X+'],
                  [0, -1, 'Y−'],
                ] as const
              ).map(([sx, sy, label]) => (
                <button
                  key={label}
                  type="button"
                  className="btn"
                  disabled={!connected || sending || frameBusy}
                  onClick={() =>
                    void serialJog(sx * jogStep, sy * jogStep, 2000)
                      .then(() =>
                        serialQueryStatus()
                          .then(setGrblStatus)
                          .catch(() => undefined),
                      )
                      .catch((e) => setErr(String(e)))
                  }
                >
                  {label} {jogStep}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                disabled={!connected || sending}
                onClick={() =>
                  void serialGoOrigin()
                    .then((r) => onStatus(`Origin: ${r || 'G0 X0 Y0'}`))
                    .catch((e) => setErr(String(e)))
                }
                title="Rapid to work origin X0 Y0, laser off"
              >
                Go origin
              </button>
              <button
                type="button"
                className="btn"
                disabled={!connected}
                onClick={() =>
                  void serialQueryStatus()
                    .then(setGrblStatus)
                    .catch((e) => setErr(String(e)))
                }
              >
                Refresh pos
              </button>
            </div>

            <h3 style={{ marginTop: 14 }}>Frame (bbox only)</h3>
            <p className="hint tight">
              Traces the selection or whole job bounding box. Default laser off.
              Optional low-power outline (not a cut).
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={frameLowPower}
                onChange={(e) => setFrameLowPower(e.target.checked)}
              />
              Low-power laser while framing
            </label>
            {frameLowPower && (
              <label className="field" style={{ width: 100 }}>
                <span>Frame S</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={framePower}
                  onChange={(e) => setFramePower(+e.target.value)}
                />
              </label>
            )}
            <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                disabled={sending || frameBusy || (!connected && !native)}
                onClick={() => void runFrame(true)}
              >
                {frameBusy ? 'Framing…' : 'Frame selection'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={sending || frameBusy || (!connected && !native)}
                onClick={() => void runFrame(false)}
              >
                Frame job
              </button>
            </div>

            <h3 style={{ marginTop: 14 }}>Material</h3>
            <label className="field">
              <span>Laser material</span>
              <select
                value={materialId}
                onChange={(e) => applyMaterial(e.target.value)}
              >
                {materials
                  .filter((m) => m.machine === 'laser')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.thicknessMm != null ? ` (${m.thicknessMm} mm)` : ''}
                    </option>
                  ))}
              </select>
            </label>
            <p className="hint tight">
              {materialById(materialId, materials).description ||
                'Applies speed/power (+ color map if set).'}
            </p>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 4 }}
              onClick={() => setMaterialsOpen(true)}
            >
              Edit materials library…
            </button>

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

            <h3 style={{ marginTop: 14 }}>Bitmap engrave</h3>
            <p className="hint tight">
              Import a raster → grayscale → bidirectional GRBL scan. Replaces
              the G-code preview; then Send job (USB) or Wi‑Fi / Save .nc.
            </p>
            <div className="preset-row" style={{ flexWrap: 'wrap' }}>
              <label>
                DPI
                <input
                  type="number"
                  min={50}
                  max={300}
                  value={rasterDpi}
                  onChange={(e) => setRasterDpi(+e.target.value)}
                />
              </label>
              <label>
                Min S
                <input
                  type="number"
                  value={rasterMinP}
                  onChange={(e) => setRasterMinP(+e.target.value)}
                />
              </label>
              <label>
                Max S
                <input
                  type="number"
                  value={rasterMaxP}
                  onChange={(e) => setRasterMaxP(+e.target.value)}
                />
              </label>
              <label>
                Speed
                <input
                  type="number"
                  value={rasterSpeed}
                  onChange={(e) => setRasterSpeed(+e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 6 }}
              onClick={() => void importBitmapEngrave()}
            >
              Import raster → engrave G-code
            </button>

            <h3 style={{ marginTop: 14 }}>Wi‑Fi (experimental)</h3>
            <p className="hint tight">
              IKIER-class hubs often expose GRBL on TCP{' '}
              <code>192.168.4.1:8080</code> after joining the laser AP. Prefer
              USB. If Wi‑Fi fails, save .nc to a TF/SD card.
            </p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: 1, minWidth: 120 }}>
                <span>Host</span>
                <input
                  value={wifiHost}
                  onChange={(e) => setWifiHost(e.target.value)}
                  disabled={!native}
                />
              </label>
              <label className="field" style={{ width: 90 }}>
                <span>Port</span>
                <input
                  type="number"
                  value={wifiPort}
                  onChange={(e) => setWifiPort(+e.target.value)}
                  disabled={!native}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 6 }}
              disabled={!native || wifiBusy || sending}
              onClick={() => void sendWifi()}
            >
              {wifiBusy ? 'Wi‑Fi sending…' : 'Send via Wi‑Fi (TCP)'}
            </button>

            <h3 style={{ marginTop: 14 }}>Job controls</h3>
            <p className="hint tight">
              Status:{' '}
              <strong>
                {jobPhase === 'idle'
                  ? 'Idle'
                  : jobPhase === 'running'
                    ? 'Running'
                    : jobPhase === 'paused'
                      ? 'Paused'
                      : jobPhase === 'done'
                        ? 'Done'
                        : jobPhase === 'cancelled'
                          ? 'Cancelled'
                          : 'Error'}
              </strong>
              {progress && !progress.done
                ? ` · ${progress.sent}/${progress.total}`
                : progress?.done
                  ? ` · ${progress.sent}/${progress.total}`
                  : ''}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={rebuildPreview}>
                Refresh G-code
              </button>
              <button type="button" className="btn" onClick={() => void saveGcode()}>
                Save .nc (dry-run / TF)
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!native || !connected || sending}
                onClick={() => void sendJob()}
              >
                {sending ? 'Sending…' : 'Send to K1 (USB)'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!sending || jobPaused}
                onClick={() =>
                  void serialPauseJob()
                    .then(() => {
                      setJobPaused(true)
                      setJobPhase('paused')
                      onStatus(
                        'Paused (! feed hold). Resume may need an origin check after a long hold.',
                      )
                    })
                    .catch((e) => setErr(String(e)))
                }
                title="GRBL real-time feed hold (!)"
              >
                Pause
              </button>
              <button
                type="button"
                className="btn"
                disabled={!sending || !jobPaused}
                onClick={() =>
                  void serialResumeJob()
                    .then(() => {
                      setJobPaused(false)
                      setJobPhase('running')
                      onStatus('Resumed (~ cycle start) — verify origin if paused long')
                    })
                    .catch((e) => setErr(String(e)))
                }
                title="GRBL cycle start (~)"
              >
                Resume
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={!sending && !connected}
                onClick={() =>
                  void serialCancelJob()
                    .then(() => {
                      setJobPhase('cancelled')
                      setJobPaused(false)
                      onStatus('Cancel: ! hold → M5 → soft-reset → M5')
                    })
                    .catch((e) => setErr(String(e)))
                }
                title="Feed hold, laser off, soft-reset buffer"
              >
                Cancel / Stop
              </button>
            </div>
            {sending && (
              <p className="hint warn-text" style={{ marginTop: 6 }}>
                After a long pause, check work origin before Resume. Cancel uses
                soft-reset (clears buffer) — start a new job afterward.
              </p>
            )}
            {progress && (
              <p className="hint tight">
                Progress: {progress.sent}/{progress.total}
                {progress.paused ? ' (paused)' : ''}
                {progress.cancelled ? ' (cancelled)' : ''}
                {progress.error ? ` — ${progress.error}` : ''}
              </p>
            )}
            {err && <p className="hint danger-text">{err}</p>}
            <p className="hint tight">
              USB Type-C → serial (usually 115200) is primary. Wi‑Fi TCP is
              experimental (hub AP → host:8080). Linux: <code>dialout</code>.
              Fallback: Save .nc → TF/SD on the controller.
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
    <MaterialsLibraryModal
      open={materialsOpen}
      onClose={() => {
        setMaterialsOpen(false)
        setMaterials(loadMaterials())
      }}
      filterMachine="laser"
      onApplied={(mat) => {
        const next = loadMaterials()
        setMaterials(next)
        applyMaterial(mat.id, next)
      }}
      onStatus={onStatus}
    />
    <MachineProfilesModal
      open={profilesOpen}
      onClose={() => {
        setProfilesOpen(false)
        setProfiles(loadProfiles())
      }}
      filterKind="laser-grbl"
      onApply={(prof) => {
        const next = loadProfiles()
        setProfiles(next)
        applyMachineProfile(prof.id, next)
      }}
      onStatus={onStatus}
    />
    </>
  )
}

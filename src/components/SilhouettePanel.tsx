import { useCallback, useEffect, useState } from 'react'
import paper from 'paper'
import {
  DEFAULT_SILHOUETTE_PRESETS,
  type SilhouettePresets,
} from '../machine/presets'
import { cloneSilhouette, type MaterialPreset } from '../machine/materials'
import { loadMaterials } from '../machine/materialsStore'
import { MaterialsLibraryModal } from './MaterialsLibraryModal'
import { generateGpgl, type RegMarkSeekMode } from '../machine/gpgl'
import {
  listSilhouetteDevices,
  silhouetteSendGpgl,
  silhouetteUsbAvailable,
  type SilhouetteDeviceInfo,
} from '../machine/silhouette'
import { saveTextFile } from '../io/files'
import type { PagePreset } from '../types'

void paper

export function SilhouettePanel({
  open,
  onClose,
  getItems,
  page,
  onStatus,
}: {
  open: boolean
  onClose: () => void
  getItems: () => paper.Item[]
  page: PagePreset
  onStatus: (s: string) => void
}) {
  const [printThenCut, setPrintThenCut] = useState(true)
  const [regMarkSeek, setRegMarkSeek] = useState<RegMarkSeekMode>('auto')
  const [materials, setMaterials] = useState<MaterialPreset[]>(() => loadMaterials())
  const [materialId, setMaterialId] = useState('sil-vinyl')
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const native = silhouetteUsbAvailable()
  const [devices, setDevices] = useState<SilhouetteDeviceInfo[]>([])
  const [selected, setSelected] = useState('')
  const [presets, setPresets] = useState<SilhouettePresets>({
    ...DEFAULT_SILHOUETTE_PRESETS,
    cut: { ...DEFAULT_SILHOUETTE_PRESETS.cut },
    score: { ...DEFAULT_SILHOUETTE_PRESETS.score },
    engrave: { ...DEFAULT_SILHOUETTE_PRESETS.engrave },
  })
  const [preview, setPreview] = useState('')
  const [pathCount, setPathCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!native) return
    try {
      const list = await listSilhouetteDevices()
      setDevices(list)
      if (list.length && !selected) {
        setSelected(`${list[0].vendorId}:${list[0].productId}`)
      }
      setErr(null)
    } catch (e) {
      setErr(String(e))
    }
  }, [native, selected])

  const gpglOpts = useCallback(
    () => ({
      presets,
      regMarkSeek: printThenCut ? regMarkSeek : ('off' as RegMarkSeekMode),
    }),
    [presets, printThenCut, regMarkSeek],
  )

  const rebuild = useCallback(() => {
    try {
      const job = generateGpgl(getItems(), page, gpglOpts())
      setPreview(job.preview)
      setPathCount(job.pathCount)
      setErr(null)
    } catch (e) {
      setErr(String(e))
    }
  }, [getItems, page, gpglOpts])

  useEffect(() => {
    if (!open) return
    setMaterials(loadMaterials())
    void refresh()
    rebuild()
  }, [open, refresh, rebuild])

  if (!open) return null

  const send = async () => {
    const job = generateGpgl(getItems(), page, gpglOpts())
    if (!job.pathCount) {
      setErr('No cut/score/engrave paths to send')
      return
    }
    if (!native) {
      setErr('USB send requires the CutForge desktop app')
      return
    }
    const [vs, ps] = selected.split(':').map((x) => parseInt(x, 10))
    if (!vs || Number.isNaN(ps)) {
      setErr('Select a Silhouette USB device')
      return
    }
    const seekNote = job.includesRegSeek
      ? `Optical seek (${regMarkSeek}): keep marks visible; wait up to ~40s. If seek fails, open Cut SVG in Silhouette Studio.\n`
      : ''
    if (
      !window.confirm(
        `Send ${job.pathCount} path(s) to the Silhouette?\n\n` +
          (printThenCut
            ? 'Print-then-cut: confirm the inkjet print is loaded and marks are visible.\n'
            : '') +
          seekNote +
          `Load media on the mat first. CutForge uses open GPGL over USB (inkscape-silhouette compatible).`,
      )
    ) {
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const msg = await silhouetteSendGpgl(
        vs,
        ps,
        job.bytes,
        job.includesRegSeek,
      )
      onStatus(msg)
      if (job.includesRegSeek) {
        onStatus(
          msg +
            ' — If marks were not found, use Cut SVG → Silhouette Studio for sensor registration.',
        )
      }
    } catch (e) {
      setErr(String(e))
      onStatus(`Silhouette send failed: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveDump = async () => {
    const job = generateGpgl(getItems(), page, gpglOpts())
    const result = await saveTextFile('gcode', 'cutforge-silhouette.gpgl', job.bytes)
    if (result) onStatus(`Saved ${result.name}`)
  }

  const setOp = (
    key: 'cut' | 'score' | 'engrave',
    field: 'speed' | 'pressure',
    value: number,
  ) => {
    setPresets((p) => ({ ...p, [key]: { ...p[key], [field]: value } }))
  }

  const applyMaterial = (id: string, fromList?: MaterialPreset[]) => {
    setMaterialId(id)
    const mat = (fromList || materials).find((m) => m.id === id)
    if (!mat?.silhouette) return
    setPresets(cloneSilhouette(mat.silhouette))
    onStatus(`Material: ${mat.name}`)
  }

  return (
    <>
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Send to Silhouette</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body machine-panel-body">
          <div className="machine-panel-left">
            {!native && (
              <p className="hint warn-text">
                USB send works in the <strong>desktop app</strong> only. You can
                still preview / save a GPGL dump, or use inkscape-silhouette as a
                fallback.
              </p>
            )}
            <h3>USB device</h3>
            <div className="row" style={{ gap: 8 }}>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                style={{ flex: 1 }}
                disabled={!native}
              >
                {devices.length === 0 && (
                  <option value="">(none detected)</option>
                )}
                {devices.map((d) => (
                  <option
                    key={`${d.vendorId}:${d.productId}:${d.address}`}
                    value={`${d.vendorId}:${d.productId}`}
                  >
                    {d.name} ({d.vendorId.toString(16)}:{d.productId.toString(16)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                disabled={!native}
                onClick={() => void refresh()}
              >
                Refresh
              </button>
            </div>

            <h3 style={{ marginTop: 12 }}>Material</h3>
            <label className="field">
              <span>Silhouette media preset</span>
              <select
                value={materialId}
                onChange={(e) => applyMaterial(e.target.value)}
              >
                {materials
                  .filter((m) => m.machine === 'silhouette')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 4 }}
              onClick={() => setMaterialsOpen(true)}
            >
              Edit materials library…
            </button>

            <h3 style={{ marginTop: 12 }}>Tool mapping</h3>
            <p className="hint tight">
              Cut → blade · Score → light blade (kiss) · Engrave → pen/draw
            </p>
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
                    min={1}
                    max={10}
                    value={presets[key].speed}
                    onChange={(e) => setOp(key, 'speed', +e.target.value)}
                  />
                </label>
                <label>
                  Pressure
                  <input
                    type="number"
                    min={1}
                    max={33}
                    value={presets[key].pressure}
                    onChange={(e) => setOp(key, 'pressure', +e.target.value)}
                  />
                </label>
                <span className="hint tight">{presets[key].tool}</span>
              </div>
            ))}

            <h3 style={{ marginTop: 12 }}>Print &amp; cut</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={printThenCut}
                onChange={(e) => setPrintThenCut(e.target.checked)}
              />
              Print-then-cut workflow
            </label>
            {printThenCut && (
              <>
                <label className="field" style={{ marginTop: 8 }}>
                  <span>Optical / sensor reg-mark seek</span>
                  <select
                    value={regMarkSeek}
                    onChange={(e) =>
                      setRegMarkSeek(e.target.value as RegMarkSeekMode)
                    }
                  >
                    <option value="auto">Auto (TB123 USB seek)</option>
                    <option value="manual">Manual (TB23)</option>
                    <option value="off">Off (align by eye)</option>
                  </select>
                </label>
                <ol className="hint tight print-cut-steps">
                  <li>
                    Inspector → <strong>Print &amp; Cut mode</strong>; style
                    artwork as <strong>print</strong>, knife as Cut/Score.
                  </li>
                  <li>
                    Export <strong>Print PNG/PDF</strong>, inkjet it (marks
                    included).
                  </li>
                  <li>
                    Load print on the mat with marks visible; send cut GPGL
                    here (print objects skipped).
                  </li>
                  <li>
                    If sensor seek fails or firmware rejects TB123: export{' '}
                    <strong>Cut SVG</strong> → open in{' '}
                    <strong>Silhouette Studio</strong> for full optical
                    registration.
                  </li>
                </ol>
              </>
            )}

            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={rebuild}>
                Refresh GPGL
              </button>
              <button type="button" className="btn" onClick={() => void saveDump()}>
                Save .gpgl
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !native || !selected}
                onClick={() => void send()}
              >
                {busy ? 'Sending…' : 'Send to cutter'}
              </button>
            </div>
            {err && <p className="hint danger-text">{err}</p>}
            <p className="hint tight">
              Supported: Cameo 1–5 / Plus / Pro, Portrait 1–4 (USB). Linux: udev
              rule for <code>0b4d</code> or group <code>lp</code>. macOS: allow USB.
              Windows: may need Zadig/libusb. Bluetooth not in v0.8. Fallback:{' '}
              <a
                href="https://github.com/fablabnbg/inkscape-silhouette"
                target="_blank"
                rel="noreferrer"
              >
                inkscape-silhouette
              </a>
              .
            </p>
          </div>
          <div className="machine-panel-right">
            <h3>
              GPGL preview ({pathCount} paths)
            </h3>
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
      filterMachine="silhouette"
      onApplied={(mat) => {
        const next = loadMaterials()
        setMaterials(next)
        applyMaterial(mat.id, next)
      }}
      onStatus={onStatus}
    />
    </>
  )
}

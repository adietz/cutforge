import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_TRACE,
  fileToImageData,
  traceImageData,
  type TraceControls,
  type TraceMode,
} from '../canvas/imageTrace'

export function TraceModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean
  onClose: () => void
  onApply: (svg: string, name: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [controls, setControls] = useState<TraceControls>({ ...DEFAULT_TRACE })
  const [previewSvg, setPreviewSvg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imgDataRef = useRef<ImageData | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const runTrace = useCallback(async (imgd: ImageData, c: TraceControls) => {
    setBusy(true)
    setError(null)
    try {
      // Yield so UI can paint "Tracing…"
      await new Promise((r) => setTimeout(r, 20))
      const svg = traceImageData(imgd, c)
      setPreviewSvg(svg)
    } catch (err) {
      setError(String(err))
      setPreviewSvg(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const onPick = async (f: File | null) => {
    if (!f) return
    setFile(f)
    setBusy(true)
    setError(null)
    try {
      const { imageData } = await fileToImageData(f)
      // Cap huge images for performance
      let imgd = imageData
      const maxDim = 1200
      if (imageData.width > maxDim || imageData.height > maxDim) {
        const scale = maxDim / Math.max(imageData.width, imageData.height)
        const w = Math.round(imageData.width * scale)
        const h = Math.round(imageData.height * scale)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')!
        const tmp = document.createElement('canvas')
        tmp.width = imageData.width
        tmp.height = imageData.height
        tmp.getContext('2d')!.putImageData(imageData, 0, 0)
        ctx.drawImage(tmp, 0, 0, w, h)
        imgd = ctx.getImageData(0, 0, w, h)
      }
      imgDataRef.current = imgd
      await runTrace(imgd, controls)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setFile(null)
      setPreviewSvg(null)
      imgDataRef.current = null
      setError(null)
    }
  }, [open])

  if (!open) return null

  const set = (partial: Partial<TraceControls>) => {
    const next = { ...controls, ...partial }
    setControls(next)
    if (imgDataRef.current) void runTrace(imgDataRef.current, next)
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
          <h2>Trace image</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body trace-body">
          <div className="trace-controls">
            <button
              type="button"
              className="btn primary"
              onClick={() => fileInput.current?.click()}
            >
              Choose PNG / JPG
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              hidden
              onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="hint tight">
                {file.name}
                {busy ? ' — tracing…' : ''}
              </p>
            )}

            <label className="field">
              <span>Mode</span>
              <select
                value={controls.mode}
                onChange={(e) => set({ mode: e.target.value as TraceMode })}
              >
                <option value="mono">Mono (line art / logos)</option>
                <option value="color">Color (posterize)</option>
              </select>
            </label>

            {controls.mode === 'mono' && (
              <label className="field">
                <span>Threshold ({controls.threshold})</span>
                <input
                  type="range"
                  min={20}
                  max={220}
                  value={controls.threshold}
                  onChange={(e) => set({ threshold: +e.target.value })}
                />
              </label>
            )}

            {controls.mode === 'color' && (
              <label className="field">
                <span>Colors ({controls.colors})</span>
                <input
                  type="range"
                  min={2}
                  max={32}
                  value={controls.colors}
                  onChange={(e) => set({ colors: +e.target.value })}
                />
              </label>
            )}

            <label className="field">
              <span>Ignore small paths ({controls.pathomit})</span>
              <input
                type="range"
                min={0}
                max={40}
                value={controls.pathomit}
                onChange={(e) => set({ pathomit: +e.target.value })}
              />
            </label>

            <label className="field">
              <span>Simplify ({controls.simplify.toFixed(1)})</span>
              <input
                type="range"
                min={0.2}
                max={8}
                step={0.2}
                value={controls.simplify}
                onChange={(e) => set({ simplify: +e.target.value })}
              />
            </label>

            <label className="field">
              <span>Blur ({controls.blur})</span>
              <input
                type="range"
                min={0}
                max={8}
                value={controls.blur}
                onChange={(e) => set({ blur: +e.target.value })}
              />
            </label>

            {error && <p className="hint danger-text">{error}</p>}

            <div className="row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn primary"
                disabled={!previewSvg || busy}
                onClick={() => {
                  if (!previewSvg || !file) return
                  onApply(previewSvg, file.name.replace(/\.[^.]+$/, '') || 'Trace')
                  onClose()
                }}
              >
                Place on canvas
              </button>
            </div>
            <p className="hint tight">
              Best for high-contrast logos and line art. Photos need strong
              threshold / fewer colors. Paths are styled as Cut when placed.
            </p>
          </div>
          <div className="trace-preview">
            {previewSvg ? (
              <div
                className="trace-preview-svg"
                dangerouslySetInnerHTML={{ __html: previewSvg }}
              />
            ) : (
              <div className="trace-preview-empty">Preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

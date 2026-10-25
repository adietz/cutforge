import { useEffect, useState } from 'react'
import {
  IMPORT_FORMATS,
  acceptAttribute,
  allExtensions,
} from '../import/formats'
import {
  getHelperStatus,
  importVectorFile,
  type HelperStatus,
  type ImportResult,
} from '../import/pipeline'
import { isTauri } from '@tauri-apps/api/core'

export function ImportModal({
  open,
  onClose,
  onImported,
  onStatus,
}: {
  open: boolean
  onClose: () => void
  onImported: (result: ImportResult) => void
  onStatus: (s: string) => void
}) {
  const [helpers, setHelpers] = useState<HelperStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const native = isTauri()

  useEffect(() => {
    if (!open) return
    void getHelperStatus().then(setHelpers).catch(() => setHelpers(null))
  }, [open])

  if (!open) return null

  const pick = async () => {
    setErr(null)
    try {
      if (native) {
        const { open: openDlg } = await import('@tauri-apps/plugin-dialog')
        const { readFile } = await import('@tauri-apps/plugin-fs')
        const selected = await openDlg({
          multiple: false,
          title: 'Import vector',
          filters: [
            {
              name: 'Vector formats',
              extensions: allExtensions(),
            },
            ...IMPORT_FORMATS.map((f) => ({
              name: f.label,
              extensions: f.extensions,
            })),
          ],
        })
        if (!selected || Array.isArray(selected)) return
        const name = selected.split(/[/\\]/).pop() || selected
        setBusy(true)
        const data = await readFile(selected)
        const result = await importVectorFile({ name, data })
        onImported(result)
        onStatus(`${result.message} (${result.tool})`)
        onClose()
      } else {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = acceptAttribute()
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return
          setBusy(true)
          setErr(null)
          try {
            const result = await importVectorFile(file)
            onImported(result)
            onStatus(`${result.message} (${result.tool})`)
            onClose()
          } catch (e) {
            setErr(String(e))
            onStatus(`Import failed: ${String(e)}`)
          } finally {
            setBusy(false)
          }
        }
        input.click()
        return
      }
    } catch (e) {
      setErr(String(e))
      onStatus(`Import failed: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Import vector"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Import vector</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          <p className="hint">
            Bring artwork from Illustrator, CorelDRAW, CAD, and more. Colors map
            to cut types (red→cut, blue→score, black→engrave, magenta→print).
          </p>

          <table className="import-format-table">
            <thead>
              <tr>
                <th>Format</th>
                <th>Ext</th>
                <th>Engine</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_FORMATS.map((f) => (
                <tr key={f.id}>
                  <td>
                    <strong>{f.label}</strong>
                  </td>
                  <td>
                    <code>.{f.extensions.join(' .')}</code>
                  </td>
                  <td>
                    {f.engine === 'pure-js'
                      ? 'Pure JS'
                      : f.engine === 'helper'
                        ? 'Desktop helper'
                        : 'JS or helper'}
                  </td>
                  <td className="hint tight">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 14 }}>Helpers on this machine</h3>
          {helpers ? (
            <ul className="hint tight helper-list">
              <li>
                Inkscape:{' '}
                {helpers.inkscape ? '✓ found' : '— not found (optional)'}
              </li>
              <li>
                pdftocairo:{' '}
                {helpers.pdftocairo ? '✓ found' : '— not found'}
              </li>
              <li>
                Ghostscript: {helpers.ghostscript ? '✓ found' : '— not found'}
              </li>
              <li>
                LibreOffice:{' '}
                {helpers.libreoffice
                  ? '✓ found (CDR via libcdr)'
                  : '— not found'}
              </li>
              {helpers.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="hint tight">Checking helpers…</p>
          )}

          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void pick()}
            >
              {busy ? 'Importing…' : 'Choose file…'}
            </button>
          </div>
          {err && <p className="hint danger-text">{err}</p>}
          <p className="hint tight" style={{ marginTop: 10 }}>
            <strong>Pure JS:</strong> SVG, DXF. <strong>Needs helper:</strong>{' '}
            PDF, AI, EPS, CDR, EMF/WMF (desktop CutForge + LibreOffice /
            pdftocairo / gs; Inkscape optional). Without helpers, export SVG or
            PDF from Illustrator / Corel and import that.
          </p>
        </div>
      </div>
    </div>
  )
}

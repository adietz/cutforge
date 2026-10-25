import { useEffect, useMemo, useState } from 'react'
import {
  MACHINE_PROFILES,
  profileById,
  type ExportFormat,
  type MachineProfile,
} from '../export/profiles'
import type { Unit } from '../types'

export interface MachineExportOptions {
  profileId: string
  format: ExportFormat
  unit: Unit
  hairline: boolean
  includeRegMarks: boolean
  flattenText: boolean
  excludeHiddenLocked: boolean
  applySuggestedPage: boolean
}

export function MachineExportModal({
  open,
  onClose,
  onExport,
  textCount,
  currentPageId,
}: {
  open: boolean
  onClose: () => void
  onExport: (opts: MachineExportOptions) => void | Promise<void>
  textCount: number
  currentPageId: string
}) {
  const [profileId, setProfileId] = useState('ikier-k1')
  const profile = useMemo(() => profileById(profileId), [profileId])

  const [format, setFormat] = useState<ExportFormat>(profile.format)
  const [unit, setUnit] = useState<Unit>(profile.unit)
  const [hairline, setHairline] = useState(profile.hairline)
  const [includeRegMarks, setIncludeRegMarks] = useState(profile.includeRegMarks)
  const [flattenText, setFlattenText] = useState(profile.flattenText)
  const [excludeHiddenLocked, setExcludeHiddenLocked] = useState(
    profile.excludeHiddenLocked,
  )
  const [applySuggestedPage, setApplySuggestedPage] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const p = profileById(profileId)
    setFormat(p.format)
    setUnit(p.unit)
    setHairline(p.hairline)
    setIncludeRegMarks(p.includeRegMarks)
    setFlattenText(p.flattenText)
    setExcludeHiddenLocked(p.excludeHiddenLocked)
    setApplySuggestedPage(!!p.suggestedPageId)
  }, [open, profileId])

  if (!open) return null

  const showPageHint =
    !!profile.suggestedPageId && profile.suggestedPageId !== currentPageId

  const textWarn =
    textCount > 0 && !flattenText
      ? `${textCount} text object(s) will export as <text>/DXF TEXT — many cutters ignore fonts. Enable “Flatten text to outlines”.`
      : textCount > 0 && flattenText
        ? `${textCount} text object(s) will be converted to outlines before export (undoable).`
        : null

  const applyProfile = (p: MachineProfile) => {
    setProfileId(p.id)
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Machine export"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Machine export</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body machine-export-body">
          <div className="machine-export-controls">
            <label className="field">
              <span>Machine profile</span>
              <select
                value={profileId}
                onChange={(e) => applyProfile(profileById(e.target.value))}
              >
                {MACHINE_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint tight">{profile.description}</p>

            <label className="field">
              <span>Format</span>
              <select
                value={format}
                disabled={!profile.allowFormatSwitch && format === profile.format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
              >
                {(profile.allowFormatSwitch
                  ? (['svg', 'dxf'] as ExportFormat[])
                  : [profile.format]
                ).map((f) => (
                  <option key={f} value={f}>
                    {f.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Units</span>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
              >
                <option value="mm">mm</option>
                <option value="in">in</option>
              </select>
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={hairline}
                onChange={(e) => setHairline(e.target.checked)}
              />
              Hairline strokes (Silhouette-friendly)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={includeRegMarks}
                onChange={(e) => setIncludeRegMarks(e.target.checked)}
              />
              Include registration marks
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={flattenText}
                onChange={(e) => setFlattenText(e.target.checked)}
              />
              Flatten text to outlines before export
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={excludeHiddenLocked}
                onChange={(e) => setExcludeHiddenLocked(e.target.checked)}
              />
              Exclude hidden &amp; locked objects
            </label>
            {profile.suggestedPageId && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={applySuggestedPage}
                  onChange={(e) => setApplySuggestedPage(e.target.checked)}
                />
                Set page to {profile.suggestedPageId}
                {showPageHint ? ' (recommended)' : ' (already current)'}
              </label>
            )}

            {textWarn && <p className="hint tight warn-text">{textWarn}</p>}
            {profile.workflowNote && (
              <p className="hint tight">{profile.workflowNote}</p>
            )}
            <p className="hint tight">{profile.coordNote}</p>

            <div className="row" style={{ marginTop: 14, gap: 8 }}>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void Promise.resolve(
                    onExport({
                      profileId,
                      format,
                      unit,
                      hairline,
                      includeRegMarks,
                      flattenText,
                      excludeHiddenLocked,
                      applySuggestedPage,
                    }),
                  ).finally(() => {
                    setBusy(false)
                    onClose()
                  })
                }}
              >
                {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
          <div className="machine-export-aside">
            <h3>Cut / Score / Engrave</h3>
            <ul className="machine-swatches">
              <li>
                <span className="swatch" style={{ background: '#FF0000' }} />
                Cut — red
              </li>
              <li>
                <span className="swatch" style={{ background: '#0000FF' }} />
                Score — blue
              </li>
              <li>
                <span className="swatch" style={{ background: '#000000' }} />
                Engrave — black
              </li>
            </ul>
            <p className="hint tight">
              IKIER K1 and LightBurn profiles write these as SVG groups + stroke
              colors. DXF uses layers named CUT / SCORE / ENGRAVE.
            </p>
            <p className="hint tight">
              USB / G-code send is not available in CutForge yet — export a file
              and open it in LightBurn, LaserGRBL, or Silhouette Studio.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

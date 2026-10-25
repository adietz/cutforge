import { useCallback, useEffect, useRef, useState } from 'react'
import { CanvasView } from './components/CanvasView'
import { HelpModal } from './components/HelpModal'
import { TraceModal } from './components/TraceModal'
import {
  MachineExportModal,
  type MachineExportOptions,
} from './components/MachineExportModal'
import { profileById } from './export/profiles'
import { MachinePanel } from './components/MachinePanel'
import { SilhouettePanel } from './components/SilhouettePanel'
import { Inspector } from './components/Inspector'
import { RecoveryModal } from './components/RecoveryModal'
import { Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import type { CutForgeEditor } from './canvas/editor'
import { exportDxf } from './export/dxf'
import { exportSvg } from './export/svg'
import { openTextFile, saveTextFile } from './io/files'
import { PAGE_PRESETS, presetById } from './pagePresets'
import {
  clearRecovery,
  readRecovery,
  writeRecovery,
} from './project/autosave'
import { parseDocument } from './project/cutforgeDoc'
import type {
  DocStyle,
  EditorSnapshot,
  LayerInfo,
  PagePreset,
  SnapSettings,
  Tool,
  Unit,
} from './types'
import { DEFAULT_SNAP, HAIRLINE_MM, INCH_TO_MM } from './types'
import {
  DEFAULT_LASER_COLOR_MAP,
  type LaserColorMapEntry,
} from './machine/colorMap'
import './App.css'

export default function App() {
  const editorRef = useRef<CutForgeEditor | null>(null)
  const projectPathRef = useRef<string | null>(null)

  const [tool, setTool] = useState<Tool>('select')
  const [unit, setUnit] = useState<Unit>('in')
  const [page, setPage] = useState<PagePreset>(PAGE_PRESETS[2])
  const [style, setStyle] = useState<DocStyle>({
    strokeColor: '#e74c3c',
    strokeWidthMm: HAIRLINE_MM,
    fillColor: null,
    cutType: 'cut',
    hairline: true,
  })
  const [snap, setSnap] = useState<SnapSettings>({ ...DEFAULT_SNAP })
  const [selectedCount, setSelectedCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState('Ready')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [layers, setLayers] = useState<LayerInfo[]>([])
  const [cursorLabel, setCursorLabel] = useState('—')
  const [helpOpen, setHelpOpen] = useState(false)
  const [hairlineExport, setHairlineExport] = useState(true)
  const [fileLabel, setFileLabel] = useState('Untitled.cutforge')
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryLabel, setRecoveryLabel] = useState('')
  const [regMarks, setRegMarks] = useState(false)
  const [objectCount, setObjectCount] = useState(0)
  const [canBoolean, setCanBoolean] = useState(false)
  const [hasText, setHasText] = useState(false)
  const [outlineFontId, setOutlineFontId] = useState('inter')
  const [traceOpen, setTraceOpen] = useState(false)
  const [machineExportOpen, setMachineExportOpen] = useState(false)
  const [machinePanelOpen, setMachinePanelOpen] = useState(false)
  const [silhouettePanelOpen, setSilhouettePanelOpen] = useState(false)
  const [laserColorMap, setLaserColorMap] = useState<LaserColorMapEntry[]>(
    () => DEFAULT_LASER_COLOR_MAP.map((e) => ({ ...e })),
  )
  const [exportTextCount, setExportTextCount] = useState(0)
  const recoveryJson = useRef<string | null>(null)

  const onUpdate = useCallback(
    (info: EditorSnapshot) => {
      setSelectedCount(info.selectedCount)
      setZoom(info.zoom)
      setStatus(info.status)
      setCanUndo(info.canUndo)
      setCanRedo(info.canRedo)
      setLayers(info.layers)
      setSnap(info.snap)
      setRegMarks(info.regMarks)
      setTool(info.tool)
      setObjectCount(info.objectCount)
      setCanBoolean(info.canBoolean)
      setHasText(info.hasText)
      setFileLabel(
        (info.fileName || 'Untitled.cutforge') + (info.dirty ? ' •' : ''),
      )
      if (info.style) {
        setStyle(info.style)
        if (info.style.hairline) setHairlineExport(true)
      }
    },
    [],
  )

  const onCursor = useCallback(
    (c: { xMm: number; yMm: number } | null) => {
      if (!c) {
        setCursorLabel('—')
        return
      }
      const x = unit === 'in' ? c.xMm / INCH_TO_MM : c.xMm
      const y = unit === 'in' ? c.yMm / INCH_TO_MM : c.yMm
      setCursorLabel(
        `X ${x.toFixed(unit === 'in' ? 3 : 2)}  Y ${y.toFixed(
          unit === 'in' ? 3 : 2,
        )} ${unit}`,
      )
    },
    [unit],
  )

  useEffect(() => {
    const rec = readRecovery()
    if (!rec) return
    recoveryJson.current = rec.json
    const d = new Date(rec.savedAt)
    setRecoveryLabel(
      d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    )
    setRecoveryOpen(true)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      const ed = editorRef.current
      if (!ed || !ed.isDirty()) return
      try {
        writeRecovery(ed.toProjectJSON('Autosave'))
      } catch {
        /* */
      }
    }, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const onSaveAs = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) return
    const suggested =
      ed.getFileName()?.replace(/\.cutforge$/i, '') || 'Untitled'
    const defaultName = suggested.endsWith('.cutforge')
      ? suggested
      : `${suggested}.cutforge`
    const json = ed.toProjectJSON(suggested)
    const result = await saveTextFile('cutforge', defaultName, json, null)
    if (!result) return
    ed.setFileName(result.name)
    projectPathRef.current = result.path
    ed.markClean()
    clearRecovery()
    setStatus(`Saved ${result.name}`)
  }, [])

  const onSave = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) return
    if (!ed.getFileName() && !projectPathRef.current) {
      await onSaveAs()
      return
    }
    const name = ed.getFileName() || 'Untitled.cutforge'
    const json = ed.toProjectJSON()
    const result = await saveTextFile(
      'cutforge',
      name,
      json,
      projectPathRef.current,
    )
    if (!result) return
    ed.setFileName(result.name)
    if (result.path) projectPathRef.current = result.path
    ed.markClean()
    clearRecovery()
    setStatus(`Saved ${result.name}`)
  }, [onSaveAs])

  const onOpen = useCallback(async () => {
    const ed = editorRef.current
    if (!ed) return
    if (ed.isDirty() && !window.confirm('Discard unsaved changes?')) return
    const file = await openTextFile('cutforge')
    if (!file) return
    try {
      const doc = parseDocument(file.text)
      ed.loadProject(doc)
      ed.setFileName(
        file.name.endsWith('.cutforge') ? file.name : `${file.name}.cutforge`,
      )
      projectPathRef.current = file.path
      setPage({ ...doc.page })
      setUnit(doc.unit)
      setStyle({ ...doc.style })
      if (doc.laserColorMap) {
        setLaserColorMap(doc.laserColorMap.map((e) => ({ ...e })))
      }
      setSnap({ ...DEFAULT_SNAP, ...doc.snap })
      setRegMarks(!!doc.regMarks)
      clearRecovery()
      setStatus(`Opened ${file.name}`)
    } catch (err) {
      setStatus(`Open failed: ${String(err)}`)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '?' &&
        !(e.target as HTMLElement)?.closest('input,textarea,select')
      ) {
        setHelpOpen(true)
        e.preventDefault()
      }
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (e.shiftKey) void onSaveAs()
        else void onSave()
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void onOpen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave, onSaveAs, onOpen])

  const applyLaserColorMap = (map: LaserColorMapEntry[]) => {
    setLaserColorMap(map)
    editorRef.current?.setLaserColorMap(map)
  }

  const applyStyle = (partial: Partial<DocStyle>) => {
    setStyle((s) => {
      const next = { ...s, ...partial }
      if (partial.hairline) {
        next.strokeWidthMm = HAIRLINE_MM
        setHairlineExport(true)
      }
      return next
    })
    editorRef.current?.setStyle(partial)
  }

  const onUnitChange = (u: Unit) => {
    setUnit(u)
    editorRef.current?.setUnit(u)
  }

  const onPageId = (id: string) => {
    setPage({ ...presetById(id) })
  }

  const onCustomSize = (widthMm: number, heightMm: number) => {
    setPage({
      id: 'custom',
      name: 'Custom',
      widthMm: Math.max(1, widthMm),
      heightMm: Math.max(1, heightMm),
    })
  }

  const onNew = () => {
    const ed = editorRef.current
    if (!ed) return
    if (ed.isDirty() && !window.confirm('Discard unsaved changes?')) return
    ed.loadProject({
      format: 'cutforge',
      version: 1,
      name: 'Untitled',
      unit,
      page: { ...PAGE_PRESETS[2] },
      style: {
        strokeColor: '#e74c3c',
        strokeWidthMm: HAIRLINE_MM,
        fillColor: null,
        cutType: 'cut',
        hairline: true,
      },
      snap: { ...DEFAULT_SNAP },
      regMarks: false,
      objects: [],
      savedAt: new Date().toISOString(),
    })
    projectPathRef.current = null
    setPage({ ...PAGE_PRESETS[2] })
    setRegMarks(false)
    setLaserColorMap(DEFAULT_LASER_COLOR_MAP.map((e) => ({ ...e })))
    clearRecovery()
  }

  const onImportSvg = async () => {
    const file = await openTextFile('svg')
    if (!file) return
    editorRef.current?.importSvg(file.text)
    setStatus(`Imported ${file.name}`)
  }

  const onExportSvg = async () => {
    const ed = editorRef.current
    if (!ed) return
    if (ed.getObjectCount() === 0 && !ed.hasRegistrationMarks()) {
      setStatus('Nothing to export — draw something first')
      return
    }
    const svg = exportSvg(ed.getExportItems(), ed.getPage(), unit, {
      hairline: hairlineExport || !!style.hairline,
    })
    const result = await saveTextFile('svg', 'cutforge.svg', svg)
    if (result) {
      setStatus(
        hairlineExport || style.hairline
          ? `Exported ${result.name} (hairline)`
          : `Exported ${result.name}`,
      )
    }
  }

  const onExportDxf = async () => {
    const ed = editorRef.current
    if (!ed) return
    if (ed.getObjectCount() === 0 && !ed.hasRegistrationMarks()) {
      setStatus('Nothing to export — draw something first')
      return
    }
    const dxf = exportDxf(ed.getExportItems(), ed.getPage(), {
      chordalMm: 0.1,
    })
    const result = await saveTextFile('dxf', 'cutforge.dxf', dxf)
    if (result) setStatus(`Exported ${result.name}`)
  }


  const openMachineExport = () => {
    const ed = editorRef.current
    setExportTextCount(ed?.countTextObjects() ?? 0)
    setMachineExportOpen(true)
  }

  const onMachineExport = async (opts: MachineExportOptions) => {
    const ed = editorRef.current
    if (!ed) return
    const profile = profileById(opts.profileId)

    if (opts.applySuggestedPage && profile.suggestedPageId) {
      onPageId(profile.suggestedPageId)
      // allow React state to settle — editor reads page from CanvasView prop on next tick;
      // use the suggested preset directly for export geometry
    }

    if (opts.flattenText) {
      const n = await ed.convertAllTextToOutlines(outlineFontId)
      if (n > 0) setStatus(`Outlined ${n} text object(s) for export`)
    }

    const remaining = ed.countTextObjects({
      excludeLocked: opts.excludeHiddenLocked,
      excludeHidden: opts.excludeHiddenLocked,
    })
    if (remaining > 0 && opts.flattenText) {
      setStatus(
        `Warning: ${remaining} text object(s) could not be outlined — still in export`,
      )
    }

    const pageForExport =
      opts.applySuggestedPage && profile.suggestedPageId
        ? { ...presetById(profile.suggestedPageId) }
        : ed.getPage()

    // Sync unit on editor for consistency
    if (opts.unit !== unit) {
      setUnit(opts.unit)
      ed.setUnit(opts.unit)
    }

    const items = ed.getExportItems({
      includeRegMarks: opts.includeRegMarks,
      excludeLocked: opts.excludeHiddenLocked,
      excludeHidden: opts.excludeHiddenLocked,
    })
    if (!items.length) {
      setStatus('Nothing to export — draw something first')
      return
    }

    const stem = profile.defaultFilename.replace(/\.(svg|dxf)$/i, '')
    const filename = `${stem}.${opts.format}`

    if (opts.format === 'dxf') {
      const dxf = exportDxf(items, pageForExport, {
        chordalMm: 0.1,
        excludeLocked: opts.excludeHiddenLocked,
      })
      const result = await saveTextFile('dxf', filename, dxf)
      if (result) setStatus(`Machine export: ${result.name} (${profile.name})`)
    } else {
      const svg = exportSvg(items, pageForExport, opts.unit, {
        hairline: opts.hairline,
        excludeLocked: opts.excludeHiddenLocked,
        styleMode: profile.svgMode,
        comment: `${profile.name} — ${profile.coordNote}`,
      })
      const result = await saveTextFile('svg', filename, svg)
      if (result) setStatus(`Machine export: ${result.name} (${profile.name})`)
    }
  }

  const onRestore = () => {
    const json = recoveryJson.current
    setRecoveryOpen(false)
    if (!json || !editorRef.current) return
    try {
      const doc = parseDocument(json)
      editorRef.current.loadProject(doc)
      setPage({ ...doc.page })
      setUnit(doc.unit)
      setStyle({ ...doc.style })
      if (doc.laserColorMap) {
        setLaserColorMap(doc.laserColorMap.map((e) => ({ ...e })))
      }
      setRegMarks(!!doc.regMarks)
      setStatus('Restored autosave')
    } catch (err) {
      setStatus(`Restore failed: ${String(err)}`)
      clearRecovery()
    }
  }

  return (
    <div className="app">
      <TopBar
        status={status}
        canUndo={canUndo}
        canRedo={canRedo}
        cursorLabel={cursorLabel}
        fileLabel={fileLabel}
        onNew={onNew}
        onOpen={() => void onOpen()}
        onSave={() => void onSave()}
        onSaveAs={() => void onSaveAs()}
        onImportSvg={() => void onImportSvg()}
        onExportSvg={() => void onExportSvg()}
        onExportDxf={() => void onExportDxf()}
        onMachineExport={openMachineExport}
        onSendMachine={() => {
          const map = editorRef.current?.getLaserColorMap()
          if (map) setLaserColorMap(map)
          setMachinePanelOpen(true)
        }}
        onSendSilhouette={() => setSilhouettePanelOpen(true)}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
        onHelp={() => setHelpOpen(true)}
      />
      <div className="main">
        <Toolbar tool={tool} onTool={setTool} />
        <CanvasView
          page={page}
          tool={tool}
          unit={unit}
          style={style}
          editorRef={editorRef}
          onUpdate={onUpdate}
          onCursor={onCursor}
          selectedCount={selectedCount}
          objectCount={objectCount}
        />
        <Inspector
          unit={unit}
          page={page}
          style={style}
          selectedCount={selectedCount}
          zoom={zoom}
          layers={layers}
          snap={snap}
          regMarks={regMarks}
          canBoolean={canBoolean}
          hasText={hasText}
          outlineFontId={outlineFontId}
          onOutlineFont={setOutlineFontId}
          onConvertOutlines={() =>
            void editorRef.current?.convertSelectedTextToOutlines(outlineFontId)
          }
          onOpenTrace={() => setTraceOpen(true)}
          laserColorMap={laserColorMap}
          onLaserColorMap={applyLaserColorMap}
          onUnit={onUnitChange}
          onPage={onPageId}
          onCustomSize={onCustomSize}
          onStyle={applyStyle}
          onSnap={(p) => editorRef.current?.setSnap(p)}
          onRegMarks={(v) => editorRef.current?.setRegistrationMarks(v)}
          onDelete={() => editorRef.current?.deleteSelected()}
          onDuplicate={() => editorRef.current?.duplicateSelected()}
          onFit={() => editorRef.current?.fitPage()}
          onZoom={(z) => editorRef.current?.setZoom(z)}
          onSelectLayer={(id, add) => editorRef.current?.selectById(id, add)}
          onToggleVisible={(id, v) =>
            editorRef.current?.setLayerVisible(id, v)
          }
          onToggleLocked={(id, l) => editorRef.current?.setLayerLocked(id, l)}
          onRenameLayer={(id, n) => editorRef.current?.renameLayer(id, n)}
          onReorderLayer={(id, d) => editorRef.current?.reorderLayer(id, d)}
          onBoolean={(op) => editorRef.current?.booleanSelected(op)}
          onOffset={(mm) => editorRef.current?.offsetSelected(mm)}
        />
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SilhouettePanel
        open={silhouettePanelOpen}
        onClose={() => setSilhouettePanelOpen(false)}
        getItems={() =>
          editorRef.current?.getExportItems({
            includeRegMarks: false,
            excludeLocked: true,
            excludeHidden: true,
          }) ?? []
        }
        page={page}
        onStatus={setStatus}
      />
      <MachinePanel
        open={machinePanelOpen}
        onClose={() => setMachinePanelOpen(false)}
        getItems={() =>
          editorRef.current?.getExportItems({
            includeRegMarks: false,
            excludeLocked: true,
            excludeHidden: true,
          }) ?? []
        }
        page={page}
        onStatus={setStatus}
        colorMap={laserColorMap}
        onColorMap={applyLaserColorMap}
      />
      <MachineExportModal
        open={machineExportOpen}
        onClose={() => setMachineExportOpen(false)}
        onExport={onMachineExport}
        textCount={exportTextCount}
        currentPageId={page.id}
      />
      <TraceModal
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        onApply={(svg, name) => editorRef.current?.importTracedSvg(svg, name)}
      />
      <RecoveryModal
        open={recoveryOpen}
        savedAtLabel={recoveryLabel}
        onRestore={onRestore}
        onDiscard={() => {
          clearRecovery()
          recoveryJson.current = null
          setRecoveryOpen(false)
        }}
      />
    </div>
  )
}

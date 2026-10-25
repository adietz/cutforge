import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { CanvasView } from './components/CanvasView'
import { HelpModal } from './components/HelpModal'
import { Inspector } from './components/Inspector'
import { RecoveryModal } from './components/RecoveryModal'
import { Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import type { CutForgeEditor } from './canvas/editor'
import { exportDxf } from './export/dxf'
import { exportSvg } from './export/svg'
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
import './App.css'

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const editorRef = useRef<CutForgeEditor | null>(null)
  const svgInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const editorReady = useRef(false)

  const [tool, setTool] = useState<Tool>('select')
  const [unit, setUnit] = useState<Unit>('in')
  const [page, setPage] = useState<PagePreset>(PAGE_PRESETS[2])
  const [style, setStyle] = useState<DocStyle>({
    strokeColor: '#e74c3c',
    strokeWidthMm: 0.2,
    fillColor: null,
    cutType: 'cut',
    hairline: false,
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
  const [hairlineExport, setHairlineExport] = useState(false)
  const [fileLabel, setFileLabel] = useState('Untitled.cutforge')
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryLabel, setRecoveryLabel] = useState('')
  const recoveryJson = useRef<string | null>(null)

  const onUpdate = useCallback(
    (info: EditorSnapshot) => {
      editorReady.current = true
      setSelectedCount(info.selectedCount)
      setZoom(info.zoom)
      setStatus(info.status)
      setCanUndo(info.canUndo)
      setCanRedo(info.canRedo)
      setLayers(info.layers)
      setSnap(info.snap)
      setFileLabel(
        (info.fileName || 'Untitled.cutforge') + (info.dirty ? ' •' : ''),
      )
      if (info.style) {
        setStyle(info.style)
        if (info.style.hairline) setHairlineExport(true)
      }
      if (info.cursor) {
        const x =
          unit === 'in' ? info.cursor.xMm / INCH_TO_MM : info.cursor.xMm
        const y =
          unit === 'in' ? info.cursor.yMm / INCH_TO_MM : info.cursor.yMm
        setCursorLabel(
          `X ${x.toFixed(unit === 'in' ? 3 : 2)}  Y ${y.toFixed(unit === 'in' ? 3 : 2)} ${unit}`,
        )
      }
    },
    [unit],
  )

  // Recovery prompt once editor exists
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

  // Autosave every 30s
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
        if (e.shiftKey) onSaveAs()
        else onSave()
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        projectInputRef.current?.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const p = presetById(id)
    setPage({ ...p })
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
        strokeWidthMm: 0.2,
        fillColor: null,
        cutType: 'cut',
      },
      snap: { ...DEFAULT_SNAP },
      objects: [],
      savedAt: new Date().toISOString(),
    })
    setPage({ ...PAGE_PRESETS[2] })
    clearRecovery()
  }

  const onSaveAs = () => {
    const ed = editorRef.current
    if (!ed) return
    const suggested =
      ed.getFileName()?.replace(/\.cutforge$/i, '') || 'Untitled'
    const name = window.prompt('Project name', suggested)
    if (!name) return
    const file = name.endsWith('.cutforge') ? name : `${name}.cutforge`
    ed.setFileName(file)
    const json = ed.toProjectJSON(name)
    download(file, json, 'application/json')
    ed.markClean()
    clearRecovery()
    setStatus(`Saved ${file}`)
  }

  const onSave = () => {
    const ed = editorRef.current
    if (!ed) return
    if (!ed.getFileName()) {
      onSaveAs()
      return
    }
    const json = ed.toProjectJSON()
    download(ed.getFileName()!, json, 'application/json')
    ed.markClean()
    clearRecovery()
    setStatus(`Saved ${ed.getFileName()}`)
  }

  const onOpenProjectFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    try {
      const doc = parseDocument(text)
      const ed = editorRef.current
      if (!ed) return
      ed.loadProject(doc)
      ed.setFileName(
        file.name.endsWith('.cutforge') ? file.name : `${file.name}.cutforge`,
      )
      setPage({ ...doc.page })
      setUnit(doc.unit)
      setStyle({ ...doc.style })
      setSnap({ ...DEFAULT_SNAP, ...doc.snap })
      clearRecovery()
    } catch (err) {
      setStatus(`Open failed: ${String(err)}`)
    }
  }

  const onImportSvg = () => svgInputRef.current?.click()

  const onSvgFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    editorRef.current?.importSvg(text)
  }

  const onExportSvg = () => {
    const ed = editorRef.current
    if (!ed) return
    const svg = exportSvg(ed.getDocItems(), ed.getPage(), unit, {
      hairline: hairlineExport || !!style.hairline,
    })
    download('cutforge.svg', svg, 'image/svg+xml')
    setStatus(
      hairlineExport || style.hairline
        ? 'Exported SVG (hairline)'
        : 'Exported SVG',
    )
  }

  const onExportDxf = () => {
    const ed = editorRef.current
    if (!ed) return
    const dxf = exportDxf(ed.getDocItems(), ed.getPage(), { chordalMm: 0.1 })
    download('cutforge.dxf', dxf, 'application/dxf')
    setStatus('Exported DXF (curves as polylines)')
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
      setStatus('Restored autosave')
    } catch (err) {
      setStatus(`Restore failed: ${String(err)}`)
      clearRecovery()
    }
  }

  const onDiscardRecovery = () => {
    clearRecovery()
    recoveryJson.current = null
    setRecoveryOpen(false)
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
        onOpen={() => projectInputRef.current?.click()}
        onSave={onSave}
        onSaveAs={onSaveAs}
        onImportSvg={onImportSvg}
        onExportSvg={onExportSvg}
        onExportDxf={onExportDxf}
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
          selectedCount={selectedCount}
        />
        <Inspector
          unit={unit}
          page={page}
          style={style}
          selectedCount={selectedCount}
          zoom={zoom}
          layers={layers}
          snap={snap}
          onUnit={onUnitChange}
          onPage={onPageId}
          onCustomSize={onCustomSize}
          onStyle={applyStyle}
          onSnap={(p) => editorRef.current?.setSnap(p)}
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
      <input
        ref={svgInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={onSvgFile}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".cutforge,application/json"
        hidden
        onChange={onOpenProjectFile}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <RecoveryModal
        open={recoveryOpen}
        savedAtLabel={recoveryLabel}
        onRestore={onRestore}
        onDiscard={onDiscardRecovery}
      />
    </div>
  )
}

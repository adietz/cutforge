import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { CanvasView } from './components/CanvasView'
import { HelpModal } from './components/HelpModal'
import { Inspector } from './components/Inspector'
import { Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import type { CutForgeEditor } from './canvas/editor'
import { exportDxf } from './export/dxf'
import { exportSvg } from './export/svg'
import { PAGE_PRESETS, presetById } from './pagePresets'
import type {
  DocStyle,
  EditorSnapshot,
  LayerInfo,
  PagePreset,
  Tool,
  Unit,
} from './types'
import { HAIRLINE_MM, INCH_TO_MM } from './types'
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
  const fileRef = useRef<HTMLInputElement>(null)

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
  const [selectedCount, setSelectedCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState('Ready')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [layers, setLayers] = useState<LayerInfo[]>([])
  const [cursorLabel, setCursorLabel] = useState('—')
  const [helpOpen, setHelpOpen] = useState(false)
  const [hairlineExport, setHairlineExport] = useState(false)

  const onUpdate = useCallback(
    (info: EditorSnapshot) => {
      setSelectedCount(info.selectedCount)
      setZoom(info.zoom)
      setStatus(info.status)
      setCanUndo(info.canUndo)
      setCanRedo(info.canRedo)
      setLayers(info.layers)
      if (info.style) {
        setStyle(info.style)
        if (info.style.hairline) setHairlineExport(true)
      }
      if (info.cursor) {
        const x =
          unit === 'in'
            ? info.cursor.xMm / INCH_TO_MM
            : info.cursor.xMm
        const y =
          unit === 'in'
            ? info.cursor.yMm / INCH_TO_MM
            : info.cursor.yMm
        setCursorLabel(
          `X ${x.toFixed(unit === 'in' ? 3 : 2)}  Y ${y.toFixed(unit === 'in' ? 3 : 2)} ${unit}`,
        )
      }
    },
    [unit],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target as HTMLElement)?.closest('input,textarea,select')) {
        setHelpOpen(true)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  const onImportSvg = () => fileRef.current?.click()

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
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
    const dxf = exportDxf(ed.getDocItems(), ed.getPage())
    download('cutforge.dxf', dxf, 'application/dxf')
    setStatus('Exported DXF')
  }

  return (
    <div className="app">
      <TopBar
        status={status}
        canUndo={canUndo}
        canRedo={canRedo}
        cursorLabel={cursorLabel}
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
          onUnit={onUnitChange}
          onPage={onPageId}
          onCustomSize={onCustomSize}
          onStyle={applyStyle}
          onDelete={() => editorRef.current?.deleteSelected()}
          onDuplicate={() => editorRef.current?.duplicateSelected()}
          onFit={() => editorRef.current?.fitPage()}
          onZoom={(z) => editorRef.current?.setZoom(z)}
          onSelectLayer={(id, add) => editorRef.current?.selectById(id, add)}
          onToggleVisible={(id, v) => editorRef.current?.setLayerVisible(id, v)}
          onToggleLocked={(id, l) => editorRef.current?.setLayerLocked(id, l)}
          onRenameLayer={(id, n) => editorRef.current?.renameLayer(id, n)}
          onReorderLayer={(id, d) => editorRef.current?.reorderLayer(id, d)}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={onFile}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

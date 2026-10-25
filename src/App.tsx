import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { CanvasView } from './components/CanvasView'
import { Inspector } from './components/Inspector'
import { Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import type { CutForgeEditor } from './canvas/editor'
import { exportDxf } from './export/dxf'
import { exportSvg } from './export/svg'
import { PAGE_PRESETS, presetById } from './pagePresets'
import type { DocStyle, PagePreset, Tool, Unit } from './types'
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
  const [page, setPage] = useState<PagePreset>(PAGE_PRESETS[2]) // Cameo 4
  const [style, setStyle] = useState<DocStyle>({
    strokeColor: '#e74c3c',
    strokeWidthMm: 0.2,
    fillColor: null,
    cutType: 'cut',
  })
  const [selectedCount, setSelectedCount] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState('Ready')

  const onUpdate = useCallback(
    (info: {
      selectedCount: number
      style: DocStyle | null
      zoom: number
      status: string
    }) => {
      setSelectedCount(info.selectedCount)
      setZoom(info.zoom)
      setStatus(info.status)
      if (info.style) setStyle(info.style)
    },
    [],
  )

  const applyStyle = (partial: Partial<DocStyle>) => {
    setStyle((s) => ({ ...s, ...partial }))
    editorRef.current?.setStyle(partial)
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
    const svg = exportSvg(ed.getProject(), ed.getPage(), unit)
    download('cutforge.svg', svg, 'image/svg+xml')
    setStatus('Exported SVG')
  }

  const onExportDxf = () => {
    const ed = editorRef.current
    if (!ed) return
    const dxf = exportDxf(ed.getProject(), ed.getPage())
    download('cutforge.dxf', dxf, 'application/dxf')
    setStatus('Exported DXF')
  }

  return (
    <div className="app">
      <TopBar
        status={status}
        onImportSvg={onImportSvg}
        onExportSvg={onExportSvg}
        onExportDxf={onExportDxf}
      />
      <div className="main">
        <Toolbar tool={tool} onTool={setTool} />
        <CanvasView
          page={page}
          tool={tool}
          style={style}
          editorRef={editorRef}
          onUpdate={onUpdate}
        />
        <Inspector
          unit={unit}
          page={page}
          style={style}
          selectedCount={selectedCount}
          zoom={zoom}
          onUnit={setUnit}
          onPage={onPageId}
          onCustomSize={onCustomSize}
          onStyle={applyStyle}
          onDelete={() => editorRef.current?.deleteSelected()}
          onDuplicate={() => editorRef.current?.duplicateSelected()}
          onFit={() => editorRef.current?.fitPage()}
          onZoom={(z) => editorRef.current?.setZoom(z)}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={onFile}
      />
    </div>
  )
}

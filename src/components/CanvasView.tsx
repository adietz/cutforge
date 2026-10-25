
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { CutForgeEditor } from '../canvas/editor'
import type { DocStyle, EditorSnapshot, PagePreset, Tool, Unit } from '../types'
import { INCH_TO_MM, PX_PER_MM } from '../types'
import { AlignBar } from './AlignBar'
import { ContextMenu } from './ContextMenu'
import type { AlignMode, BooleanOp, ContextMenuAction } from '../types'

const RULER = 22

const CURSOR: Record<Tool, string> = {
  select: 'default',
  shape: 'crosshair',
  rect: 'crosshair',
  ellipse: 'crosshair',
  line: 'crosshair',
  polygon: 'crosshair',
  freehand: 'crosshair',
  text: 'text',
}

export function CanvasView({
  page,
  tool,
  unit,
  style: _style,
  editorRef,
  onUpdate,
  onCursor,
  selectedCount,
  objectCount,
  canBoolean,
  canUngroup,
  canJoin,
  joinTolMm,
  setJoinTolMm,
}: {
  page: PagePreset
  tool: Tool
  unit: Unit
  style: DocStyle
  editorRef: MutableRefObject<CutForgeEditor | null>
  onUpdate: (info: EditorSnapshot) => void
  onCursor: (c: { xMm: number; yMm: number } | null) => void
  selectedCount: number
  objectCount: number
  canBoolean: boolean
  canUngroup: boolean
  canJoin: boolean
  joinTolMm: number
  setJoinTolMm: (mm: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const hRulerRef = useRef<HTMLCanvasElement>(null)
  const vRulerRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    items: ContextMenuAction[]
    point: { x: number; y: number }
  } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    // CSS fills .canvas-wrap; we set viewSize from RO and re-assert 100% after
    // Paper's setViewSize (which otherwise stamps inline px and can collapse).
    canvas.style.width = '100%'
    canvas.style.height = '100%'

    const editor = new CutForgeEditor(canvas, page)
    editorRef.current = editor
    let rulersQueued = false
    const queueRulers = () => {
      if (rulersQueued) return
      rulersQueued = true
      requestAnimationFrame(() => {
        rulersQueued = false
        if (!wrapRef.current) return
        drawRulers(
          editor,
          unit,
          hRulerRef.current,
          vRulerRef.current,
          wrapRef.current,
        )
      })
    }
    const off = editor.on((info) => {
      onUpdate(info)
      queueRulers()
    })
    const offCursor = editor.onCursor((c) => {
      onCursor(c)
    })
    setReady(true)

    let roTimer = 0
    const ro = new ResizeObserver(() => {
      // Debounce: tool-switch React reflows were firing RO with a 0-size frame
      // then a real size — applying 0 blanked Paper's view.
      window.clearTimeout(roTimer)
      roTimer = window.setTimeout(() => {
        const { clientWidth, clientHeight } = wrap
        if (clientWidth < 32 || clientHeight < 32) return
        editor.resizeToCanvas(clientWidth, clientHeight)
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        queueRulers()
      }, 16)
    })
    ro.observe(wrap)
    // Immediate first size (after layout)
    requestAnimationFrame(() => {
      const { clientWidth, clientHeight } = wrap
      editor.resizeToCanvas(clientWidth, clientHeight)
      editor.ensureViewHealthy()
      queueRulers()
    })

    return () => {
      window.clearTimeout(roTimer)
      off()
      offCursor()
      ro.disconnect()
      editor.destroy()
      editorRef.current = null
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    // Skip if editor already on this tool (setTool no-ops, but avoid effect churn)
    if (ed.getTool() === tool) {
      ed.ensureViewHealthy()
      return
    }
    ed.setTool(tool)
  }, [tool, editorRef])

  useEffect(() => {
    editorRef.current?.setPage(page)
  }, [page, editorRef])

  useEffect(() => {
    editorRef.current?.setUnit(unit)
    const ed = editorRef.current
    const wrap = wrapRef.current
    if (ed && wrap)
      drawRulers(ed, unit, hRulerRef.current, vRulerRef.current, wrap)
  }, [unit, editorRef])

  return (
    <div className="canvas-stage">
      <AlignBar
        selectedCount={selectedCount}
        objectCount={objectCount}
        canBoolean={canBoolean}
        canUngroup={canUngroup}
        canJoin={canJoin}
        joinTolMm={joinTolMm}
        onAlign={(m: AlignMode) => editorRef.current?.align(m)}
        onNest={(mode, opts) => editorRef.current?.nestItems(mode, opts)}
        onJoin={() => editorRef.current?.joinSelectedOpenPaths()}
        onBoolean={(op: BooleanOp) => editorRef.current?.booleanSelected(op)}
        onGroup={() => editorRef.current?.groupSelected()}
        onUngroup={() => editorRef.current?.ungroupSelected()}
        onJoinTol={(mm) => {
          editorRef.current?.setJoinToleranceMm(mm)
          setJoinTolMm(mm)
        }}
      />
      <div className="ruler-corner" />
      <canvas ref={hRulerRef} className="ruler ruler-h" height={RULER} />
      <canvas ref={vRulerRef} className="ruler ruler-v" width={RULER} />
      <div
        className="canvas-wrap"
        ref={wrapRef}
        style={{ cursor: CURSOR[tool] }}
        onContextMenu={(e) => {
          e.preventDefault()
          const ed = editorRef.current
          const canvas = canvasRef.current
          if (!ed || !canvas) return
          const pt = ed.clientToProject(e)
          const items = ed.getContextMenuActions(pt)
          if (!items?.length) {
            setCtxMenu(null)
            return
          }
          setCtxMenu({
            x: e.clientX,
            y: e.clientY,
            items,
            point: { x: pt.x, y: pt.y },
          })
        }}
      >
        <canvas ref={canvasRef} className="design-canvas" />
        {ready && objectCount === 0 && (
          <div className="empty-state" aria-hidden>
            <strong>Empty document</strong>
            <span>
              Pick a tool (R rect · E ellipse · L line) or Import SVG.
              Hold Shift for 15° angles.
            </span>
          </div>
        )}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
          onAction={(id) => {
            const ed = editorRef.current
            if (!ed) return
            ed.runContextMenuAction(id, ctxMenu.point)
          }}
        />
      )}
    </div>
  )
}

function drawRulers(
  editor: CutForgeEditor,
  unit: Unit,
  hCanvas: HTMLCanvasElement | null,
  vCanvas: HTMLCanvasElement | null,
  wrap: HTMLDivElement,
) {
  const view = editor.getView()
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  if (!w || !h) return

  const pxPerUnit = unit === 'in' ? PX_PER_MM * INCH_TO_MM : PX_PER_MM
  const origin = editor.viewToProject(0, 0)

  if (hCanvas) {
    hCanvas.width = w * devicePixelRatio
    hCanvas.height = RULER * devicePixelRatio
    hCanvas.style.width = `${w}px`
    hCanvas.style.height = `${RULER}px`
    const ctx = hCanvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.fillStyle = '#14171e'
      ctx.fillRect(0, 0, w, RULER)
      ctx.strokeStyle = '#3d4454'
      ctx.beginPath()
      ctx.moveTo(0, RULER - 0.5)
      ctx.lineTo(w, RULER - 0.5)
      ctx.stroke()
      ctx.fillStyle = '#8b93a7'
      ctx.font = '10px Inter, system-ui, sans-serif'
      const step = niceStep(50 / (view.zoom * pxPerUnit))
      const startUnit = Math.floor(origin.x / pxPerUnit / step) * step
      const endUnit = origin.x / pxPerUnit + w / (view.zoom * pxPerUnit)
      for (let u = startUnit; u < endUnit + step; u += step) {
        const x = (u * pxPerUnit - origin.x) * view.zoom
        if (x < -20 || x > w + 20) continue
        ctx.strokeStyle = '#5a6275'
        ctx.beginPath()
        ctx.moveTo(x + 0.5, RULER)
        ctx.lineTo(x + 0.5, RULER - 8)
        ctx.stroke()
        ctx.fillText(formatTick(u), x + 2, 10)
      }
    }
  }

  if (vCanvas) {
    vCanvas.width = RULER * devicePixelRatio
    vCanvas.height = h * devicePixelRatio
    vCanvas.style.width = `${RULER}px`
    vCanvas.style.height = `${h}px`
    const ctx = vCanvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.fillStyle = '#14171e'
      ctx.fillRect(0, 0, RULER, h)
      ctx.strokeStyle = '#3d4454'
      ctx.beginPath()
      ctx.moveTo(RULER - 0.5, 0)
      ctx.lineTo(RULER - 0.5, h)
      ctx.stroke()
      ctx.fillStyle = '#8b93a7'
      ctx.font = '10px Inter, system-ui, sans-serif'
      const step = niceStep(50 / (view.zoom * pxPerUnit))
      const startUnit = Math.floor(origin.y / pxPerUnit / step) * step
      const endUnit = origin.y / pxPerUnit + h / (view.zoom * pxPerUnit)
      for (let u = startUnit; u < endUnit + step; u += step) {
        const y = (u * pxPerUnit - origin.y) * view.zoom
        if (y < -20 || y > h + 20) continue
        ctx.strokeStyle = '#5a6275'
        ctx.beginPath()
        ctx.moveTo(RULER, y + 0.5)
        ctx.lineTo(RULER - 8, y + 0.5)
        ctx.stroke()
        ctx.save()
        ctx.translate(9, y + 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(formatTick(u), 0, 0)
        ctx.restore()
      }
    }
  }
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))))
  const n = raw / pow
  let step: number
  if (n < 1.5) step = 1
  else if (n < 3.5) step = 2
  else if (n < 7.5) step = 5
  else step = 10
  return step * pow
}

function formatTick(u: number): string {
  return Math.abs(u) >= 10 ? u.toFixed(0) : u.toFixed(2)
}

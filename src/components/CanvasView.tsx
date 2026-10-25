import { useEffect, useRef, type MutableRefObject } from 'react'
import { CutForgeEditor } from '../canvas/editor'
import type { DocStyle, PagePreset, Tool } from '../types'

export function CanvasView({
  page,
  tool,
  style: _style,
  editorRef,
  onUpdate,
}: {
  page: PagePreset
  tool: Tool
  style: DocStyle
  editorRef: MutableRefObject<CutForgeEditor | null>
  onUpdate: (info: {
    selectedCount: number
    style: DocStyle | null
    zoom: number
    status: string
  }) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const editor = new CutForgeEditor(canvas, page)
    editorRef.current = editor
    const off = editor.on(onUpdate)

    const ro = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = wrap
      canvas.width = clientWidth * devicePixelRatio
      canvas.height = clientHeight * devicePixelRatio
      canvas.style.width = `${clientWidth}px`
      canvas.style.height = `${clientHeight}px`
      editor.resizeToCanvas(clientWidth, clientHeight)
    })
    ro.observe(wrap)

    return () => {
      off()
      ro.disconnect()
      editor.destroy()
      editorRef.current = null
    }
    // intentionally mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    editorRef.current?.setTool(tool)
  }, [tool, editorRef])

  useEffect(() => {
    editorRef.current?.setPage(page)
  }, [page, editorRef])

  // style applied via explicit calls from App when inspector changes

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="design-canvas" />
    </div>
  )
}

import paper from 'paper'
import { applyCutTypeVisual, styleFromItem } from './styles'
import type { CutType, DocStyle, PagePreset, Tool } from '../types'
import { PX_PER_MM } from '../types'

export type EditorListener = (info: {
  selectedCount: number
  style: DocStyle | null
  zoom: number
  status: string
}) => void

function isGuide(item: paper.Item | null | undefined): boolean {
  if (!item) return true
  return !!(item.data?.isGuide || item.data?.isHandle || item.data?.isPage)
}

export class CutForgeEditor {
  private pageRect: paper.Path | null = null
  private gridGroup: paper.Group | null = null
  private handleGroup: paper.Group | null = null
  private tool: Tool = 'select'
  private style: DocStyle = {
    strokeColor: '#e74c3c',
    strokeWidthMm: 0.2,
    fillColor: null,
    cutType: 'cut',
  }
  private page: PagePreset
  private paperTool: paper.Tool
  private currentPath: paper.Path | null = null
  private polygonPoints: paper.Point[] = []
  private dragStart: paper.Point | null = null
  private selected: paper.Item[] = []
  private mode: 'none' | 'move' | 'resize' | 'rotate' | 'draw' | 'pan' = 'none'
  private transformOrigin: paper.Point | null = null
  private startRotation = 0
  private resizeCorner: string | null = null
  private startBounds: paper.Rectangle | null = null
  private origScalings: { item: paper.Item; scaling: paper.Point; position: paper.Point }[] = []
  private spacePan = false
  private panStart: paper.Point | null = null
  private viewCenterStart: paper.Point | null = null
  private listeners: EditorListener[] = []
  private status = 'Ready — V select · R rect · E ellipse · L line · P polygon · F freehand · T text'
  private preview: paper.Path | null = null
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, page: PagePreset) {
    this.canvas = canvas
    this.page = page
    paper.setup(canvas)
    this.paperTool = new paper.Tool()
    this.wire()
    this.rebuildPage()
    this.fitPage()
    this.notify()

    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('dblclick', this.onDblClick)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  on(fn: EditorListener) {
    this.listeners.push(fn)
    fn(this.snapshot())
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn)
    }
  }

  destroy() {
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('dblclick', this.onDblClick)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    paper.project?.clear()
  }

  getProject() {
    return paper.project
  }

  getPage() {
    return this.page
  }

  getStyle() {
    return this.style
  }

  setTool(tool: Tool) {
    this.tool = tool
    this.clearPreview()
    if (tool !== 'polygon') this.polygonPoints = []
    if (tool !== 'select') this.deselectAll()
    this.status =
      tool === 'select'
        ? 'Select — drag move · corners resize · purple = rotate · Del delete · ⌘D duplicate'
        : tool === 'polygon'
          ? 'Polygon — click points, Enter or double-click to close'
          : `Drawing: ${tool}`
    this.notify()
  }

  setStyle(partial: Partial<DocStyle>) {
    this.style = { ...this.style, ...partial }
    for (const item of this.selected) {
      const ct = (partial.cutType ?? (item.data.cutType as CutType) ?? 'cut') as CutType
      applyCutTypeVisual(item, ct, this.style)
      this.applyStrokeWidth(item)
    }
    this.notify()
  }

  setPage(page: PagePreset) {
    this.page = page
    this.rebuildPage()
    this.fitPage()
    this.notify()
  }

  setZoom(zoom: number) {
    paper.view.zoom = Math.min(8, Math.max(0.1, zoom))
    this.drawHandles()
    this.notify()
  }

  fitPage() {
    const pw = this.page.widthMm * PX_PER_MM
    const ph = this.page.heightMm * PX_PER_MM
    const pad = 48
    const zx = (paper.view.viewSize.width - pad * 2) / pw
    const zy = (paper.view.viewSize.height - pad * 2) / ph
    paper.view.zoom = Math.min(zx, zy, 2)
    paper.view.center = new paper.Point(pw / 2, ph / 2)
    this.drawHandles()
    this.notify()
  }

  deleteSelected() {
    for (const item of [...this.selected]) item.remove()
    this.deselectAll()
    this.status = 'Deleted'
    this.notify()
  }

  duplicateSelected() {
    const copies = this.selected.map((item) => {
      const c = item.clone()
      c.position = c.position.add(new paper.Point(12, 12))
      return c
    })
    this.selectItems(copies)
    this.status = 'Duplicated'
  }

  importSvg(svgText: string) {
    try {
      const item = paper.project.importSVG(svgText, {
        expandShapes: true,
        insert: true,
      }) as paper.Item
      if (!item) {
        this.status = 'SVG import failed'
        this.notify()
        return
      }
      this.tagImported(item)
      const pw = this.page.widthMm * PX_PER_MM
      const ph = this.page.heightMm * PX_PER_MM
      if (item.bounds.width > pw * 2 || item.bounds.height > ph * 2) {
        const s = Math.min(pw / item.bounds.width, ph / item.bounds.height) * 0.8
        item.scale(s)
      }
      item.position = new paper.Point(pw / 2, ph / 2)
      this.selectItems([item])
      this.status = 'SVG imported'
    } catch (err) {
      this.status = `Import error: ${String(err)}`
      this.notify()
    }
  }

  resizeToCanvas(width: number, height: number) {
    if (width < 10 || height < 10) return
    paper.view.viewSize = new paper.Size(width, height)
  }

  private tagImported(item: paper.Item) {
    applyCutTypeVisual(item, 'cut', this.style)
    this.applyStrokeWidth(item)
    if (item.children) {
      for (const c of item.children) this.tagImported(c)
    }
  }

  private snapshot() {
    return {
      selectedCount: this.selected.length,
      style: this.selected[0] ? styleFromItem(this.selected[0]) : { ...this.style },
      zoom: paper.view.zoom,
      status: this.status,
    }
  }

  private notify() {
    const snap = this.snapshot()
    for (const fn of this.listeners) fn(snap)
  }

  private rebuildPage() {
    this.pageRect?.remove()
    this.gridGroup?.remove()
    const w = this.page.widthMm * PX_PER_MM
    const h = this.page.heightMm * PX_PER_MM

    this.pageRect = new paper.Path.Rectangle(new paper.Rectangle(0, 0, w, h))
    this.pageRect.fillColor = new paper.Color('#1a1d24')
    this.pageRect.strokeColor = new paper.Color('#7a849c')
    this.pageRect.strokeWidth = 1
    this.pageRect.data.isPage = true
    this.pageRect.sendToBack()

    this.gridGroup = new paper.Group()
    this.gridGroup.data.isGuide = true
    const step = 10 * PX_PER_MM
    const major = 50 * PX_PER_MM
    for (let x = 0; x <= w + 0.1; x += step) {
      const line = new paper.Path.Line([x, 0], [x, h])
      line.strokeColor = new paper.Color(
        Math.round(x) % Math.round(major) === 0
          ? 'rgba(255,255,255,0.09)'
          : 'rgba(255,255,255,0.03)',
      )
      line.strokeWidth = 1
      line.data.isGuide = true
      this.gridGroup.addChild(line)
    }
    for (let y = 0; y <= h + 0.1; y += step) {
      const line = new paper.Path.Line([0, y], [w, y])
      line.strokeColor = new paper.Color(
        Math.round(y) % Math.round(major) === 0
          ? 'rgba(255,255,255,0.09)'
          : 'rgba(255,255,255,0.03)',
      )
      line.strokeWidth = 1
      line.data.isGuide = true
      this.gridGroup.addChild(line)
    }
    this.gridGroup.insertAbove(this.pageRect)
  }

  private applyStrokeWidth(item: paper.Item) {
    const sw = (this.style.strokeWidthMm || 0.2) * PX_PER_MM
    if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
      item.strokeWidth = Math.max(sw, 0.5)
      item.data.strokeWidthMm = this.style.strokeWidthMm
      item.data.strokeColor = this.style.strokeColor
      item.data.fillColor = this.style.fillColor
      item.data.cutType = this.style.cutType
    }
  }

  private styleNew(item: paper.Item) {
    applyCutTypeVisual(item, this.style.cutType, this.style)
    this.applyStrokeWidth(item)
  }

  private deselectAll() {
    this.selected = []
    this.clearHandles()
  }

  private selectItems(items: paper.Item[]) {
    this.selected = items.filter((i) => !isGuide(i))
    this.drawHandles()
    this.notify()
  }

  private clearHandles() {
    this.handleGroup?.remove()
    this.handleGroup = null
  }

  private clearPreview() {
    this.preview?.remove()
    this.preview = null
    this.currentPath = null
  }

  private selectedBounds(): paper.Rectangle | null {
    if (!this.selected.length) return null
    let b = this.selected[0].bounds.clone()
    for (let i = 1; i < this.selected.length; i++) b = b.unite(this.selected[i].bounds)
    return b
  }

  private drawHandles() {
    this.clearHandles()
    if (!this.selected.length) return
    const bounds = this.selectedBounds()
    if (!bounds) return
    const z = paper.view.zoom
    this.handleGroup = new paper.Group()
    this.handleGroup.data.isHandle = true

    const box = new paper.Path.Rectangle(bounds)
    box.strokeColor = new paper.Color('#5b9cff')
    box.strokeWidth = 1 / z
    box.fillColor = null
    box.data.isHandle = true
    this.handleGroup.addChild(box)

    const size = 8 / z
    const corners: [string, paper.Point][] = [
      ['nw', bounds.topLeft],
      ['ne', bounds.topRight],
      ['sw', bounds.bottomLeft],
      ['se', bounds.bottomRight],
    ]
    for (const [name, pt] of corners) {
      const h = new paper.Path.Rectangle(
        new paper.Rectangle(pt.x - size / 2, pt.y - size / 2, size, size),
      )
      h.fillColor = new paper.Color('#5b9cff')
      h.strokeColor = new paper.Color('#fff')
      h.strokeWidth = 1 / z
      h.data.isHandle = true
      h.data.handle = name
      this.handleGroup.addChild(h)
    }

    const rotPos = new paper.Point(bounds.center.x, bounds.top - 22 / z)
    const stem = new paper.Path.Line(new paper.Point(bounds.center.x, bounds.top), rotPos)
    stem.strokeColor = new paper.Color('#9b59b6')
    stem.strokeWidth = 1 / z
    stem.data.isHandle = true
    this.handleGroup.addChild(stem)

    const rot = new paper.Path.Circle(rotPos, 5 / z)
    rot.fillColor = new paper.Color('#9b59b6')
    rot.strokeColor = new paper.Color('#fff')
    rot.strokeWidth = 1 / z
    rot.data.isHandle = true
    rot.data.handle = 'rotate'
    this.handleGroup.addChild(rot)
  }

  private wire() {
    this.paperTool.onMouseDown = (e: paper.ToolEvent) => {
      if (this.spacePan) {
        this.mode = 'pan'
        this.panStart = e.point.clone()
        this.viewCenterStart = paper.view.center.clone()
        return
      }

      if (this.tool === 'select') {
        this.onSelectDown(e)
      } else {
        this.onDrawDown(e)
      }
    }

    this.paperTool.onMouseDrag = (e: paper.ToolEvent) => {
      if (this.mode === 'pan' && this.panStart && this.viewCenterStart) {
        const delta = this.panStart.subtract(e.point)
        paper.view.center = this.viewCenterStart.add(delta)
        return
      }
      if (this.tool === 'select') this.onSelectDrag(e)
      else this.onDrawDrag(e)
    }

    this.paperTool.onMouseUp = (e: paper.ToolEvent) => {
      if (this.mode === 'pan') {
        this.mode = 'none'
        this.panStart = null
        return
      }
      if (this.tool === 'select') this.onSelectUp()
      else this.onDrawUp(e)
    }
  }

  private onSelectDown(e: paper.ToolEvent) {
    const hit = paper.project.hitTest(e.point, {
      fill: true,
      stroke: true,
      tolerance: 8 / paper.view.zoom,
    })

    if (hit?.item?.data?.handle) {
      const h = String(hit.item.data.handle)
      if (h === 'rotate') {
        this.mode = 'rotate'
        this.transformOrigin = this.selectedBounds()?.center ?? e.point
        this.startRotation = Math.atan2(
          e.point.y - this.transformOrigin.y,
          e.point.x - this.transformOrigin.x,
        )
      } else {
        this.mode = 'resize'
        this.resizeCorner = h
        this.startBounds = this.selectedBounds()
        this.dragStart = e.point.clone()
        this.origScalings = this.selected.map((item) => ({
          item,
          scaling: item.scaling.clone(),
          position: item.position.clone(),
        }))
      }
      return
    }

    let item = hit?.item ?? null
    while (item && isGuide(item)) item = item.parent

    // climb to top-level drawable under activeLayer
    while (item && item.parent && item.parent !== paper.project.activeLayer) {
      if (isGuide(item.parent)) break
      item = item.parent
    }

    if (item && !isGuide(item)) {
      if (e.modifiers.shift) {
        if (this.selected.includes(item))
          this.selectItems(this.selected.filter((i) => i !== item))
        else this.selectItems([...this.selected, item])
      } else if (!this.selected.includes(item)) {
        this.selectItems([item])
      }
      this.mode = 'move'
      this.dragStart = e.point.clone()
    } else {
      this.deselectAll()
      this.notify()
    }
  }

  private onSelectDrag(e: paper.ToolEvent) {
    if (this.mode === 'move' && this.dragStart) {
      const delta = e.point.subtract(this.dragStart)
      for (const item of this.selected) item.position = item.position.add(delta)
      this.dragStart = e.point.clone()
      this.drawHandles()
    } else if (this.mode === 'rotate' && this.transformOrigin) {
      const ang = Math.atan2(
        e.point.y - this.transformOrigin.y,
        e.point.x - this.transformOrigin.x,
      )
      const deg = ((ang - this.startRotation) * 180) / Math.PI
      for (const item of this.selected) item.rotate(deg, this.transformOrigin)
      this.startRotation = ang
      this.drawHandles()
    } else if (this.mode === 'resize' && this.startBounds && this.resizeCorner) {
      this.applyResize(e.point)
      this.drawHandles()
    }
  }

  private applyResize(point: paper.Point) {
    if (!this.startBounds || !this.resizeCorner) return
    const b = this.startBounds
    let pivot: paper.Point
    let startCorner: paper.Point
    switch (this.resizeCorner) {
      case 'nw':
        pivot = b.bottomRight
        startCorner = b.topLeft
        break
      case 'ne':
        pivot = b.bottomLeft
        startCorner = b.topRight
        break
      case 'sw':
        pivot = b.topRight
        startCorner = b.bottomLeft
        break
      default:
        pivot = b.topLeft
        startCorner = b.bottomRight
    }
    const startDx = startCorner.x - pivot.x
    const startDy = startCorner.y - pivot.y
    const nowDx = point.x - pivot.x
    const nowDy = point.y - pivot.y
    const sx = startDx === 0 ? 1 : nowDx / startDx
    const sy = startDy === 0 ? 1 : nowDy / startDy
    const s = Math.max(0.05, Math.min(20, (Math.abs(sx) + Math.abs(sy)) / 2))
    // Reset to original then scale once (non-compounding)
    for (const o of this.origScalings) {
      o.item.scaling = o.scaling
      o.item.position = o.position
      o.item.scale(s, pivot)
    }
  }

  private onSelectUp() {
    this.mode = 'none'
    this.dragStart = null
    this.origScalings = []
    this.notify()
  }

  private onDrawDown(e: paper.ToolEvent) {
    this.dragStart = e.point.clone()
    this.mode = 'draw'

    if (this.tool === 'freehand') {
      this.currentPath = new paper.Path({ segments: [e.point] })
      this.styleNew(this.currentPath)
    } else if (this.tool === 'polygon') {
      this.polygonPoints.push(e.point.clone())
      this.preview?.remove()
      this.preview = new paper.Path(this.polygonPoints.map((p) => p.clone()))
      this.styleNew(this.preview)
      this.status = `Polygon: ${this.polygonPoints.length} pts — Enter/dblclick finish`
      this.notify()
    } else if (this.tool === 'text') {
      const content = window.prompt('Text content:', 'CutForge') ?? ''
      if (!content) {
        this.setTool('select')
        return
      }
      const t = new paper.PointText({
        point: e.point,
        content,
        fontSize: 18,
        fontFamily: 'Inter, system-ui, sans-serif',
      })
      this.styleNew(t)
      this.selectItems([t])
      this.setTool('select')
    }
  }

  private onDrawDrag(e: paper.ToolEvent) {
    if (!this.dragStart) return
    if (this.tool === 'freehand' && this.currentPath) {
      this.currentPath.add(e.point)
      return
    }
    if (this.tool === 'polygon' || this.tool === 'text') return

    this.preview?.remove()
    if (this.tool === 'rect') {
      this.preview = new paper.Path.Rectangle(new paper.Rectangle(this.dragStart, e.point))
    } else if (this.tool === 'ellipse') {
      this.preview = new paper.Path.Ellipse(new paper.Rectangle(this.dragStart, e.point))
    } else if (this.tool === 'line') {
      this.preview = new paper.Path.Line(this.dragStart, e.point)
    }
    if (this.preview) this.styleNew(this.preview)
  }

  private onDrawUp(_e: paper.ToolEvent) {
    if (this.tool === 'freehand' && this.currentPath) {
      if (this.currentPath.segments.length > 2) this.currentPath.simplify(1.5)
      if (this.currentPath.segments.length >= 2) {
        this.selectItems([this.currentPath])
      } else {
        this.currentPath.remove()
      }
      this.currentPath = null
      this.setTool('select')
    } else if (
      this.preview &&
      (this.tool === 'rect' || this.tool === 'ellipse' || this.tool === 'line')
    ) {
      if (this.preview.bounds.width < 1 && this.preview.bounds.height < 1) {
        this.preview.remove()
      } else {
        this.selectItems([this.preview])
      }
      this.preview = null
      this.setTool('select')
    }
    this.mode = 'none'
    this.dragStart = null
  }

  private finishPolygon() {
    if (this.polygonPoints.length < 3) {
      this.status = 'Need at least 3 points'
      this.notify()
      return
    }
    this.preview?.remove()
    const path = new paper.Path(this.polygonPoints.map((p) => p.clone()))
    path.closed = true
    this.styleNew(path)
    this.polygonPoints = []
    this.preview = null
    this.selectItems([path])
    this.setTool('select')
  }

  private onDblClick = () => {
    if (this.tool === 'polygon') this.finishPolygon()
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const oldZoom = paper.view.zoom
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const next = Math.min(8, Math.max(0.1, oldZoom * factor))
    const mouse = new paper.Point(e.offsetX, e.offsetY)
    const before = paper.view.viewToProject(mouse)
    paper.view.zoom = next
    const after = paper.view.viewToProject(mouse)
    paper.view.center = paper.view.center.add(before.subtract(after))
    this.drawHandles()
    this.notify()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

    if (e.code === 'Space' && !e.repeat) {
      this.spacePan = true
      e.preventDefault()
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelected()
      e.preventDefault()
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      this.duplicateSelected()
      e.preventDefault()
    }
    if (e.key === 'Enter' && this.tool === 'polygon') this.finishPolygon()
    if (e.key === 'Escape') {
      this.polygonPoints = []
      this.clearPreview()
      this.setTool('select')
    }
    const map: Record<string, Tool> = {
      v: 'select',
      r: 'rect',
      e: 'ellipse',
      l: 'line',
      p: 'polygon',
      f: 'freehand',
      t: 'text',
    }
    const k = e.key.toLowerCase()
    if (map[k] && !e.metaKey && !e.ctrlKey && !e.altKey) this.setTool(map[k])
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.spacePan = false
  }
}

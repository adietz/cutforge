import paper from 'paper'
import { applyCutTypeVisual, styleFromItem } from './styles'
import { HistoryStack } from './history'
import { snapDelta, snapPoint } from './snap'
import { booleanOperate, offsetPath } from './booleans'
import { constrainPointToAngle, snapAngleDeg } from './angles'
import { buildRegistrationMarks } from './regMarks'
import { convertPointTextToOutlines } from './textOutlines'
import { parseDocument, serializeDocument } from '../project/cutforgeDoc'
import type { CutForgeDocument } from '../project/cutforgeDoc'
import {
  DEFAULT_LASER_COLOR_MAP,
  type LaserColorMapEntry,
} from '../machine/colorMap'
import type {
  AlignMode,
  BooleanOp,
  CursorInfo,
  CutType,
  DocStyle,
  EditorSnapshot,
  LayerInfo,
  PagePreset,
  SnapSettings,
  Tool,
  Unit,
} from '../types'
import { DEFAULT_SNAP, HAIRLINE_MM, PX_PER_MM } from '../types'
import { cutTypeFromColor } from '../import/colorCutTypes'

export type EditorListener = (info: EditorSnapshot) => void

function isGuide(item: paper.Item | null | undefined): boolean {
  if (!item) return true
  return !!(item.data?.isGuide || item.data?.isHandle || item.data?.isPage)
}

let idSeq = 1
function nextId() {
  return `cf-${Date.now().toString(36)}-${idSeq++}`
}

function colorToCss(c: paper.Color | string | null | undefined): string | null {
  if (c == null) return null
  if (typeof c === 'string') return c === 'none' ? null : c
  try {
    if ((c as paper.Color).alpha === 0) return null
    return (c as paper.Color).toCSS(true)
  } catch {
    return null
  }
}

function ensureMeta(item: paper.Item, fallbackName?: string) {
  if (!item.data.cfId) item.data.cfId = nextId()
  if (!item.data.name) {
    item.data.name =
      fallbackName ||
      (item.className === 'PointText'
        ? `Text ${(item as paper.PointText).content?.slice(0, 16) || ''}`.trim()
        : item.className === 'Path'
          ? 'Path'
          : item.className || 'Object')
  }
  if (item.data.locked == null) item.data.locked = false
}

export class CutForgeEditor {
  private guideLayer!: paper.Layer
  private docLayer!: paper.Layer
  private overlayLayer!: paper.Layer
  private pageRect: paper.Path | null = null
  private gridGroup: paper.Group | null = null
  private handleGroup: paper.Group | null = null
  private marquee: paper.Path | null = null
  private tool: Tool = 'select'
  private style: DocStyle = {
    strokeColor: '#e74c3c',
    strokeWidthMm: HAIRLINE_MM,
    fillColor: null,
    cutType: 'cut',
    hairline: true,
  }
  private laserColorMap: LaserColorMapEntry[] = DEFAULT_LASER_COLOR_MAP.map(
    (e) => ({ ...e }),
  )
  private page: PagePreset
  private paperTool: paper.Tool
  private currentPath: paper.Path | null = null
  private polygonPoints: paper.Point[] = []
  private dragStart: paper.Point | null = null
  private selected: paper.Item[] = []
  private mode:
    | 'none'
    | 'move'
    | 'resize'
    | 'rotate'
    | 'draw'
    | 'pan'
    | 'marquee' = 'none'
  private transformOrigin: paper.Point | null = null
  private startRotation = 0
  private resizeCorner: string | null = null
  private startBounds: paper.Rectangle | null = null
  private origScalings: {
    item: paper.Item
    scaling: paper.Point
    position: paper.Point
  }[] = []
  private spacePan = false
  private panStart: paper.Point | null = null
  private viewCenterStart: paper.Point | null = null
  private listeners: EditorListener[] = []
  private status =
    'Ready — V select · drag empty = marquee · ⌘Z undo · ? help'
  private preview: paper.Path | null = null
  private canvas: HTMLCanvasElement
  private history = new HistoryStack()
  private gestureBefore: string | null = null
  private cursor: CursorInfo | null = null
  private nameCounters: Record<string, number> = {}
  private snapSettings: SnapSettings = { ...DEFAULT_SNAP }
  private smartGuideGroup: paper.Group | null = null
  private clipboard: string[] = []
  private unit: Unit = 'in'
  private fileName: string | null = null
  private dirty = false
  private moveBoundsStart: paper.Rectangle | null = null
  private movePointerStart: paper.Point | null = null
  private moveOrigPositions: { item: paper.Item; position: paper.Point }[] = []
  private didTransform = false
  private cursorListeners: ((c: CursorInfo | null) => void)[] = []
  private regMarksEnabled = false
  private regMarksGroup: paper.Group | null = null
  private printAndCutMode = false
  private rotateBaseDeg = 0

  constructor(canvas: HTMLCanvasElement, page: PagePreset) {
    this.canvas = canvas
    this.page = page
    paper.setup(canvas)
    paper.project.clear()
    this.guideLayer = new paper.Layer()
    this.guideLayer.name = 'guides'
    this.docLayer = new paper.Layer()
    this.docLayer.name = 'document'
    this.overlayLayer = new paper.Layer()
    this.overlayLayer.name = 'overlay'
    this.docLayer.activate()

    this.paperTool = new paper.Tool()
    this.wire()
    this.rebuildPage()
    this.fitPage()
    this.notify()

    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('dblclick', this.onDblClick)
    canvas.addEventListener('mousemove', this.onMouseMove)
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

  /** Lightweight cursor updates — does not rebuild layers in React. */
  onCursor(fn: (c: CursorInfo | null) => void) {
    this.cursorListeners.push(fn)
    fn(this.cursor)
    return () => {
      this.cursorListeners = this.cursorListeners.filter((f) => f !== fn)
    }
  }

  destroy() {
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('dblclick', this.onDblClick)
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
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

  getDocItems(): paper.Item[] {
    return [...this.docLayer.children]
  }

  getObjectCount() {
    return this.docLayer.children.length
  }

  /** True if selection has ≥2 closed paths suitable for boolean ops. */
  canBoolean(): boolean {
    const items = this.selected.filter((i) => !i.data.locked && i.visible)
    if (items.length < 2) return false
    return items.every(
      (i) =>
        (i instanceof paper.Path && i.closed) ||
        i instanceof paper.CompoundPath,
    )
  }

  /** Document objects plus registration marks when enabled (for export). */
  getExportItems(opts?: {
    includeRegMarks?: boolean
    excludeLocked?: boolean
    excludeHidden?: boolean
  }): paper.Item[] {
    const includeReg =
      opts?.includeRegMarks !== undefined
        ? opts.includeRegMarks
        : this.regMarksEnabled
    const excludeLocked = opts?.excludeLocked !== false
    const excludeHidden = opts?.excludeHidden !== false
    const items: paper.Item[] = []
    for (const item of this.docLayer.children) {
      if (excludeHidden && !item.visible) continue
      if (excludeLocked && item.data?.locked) continue
      items.push(item)
    }
    if (includeReg && this.regMarksGroup) {
      items.push(this.regMarksGroup)
    }
    return items
  }

  countTextObjects(opts?: { excludeLocked?: boolean; excludeHidden?: boolean }): number {
    const excludeLocked = opts?.excludeLocked !== false
    const excludeHidden = opts?.excludeHidden !== false
    let n = 0
    const walk = (item: paper.Item) => {
      if (excludeHidden && !item.visible) return
      if (excludeLocked && item.data?.locked) return
      if (item.className === 'PointText') n++
      if (item.children) for (const c of item.children) walk(c)
    }
    for (const item of this.docLayer.children) walk(item)
    return n
  }

  async convertAllTextToOutlines(fontId = 'inter'): Promise<number> {
    const texts: paper.PointText[] = []
    const walk = (item: paper.Item) => {
      if (!item.visible || item.data?.locked) return
      if (item.className === 'PointText') texts.push(item as paper.PointText)
      if (item.children) for (const c of item.children) walk(c)
    }
    for (const item of this.docLayer.children) walk(item)
    if (!texts.length) return 0
    this.selectItems(texts)
    await this.convertSelectedTextToOutlines(fontId)
    return texts.length
  }

  hasRegistrationMarks() {
    return this.regMarksEnabled
  }

  setRegistrationMarks(enabled: boolean) {
    this.regMarksEnabled = enabled
    this.rebuildRegMarks()
    this.dirty = true
    this.status = enabled
      ? 'Registration marks on (Cameo print-and-cut)'
      : 'Registration marks off'
    this.notify()
  }

  isPrintAndCutMode() {
    return this.printAndCutMode
  }

  setPrintAndCutMode(enabled: boolean) {
    this.printAndCutMode = enabled
    if (enabled && !this.regMarksEnabled) {
      this.regMarksEnabled = true
      this.rebuildRegMarks()
    }
    this.dirty = true
    this.status = enabled
      ? 'Print & Cut mode — use Print type for artwork, Cut/Score for knife'
      : 'Print & Cut mode off'
    this.notify()
  }

  private rebuildRegMarks() {
    this.regMarksGroup?.remove()
    this.regMarksGroup = null
    if (!this.regMarksEnabled) return
    this.guideLayer.activate()
    this.regMarksGroup = buildRegistrationMarks(
      this.page.widthMm,
      this.page.heightMm,
    )
    this.guideLayer.addChild(this.regMarksGroup)
    this.docLayer.activate()
  }

  getView() {
    return {
      zoom: paper.view.zoom,
      center: { x: paper.view.center.x, y: paper.view.center.y },
      viewSize: {
        width: paper.view.viewSize.width,
        height: paper.view.viewSize.height,
      },
      bounds: paper.view.bounds,
    }
  }

  viewToProject(x: number, y: number) {
    return paper.view.viewToProject(new paper.Point(x, y))
  }

  setUnit(unit: Unit) {
    this.unit = unit
    this.notify()
  }

  getUnit(): Unit {
    return this.unit
  }

  getSnap(): SnapSettings {
    return { ...this.snapSettings }
  }

  setSnap(partial: Partial<SnapSettings>) {
    this.snapSettings = { ...this.snapSettings, ...partial }
    this.dirty = true
    this.notify()
  }

  getFileName() {
    return this.fileName
  }

  setFileName(name: string | null) {
    this.fileName = name
    this.notify()
  }

  isDirty() {
    return this.dirty
  }

  markClean() {
    this.dirty = false
    this.notify()
  }

  selectAll() {
    this.selectItems(
      this.docLayer.children.filter((c) => c.visible && !c.data.locked),
    )
    this.status = `Selected ${this.selected.length}`
  }

  copySelected() {
    if (!this.selected.length) return
    this.clipboard = this.selected.map(
      (i) => i.exportJSON({ asString: true }) as string,
    )
    try {
      void navigator.clipboard.writeText(
        JSON.stringify({ cutforgeClipboard: 1, objects: this.clipboard }),
      )
    } catch {
      /* optional */
    }
    this.status = `Copied ${this.clipboard.length}`
    this.notify()
  }

  async pasteClipboard() {
    let objects = this.clipboard
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text) as {
        cutforgeClipboard?: number
        objects?: string[]
      }
      if (parsed?.cutforgeClipboard && parsed.objects?.length) {
        objects = parsed.objects
      }
    } catch {
      /* use internal clipboard */
    }
    if (!objects.length) {
      this.status = 'Clipboard empty'
      this.notify()
      return
    }
    const before = this.snapshotDoc()
    this.docLayer.activate()
    const created: paper.Item[] = []
    for (const s of objects) {
      const item = paper.project.importJSON(s) as paper.Item | null
      if (!item) continue
      if (item.layer !== this.docLayer) this.docLayer.addChild(item)
      item.position = item.position.add(new paper.Point(12, 12))
      item.data.cfId = nextId()
      ensureMeta(item)
      created.push(item)
    }
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems(created)
    this.status = `Pasted ${created.length}`
  }

  booleanSelected(op: BooleanOp) {
    const items = this.selected.filter((i) => !i.data.locked && i.visible)
    if (items.length < 2) {
      this.status = 'Select 2+ closed paths'
      this.notify()
      return
    }
    const before = this.snapshotDoc()
    const result = booleanOperate(items, op)
    if (!result) {
      this.status = 'Boolean failed (need closed paths)'
      this.notify()
      return
    }
    this.docLayer.activate()
    this.docLayer.addChild(result)
    // copy style from first
    const src = items[0]
    result.data.cutType = src.data.cutType
    result.data.strokeWidthMm = src.data.strokeWidthMm
    result.data.strokeColor = src.data.strokeColor
    result.data.fillColor = src.data.fillColor
    result.data.hairline = src.data.hairline
    applyCutTypeVisual(result, (src.data.cutType as CutType) || 'cut', styleFromItem(src))
    if (result instanceof paper.Path || result instanceof paper.CompoundPath) {
      result.strokeWidth = Math.max(
        ((src.data.strokeWidthMm as number) || 0.2) * PX_PER_MM,
        0.5,
      )
    }
    ensureMeta(result, `Boolean ${op}`)
    for (const i of items) i.remove()
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems([result])
    this.status = `Boolean ${op}`
  }

  hasSelectedText(): boolean {
    return this.selected.some(
      (i) => i.className === 'PointText' && !i.data.locked && i.visible,
    )
  }

  async convertSelectedTextToOutlines(fontId = 'inter') {
    const texts = this.selected.filter(
      (i) =>
        i.className === 'PointText' && !i.data.locked && i.visible,
    ) as paper.PointText[]
    if (!texts.length) {
      this.status = 'Select text to convert to outlines'
      this.notify()
      return
    }
    const before = this.snapshotDoc()
    this.docLayer.activate()
    const created: paper.Item[] = []
    try {
      for (const t of texts) {
        const font =
          (t.data.fontId as string) || fontId
        const outlined = await convertPointTextToOutlines(t, font)
        if (!outlined) continue
        this.docLayer.addChild(outlined)
        const style = styleFromItem(t)
        applyCutTypeVisual(
          outlined,
          (t.data.cutType as CutType) || 'cut',
          style,
        )
        if (
          outlined instanceof paper.Path ||
          outlined instanceof paper.CompoundPath
        ) {
          const mm = (t.data.strokeWidthMm as number) || style.strokeWidthMm
          outlined.strokeWidth = Math.max(mm * PX_PER_MM, style.hairline ? 0.75 : 0.5)
          // Engrave keeps fill; cut/score typically stroke-only
          if ((t.data.cutType || 'cut') !== 'engrave') {
            outlined.fillColor = null
          }
        }
        ensureMeta(outlined, outlined.data.name || 'Outlines')
        t.remove()
        created.push(outlined)
      }
    } catch (err) {
      this.status = `Outline failed: ${String(err)}`
      this.notify()
      return
    }
    if (!created.length) {
      this.status = 'No outlines produced'
      this.notify()
      return
    }
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems(created)
    this.status = `Converted ${created.length} text object(s) to outlines`
    this.notify()
  }

  /** Import traced SVG (from image tracer) scaled to fit ~80% of page width. */
  importTracedSvg(svgText: string, sourceName = 'Trace') {
    const before = this.snapshotDoc()
    try {
      this.docLayer.activate()
      const item = paper.project.importSVG(svgText, {
        expandShapes: true,
        insert: false,
      }) as paper.Item
      if (!item) {
        this.status = 'Trace import failed'
        this.notify()
        return
      }
      this.docLayer.addChild(item)
      this.tagImported(item)
      ensureMeta(item, sourceName)
      const pw = this.page.widthMm * PX_PER_MM
      const ph = this.page.heightMm * PX_PER_MM
      const maxW = pw * 0.85
      const maxH = ph * 0.85
      if (item.bounds.width > maxW || item.bounds.height > maxH) {
        const s =
          Math.min(maxW / item.bounds.width, maxH / item.bounds.height) * 0.95
        item.scale(s)
      }
      item.position = new paper.Point(pw / 2, ph / 2)
      // Prefer cut stroke styling on traced paths
      const walk = (it: paper.Item) => {
        if (it instanceof paper.Path || it instanceof paper.CompoundPath) {
          it.data.cutType = it.data.cutType || 'cut'
          applyCutTypeVisual(it, 'cut', this.style)
          this.applyStrokeWidth(it)
          // Drop fills for cut-friendly line art unless engrave
          if (this.style.cutType !== 'engrave') it.fillColor = null
        }
        if (it.children) for (const c of it.children) walk(c)
      }
      walk(item)
      this.history.pushBefore(before)
      this.dirty = true
      this.selectItems([item])
      this.status = `Traced image placed (${sourceName})`
      this.notify()
    } catch (err) {
      this.status = `Trace place failed: ${String(err)}`
      this.notify()
    }
  }

  offsetSelected(offsetMm: number) {
    const items = this.selected.filter((i) => !i.data.locked && i.visible)
    if (!items.length) return
    const before = this.snapshotDoc()
    const offsetPx = offsetMm * PX_PER_MM
    const created: paper.Item[] = []
    this.docLayer.activate()
    for (const item of items) {
      const out = offsetPath(item, offsetPx)
      if (!out) continue
      this.docLayer.addChild(out)
      out.data.cutType = item.data.cutType
      out.data.strokeWidthMm = item.data.strokeWidthMm
      out.data.strokeColor = item.data.strokeColor
      out.data.fillColor = item.data.fillColor
      applyCutTypeVisual(out, (item.data.cutType as CutType) || 'cut', styleFromItem(item))
      if (out instanceof paper.Path || out instanceof paper.CompoundPath) {
        out.strokeWidth = Math.max(
          ((item.data.strokeWidthMm as number) || 0.2) * PX_PER_MM,
          0.5,
        )
      }
      ensureMeta(out, `${item.data.name || 'Path'} offset`)
      created.push(out)
    }
    if (!created.length) {
      this.status =
        'Offset failed — need closed paths (true parallel kerf via Clipper)'
      this.notify()
      return
    }
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems(created)
    this.status = `Kerf offset ${offsetMm >= 0 ? '+' : ''}${offsetMm.toFixed(3)} mm (parallel)`
  }

  toProjectJSON(name = 'Untitled'): string {
    return serializeDocument({
      name: this.fileName?.replace(/\.cutforge$/i, '') || name,
      unit: this.unit,
      page: this.page,
      style: this.style,
      snap: this.snapSettings,
      objects: this.getDocItems(),
      regMarks: this.regMarksEnabled,
      printAndCut: this.printAndCutMode,
      laserColorMap: this.laserColorMap,
    })
  }

  loadProject(doc: CutForgeDocument | string) {
    const parsed = typeof doc === 'string' ? parseDocument(doc) : doc
    this.deselectAll()
    this.clearHandles()
    this.clearMarquee()
    this.clearSmartGuides()
    this.page = { ...parsed.page }
    this.unit = parsed.unit
    this.style = { ...parsed.style }
    this.laserColorMap = (parsed.laserColorMap || DEFAULT_LASER_COLOR_MAP).map(
      (e) => ({ ...e }),
    )
    this.snapSettings = { ...DEFAULT_SNAP, ...parsed.snap }
    this.regMarksEnabled = !!parsed.regMarks
    this.printAndCutMode = !!parsed.printAndCut
    this.fileName = parsed.name.endsWith('.cutforge')
      ? parsed.name
      : `${parsed.name}.cutforge`
    this.rebuildPage()
    this.rebuildRegMarks()
    this.docLayer.removeChildren()
    this.docLayer.activate()
    for (const s of parsed.objects) {
      const item = paper.project.importJSON(s) as paper.Item | null
      if (!item) continue
      if (item.layer !== this.docLayer) this.docLayer.addChild(item)
      ensureMeta(item)
    }
    this.history.clear()
    this.dirty = false
    this.fitPage()
    this.status = `Opened ${this.fileName}`
    this.notify()
    return parsed
  }

  private snapTol() {
    return 8 / paper.view.zoom
  }

  private applySnap(
    pt: paper.Point,
    excludeIds: string[] = [],
    opts?: { skipEdges?: boolean },
  ): paper.Point {
    const settings = opts?.skipEdges
      ? { ...this.snapSettings, edges: false, smartGuides: false }
      : this.snapSettings
    const r = snapPoint(
      pt,
      settings,
      this.docLayer.children,
      excludeIds,
      this.snapTol(),
    )
    if (!opts?.skipEdges) this.drawSmartGuides(r.guideX, r.guideY)
    else this.clearSmartGuides()
    return r.point
  }

  private clearSmartGuides() {
    this.smartGuideGroup?.remove()
    this.smartGuideGroup = null
  }

  private drawSmartGuides(gx: number | null, gy: number | null) {
    this.clearSmartGuides()
    if (gx == null && gy == null) return
    this.overlayLayer.activate()
    this.smartGuideGroup = new paper.Group()
    this.smartGuideGroup.data.isHandle = true
    const w = this.page.widthMm * PX_PER_MM
    const h = this.page.heightMm * PX_PER_MM
    const z = paper.view.zoom
    if (gx != null) {
      const line = new paper.Path.Line([gx, -h], [gx, h * 2])
      line.strokeColor = new paper.Color('#ff4fd8')
      line.strokeWidth = 1 / z
      line.dashArray = [4 / z, 4 / z]
      line.data.isHandle = true
      this.smartGuideGroup.addChild(line)
    }
    if (gy != null) {
      const line = new paper.Path.Line([-w, gy], [w * 2, gy])
      line.strokeColor = new paper.Color('#ff4fd8')
      line.strokeWidth = 1 / z
      line.dashArray = [4 / z, 4 / z]
      line.data.isHandle = true
      this.smartGuideGroup.addChild(line)
    }
    this.docLayer.activate()
  }

  setTool(tool: Tool) {
    this.tool = tool
    this.clearPreview()
    this.clearMarquee()
    if (tool !== 'polygon') this.polygonPoints = []
    if (tool !== 'select') this.deselectAll()
    this.status = this.toolTip(tool)
    this.notify()
  }

  private toolTip(tool: Tool): string {
    const tips: Record<Tool, string> = {
      select:
        'Select — marquee · Shift+click · Del · Esc clears · Shift+rotate = 15°',
      rect: 'Rectangle — drag to draw · grid/edge snap on',
      ellipse: 'Ellipse — drag to draw',
      line: 'Line — drag · hold Shift for 15° angles',
      polygon:
        'Polygon — click points · Shift = 15° · Enter/dblclick close · Esc cancel',
      freehand: 'Freehand — drag path · Esc cancel',
      text: 'Text — click to place',
    }
    return tips[tool]
  }

  getLaserColorMap(): LaserColorMapEntry[] {
    return this.laserColorMap.map((e) => ({ ...e }))
  }

  setLaserColorMap(map: LaserColorMapEntry[]) {
    this.laserColorMap = map.map((e) => ({ ...e }))
    this.dirty = true
    this.status = `Laser color map: ${this.laserColorMap.length} swatch(es)`
    this.notify()
  }

  setStyle(partial: Partial<DocStyle>) {
    const before =
      this.selected.length > 0 ? this.snapshotDoc() : null
    this.style = { ...this.style, ...partial }
    if (partial.hairline) {
      this.style.strokeWidthMm = HAIRLINE_MM
    }
    for (const item of this.selected) {
      if (item.data.locked) continue
      const ct = (partial.cutType ??
        (item.data.cutType as CutType) ??
        'cut') as CutType
      applyCutTypeVisual(item, ct, this.style)
      this.applyStrokeWidth(item)
    }
    if (before && this.selected.length) {
      this.history.pushBefore(before)
      this.dirty = true
    }
    this.notify()
  }

  setPage(page: PagePreset) {
    const prev = this.page
    const idChanged = prev.id !== page.id
    const sizeChanged =
      Math.abs(prev.widthMm - page.widthMm) > 0.05 ||
      Math.abs(prev.heightMm - page.heightMm) > 0.05
    this.page = page
    this.rebuildPage()
    this.rebuildRegMarks()
    // Only auto-fit when switching presets, not every custom W/H keystroke
    if (idChanged && sizeChanged) this.fitPage()
    else this.drawHandles()
    this.dirty = true
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

  undo() {
    const cur = this.snapshotDoc()
    const prev = this.history.undo(cur)
    if (!prev) {
      this.status = 'Nothing to undo'
      this.notify()
      return
    }
    this.restoreDoc(prev)
    this.status = 'Undo'
    this.notify()
  }

  redo() {
    const cur = this.snapshotDoc()
    const next = this.history.redo(cur)
    if (!next) {
      this.status = 'Nothing to redo'
      this.notify()
      return
    }
    this.restoreDoc(next)
    this.status = 'Redo'
    this.notify()
  }

  deleteSelected() {
    const items = this.selected.filter((i) => !i.data.locked)
    if (!items.length) return
    const before = this.snapshotDoc()
    for (const item of items) item.remove()
    this.history.pushBefore(before)
    this.dirty = true
    this.deselectAll()
    this.status = 'Deleted'
    this.notify()
  }

  duplicateSelected() {
    const items = this.selected.filter((i) => !i.data.locked)
    if (!items.length) return
    const before = this.snapshotDoc()
    this.docLayer.activate()
    const copies = items.map((item) => {
      const c = item.clone()
      c.position = c.position.add(new paper.Point(12, 12))
      c.data.cfId = nextId()
      c.data.name = `${item.data.name || 'Object'} copy`
      this.docLayer.addChild(c)
      return c
    })
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems(copies)
    this.status = 'Duplicated'
  }

  importSvg(svgText: string) {
    const before = this.snapshotDoc()
    try {
      this.docLayer.activate()
      const item = paper.project.importSVG(svgText, {
        expandShapes: true,
        insert: false,
      }) as paper.Item
      if (!item) {
        this.status = 'SVG import failed'
        this.notify()
        return
      }
      this.docLayer.addChild(item)
      this.tagImported(item)
      ensureMeta(item, 'Imported SVG')
      const pw = this.page.widthMm * PX_PER_MM
      const ph = this.page.heightMm * PX_PER_MM
      if (item.bounds.width > pw * 2 || item.bounds.height > ph * 2) {
        const s =
          Math.min(pw / item.bounds.width, ph / item.bounds.height) * 0.8
        item.scale(s)
      }
      item.position = new paper.Point(pw / 2, ph / 2)
      this.history.pushBefore(before)
      this.dirty = true
      this.selectItems([item])
      this.status = 'Vector imported — cut types from colors; check Layers'
      this.notify()
    } catch (err) {
      this.status = `Import error: ${String(err)}`
      this.notify()
    }
  }

  align(mode: AlignMode) {
    const items = this.selected.filter((i) => !i.data.locked && i.visible)
    if (items.length < 2 && !mode.startsWith('distribute')) return
    if (mode.startsWith('distribute') && items.length < 3) {
      this.status = 'Distribute needs 3+ items'
      this.notify()
      return
    }
    const before = this.snapshotDoc()
    const groupBounds = this.boundsOf(items)
    if (!groupBounds) return

    if (mode === 'left') {
      for (const i of items) i.position.x += groupBounds.left - i.bounds.left
    } else if (mode === 'center') {
      for (const i of items)
        i.position.x += groupBounds.center.x - i.bounds.center.x
    } else if (mode === 'right') {
      for (const i of items)
        i.position.x += groupBounds.right - i.bounds.right
    } else if (mode === 'top') {
      for (const i of items) i.position.y += groupBounds.top - i.bounds.top
    } else if (mode === 'middle') {
      for (const i of items)
        i.position.y += groupBounds.center.y - i.bounds.center.y
    } else if (mode === 'bottom') {
      for (const i of items)
        i.position.y += groupBounds.bottom - i.bounds.bottom
    } else if (mode === 'distributeH') {
      const sorted = [...items].sort(
        (a, b) => a.bounds.center.x - b.bounds.center.x,
      )
      const first = sorted[0].bounds.center.x
      const last = sorted[sorted.length - 1].bounds.center.x
      const step = (last - first) / (sorted.length - 1)
      sorted.forEach((item, idx) => {
        const target = first + step * idx
        item.position.x += target - item.bounds.center.x
      })
    } else if (mode === 'distributeV') {
      const sorted = [...items].sort(
        (a, b) => a.bounds.center.y - b.bounds.center.y,
      )
      const first = sorted[0].bounds.center.y
      const last = sorted[sorted.length - 1].bounds.center.y
      const step = (last - first) / (sorted.length - 1)
      sorted.forEach((item, idx) => {
        const target = first + step * idx
        item.position.y += target - item.bounds.center.y
      })
    }

    this.history.pushBefore(before)
    this.dirty = true
    this.drawHandles()
    this.status = `Aligned: ${mode}`
    this.notify()
  }

  selectById(id: string, additive = false) {
    const item = this.docLayer.children.find((c) => c.data.cfId === id)
    if (!item || item.data.locked) return
    if (additive) {
      if (this.selected.includes(item))
        this.selectItems(this.selected.filter((i) => i !== item))
      else this.selectItems([...this.selected, item])
    } else {
      this.selectItems([item])
    }
  }

  setLayerVisible(id: string, visible: boolean) {
    const item = this.docLayer.children.find((c) => c.data.cfId === id)
    if (!item) return
    const before = this.snapshotDoc()
    item.visible = visible
    if (!visible) this.selected = this.selected.filter((s) => s !== item)
    this.history.pushBefore(before)
    this.drawHandles()
    this.notify()
  }

  setLayerLocked(id: string, locked: boolean) {
    const item = this.docLayer.children.find((c) => c.data.cfId === id)
    if (!item) return
    const before = this.snapshotDoc()
    item.data.locked = locked
    if (locked) this.selected = this.selected.filter((s) => s !== item)
    this.history.pushBefore(before)
    this.drawHandles()
    this.notify()
  }

  renameLayer(id: string, name: string) {
    const item = this.docLayer.children.find((c) => c.data.cfId === id)
    if (!item) return
    const before = this.snapshotDoc()
    item.data.name = name.trim() || item.data.name
    this.history.pushBefore(before)
    this.notify()
  }

  reorderLayer(id: string, direction: 'up' | 'down' | 'top' | 'bottom') {
    const item = this.docLayer.children.find((c) => c.data.cfId === id)
    if (!item) return
    const before = this.snapshotDoc()
    const kids = this.docLayer.children
    const idx = kids.indexOf(item)
    if (direction === 'top') item.bringToFront()
    else if (direction === 'bottom') item.sendToBack()
    else if (direction === 'up' && idx < kids.length - 1) item.insertAbove(kids[idx + 1])
    else if (direction === 'down' && idx > 0) item.insertBelow(kids[idx - 1])
    this.history.pushBefore(before)
    this.notify()
  }

  moveLayer(id: string, toIndexFromTop: number) {
    const kids = [...this.docLayer.children]
    const item = kids.find((c) => c.data.cfId === id)
    if (!item) return
    const before = this.snapshotDoc()
    // visual list is reversed (top = last child)
    const targetIndex = kids.length - 1 - toIndexFromTop
    item.remove()
    this.docLayer.insertChild(Math.max(0, Math.min(targetIndex, this.docLayer.children.length)), item)
    this.history.pushBefore(before)
    this.notify()
  }

  resizeToCanvas(width: number, height: number) {
    if (width < 10 || height < 10) return
    paper.view.viewSize = new paper.Size(width, height)
    this.notify()
  }

  // --- internals ---

  private snapshotDoc(): string {
    return JSON.stringify(
      this.docLayer.children.map((c) => c.exportJSON({ asString: true })),
    )
  }

  private restoreDoc(raw: string) {
    this.deselectAll()
    this.clearHandles()
    this.clearMarquee()
    this.docLayer.removeChildren()
    this.docLayer.activate()
    try {
      const list = JSON.parse(raw) as string[]
      for (const s of list) {
        const item = paper.project.importJSON(s) as paper.Item | null
        if (!item) continue
        if (item.layer !== this.docLayer) this.docLayer.addChild(item)
        ensureMeta(item)
      }
    } catch {
      this.status = 'Undo/redo restore failed'
    }
    this.overlayLayer.bringToFront()
    this.docLayer.activate()
  }

  getCursor() {
    return this.cursor
  }

  private tagImported(item: paper.Item) {
    const strokeStr = colorToCss(item.strokeColor)
    const fillStr = colorToCss(item.fillColor)
    const fromData = item.data?.cutType as CutType | undefined
    const cutType: CutType =
      fromData || cutTypeFromColor(strokeStr, fillStr)
    const style: Partial<DocStyle> = {
      cutType,
      strokeColor: strokeStr || this.style.strokeColor,
      fillColor:
        fillStr && fillStr !== 'none'
          ? fillStr
          : cutType === 'engrave' || cutType === 'print'
            ? (this.style.fillColor ?? null)
            : null,
    }
    item.data.cutType = cutType
    if (strokeStr) item.data.strokeColor = strokeStr
    if (fillStr && fillStr !== 'none') item.data.fillColor = fillStr
    applyCutTypeVisual(item, cutType, style)
    if (strokeStr) {
      try {
        const path = item as paper.Path
        if (path.strokeColor !== undefined) {
          path.strokeColor = strokeStr as unknown as paper.Color
        }
      } catch {
        /* keep defaults */
      }
    }
    this.applyStrokeWidth(item)
    ensureMeta(item)
    if (item.children) {
      for (const c of item.children) this.tagImported(c)
    }
  }

  private autoName(kind: string) {
    this.nameCounters[kind] = (this.nameCounters[kind] || 0) + 1
    return `${kind} ${this.nameCounters[kind]}`
  }

  private snapshot(): EditorSnapshot {
    return {
      selectedCount: this.selected.length,
      style: this.selected[0]
        ? styleFromItem(this.selected[0])
        : { ...this.style },
      zoom: paper.view.zoom,
      status: this.status,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      layers: this.listLayers(),
      cursor: this.cursor,
      selectedIds: this.selected.map((s) => String(s.data.cfId)),
      snap: { ...this.snapSettings },
      fileName: this.fileName,
      dirty: this.dirty,
      regMarks: this.regMarksEnabled,
      tool: this.tool,
      objectCount: this.docLayer.children.length,
      canBoolean: this.canBoolean(),
      hasText: this.hasSelectedText(),
      printAndCut: this.printAndCutMode,
    }
  }

  private listLayers(): LayerInfo[] {
    // Top of list = front of stack
    return [...this.docLayer.children]
      .reverse()
      .map((item) => {
        ensureMeta(item)
        return {
          id: String(item.data.cfId),
          name: String(item.data.name),
          visible: item.visible,
          locked: !!item.data.locked,
          selected: this.selected.includes(item),
          className: item.className,
        }
      })
  }

  private notify() {
    const snap = this.snapshot()
    for (const fn of this.listeners) fn(snap)
  }

  private rebuildPage() {
    this.guideLayer.activate()
    this.pageRect?.remove()
    this.gridGroup?.remove()
    const w = this.page.widthMm * PX_PER_MM
    const h = this.page.heightMm * PX_PER_MM

    this.pageRect = new paper.Path.Rectangle(new paper.Rectangle(0, 0, w, h))
    this.pageRect.fillColor = new paper.Color('#1a1d24')
    this.pageRect.strokeColor = new paper.Color('#7a849c')
    this.pageRect.strokeWidth = 1
    this.pageRect.data.isPage = true
    this.guideLayer.addChild(this.pageRect)

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
    this.guideLayer.addChild(this.gridGroup)
    this.docLayer.activate()
  }

  private applyStrokeWidth(item: paper.Item) {
    const mm = this.style.hairline
      ? HAIRLINE_MM
      : this.style.strokeWidthMm || 0.2
    const sw = mm * PX_PER_MM
    if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
      // keep visible on screen even for hairline
      item.strokeWidth = Math.max(sw, this.style.hairline ? 0.75 : 0.5)
      item.data.strokeWidthMm = mm
      item.data.hairline = !!this.style.hairline
      item.data.strokeColor = this.style.strokeColor
      item.data.fillColor = this.style.fillColor
      item.data.cutType = this.style.cutType
    }
  }

  private styleNew(item: paper.Item) {
    applyCutTypeVisual(item, this.style.cutType, this.style)
    this.applyStrokeWidth(item)
    ensureMeta(item, this.autoName(this.toolLabel()))
  }

  private toolLabel() {
    const map: Record<Tool, string> = {
      select: 'Object',
      rect: 'Rectangle',
      ellipse: 'Ellipse',
      line: 'Line',
      polygon: 'Polygon',
      freehand: 'Freehand',
      text: 'Text',
    }
    return map[this.tool]
  }

  private deselectAll() {
    this.selected = []
    this.clearHandles()
  }

  private selectItems(items: paper.Item[]) {
    this.selected = items.filter(
      (i) => !isGuide(i) && i.visible && !i.data.locked,
    )
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

  private clearMarquee() {
    this.marquee?.remove()
    this.marquee = null
  }

  private boundsOf(items: paper.Item[]): paper.Rectangle | null {
    if (!items.length) return null
    let b = items[0].bounds.clone()
    for (let i = 1; i < items.length; i++) b = b.unite(items[i].bounds)
    return b
  }

  private selectedBounds(): paper.Rectangle | null {
    return this.boundsOf(this.selected)
  }

  private drawHandles() {
    this.clearHandles()
    if (!this.selected.length) return
    const bounds = this.selectedBounds()
    if (!bounds) return
    const z = paper.view.zoom
    this.overlayLayer.activate()
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
    const stem = new paper.Path.Line(
      new paper.Point(bounds.center.x, bounds.top),
      rotPos,
    )
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
    this.docLayer.activate()
  }

  private hitDrawable(point: paper.Point): paper.Item | null {
    const hit = this.docLayer.hitTest(point, {
      fill: true,
      stroke: true,
      tolerance: 8 / paper.view.zoom,
    })
    let item = hit?.item ?? null
    while (item && item.parent && item.parent !== this.docLayer) {
      item = item.parent
    }
    if (!item || isGuide(item) || !item.visible || item.data.locked) return null
    return item
  }

  private wire() {
    this.paperTool.onMouseDown = (e: paper.ToolEvent) => {
      if (this.spacePan) {
        this.mode = 'pan'
        this.panStart = e.point.clone()
        this.viewCenterStart = paper.view.center.clone()
        return
      }
      if (this.tool === 'select') this.onSelectDown(e)
      else this.onDrawDown(e)
    }

    this.paperTool.onMouseDrag = (e: paper.ToolEvent) => {
      if (this.mode === 'pan' && this.panStart && this.viewCenterStart) {
        const delta = this.panStart.subtract(e.point)
        paper.view.center = this.viewCenterStart.add(delta)
        this.notify()
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
    // handles live on overlay
    const handleHit = this.overlayLayer.hitTest(e.point, {
      fill: true,
      stroke: true,
      tolerance: 8 / paper.view.zoom,
    })
    if (handleHit?.item?.data?.handle) {
      this.gestureBefore = this.snapshotDoc()
      const h = String(handleHit.item.data.handle)
      if (h === 'rotate') {
        this.mode = 'rotate'
        this.didTransform = false
        this.transformOrigin = this.selectedBounds()?.center ?? e.point
        this.startRotation = Math.atan2(
          e.point.y - this.transformOrigin.y,
          e.point.x - this.transformOrigin.x,
        )
        this.rotateBaseDeg = (this.startRotation * 180) / Math.PI
      } else {
        this.mode = 'resize'
        this.didTransform = false
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

    const item = this.hitDrawable(e.point)
    if (item) {
      if (item.data.locked) {
        this.status = 'Locked — unlock in Layers to edit'
        this.notify()
        return
      }
      if (e.modifiers.shift) {
        if (this.selected.includes(item))
          this.selectItems(this.selected.filter((i) => i !== item))
        else this.selectItems([...this.selected, item])
        return // Shift+click toggles only; no drag
      }
      if (!this.selected.includes(item)) {
        this.selectItems([item])
      }
      this.gestureBefore = this.snapshotDoc()
      this.mode = 'move'
      this.didTransform = false
      this.movePointerStart = e.point.clone()
      this.dragStart = e.point.clone()
      this.moveBoundsStart = this.selectedBounds()
      this.moveOrigPositions = this.selected.map((it) => ({
        item: it,
        position: it.position.clone(),
      }))
    } else {
      // start marquee
      if (!e.modifiers.shift) this.deselectAll()
      this.mode = 'marquee'
      this.dragStart = e.point.clone()
      this.overlayLayer.activate()
      this.clearMarquee()
      this.marquee = new paper.Path.Rectangle(
        new paper.Rectangle(e.point, e.point),
      )
      this.marquee.strokeColor = new paper.Color('#5b9cff')
      this.marquee.fillColor = new paper.Color('rgba(91,156,255,0.12)')
      this.marquee.strokeWidth = 1 / paper.view.zoom
      this.marquee.dashArray = [4 / paper.view.zoom, 3 / paper.view.zoom]
      this.marquee.data.isHandle = true
      this.docLayer.activate()
      this.notify()
    }
  }

  private onSelectDrag(e: paper.ToolEvent) {
    if (this.mode === 'marquee' && this.dragStart) {
      this.overlayLayer.activate()
      this.marquee?.remove()
      this.marquee = new paper.Path.Rectangle(
        new paper.Rectangle(this.dragStart, e.point),
      )
      this.marquee.strokeColor = new paper.Color('#5b9cff')
      this.marquee.fillColor = new paper.Color('rgba(91,156,255,0.12)')
      this.marquee.strokeWidth = 1 / paper.view.zoom
      this.marquee.dashArray = [4 / paper.view.zoom, 3 / paper.view.zoom]
      this.marquee.data.isHandle = true
      this.docLayer.activate()
      return
    }
    if (this.mode === 'move' && this.movePointerStart) {
      let delta = e.point.subtract(this.movePointerStart)
      if (this.moveBoundsStart) {
        const exclude = this.selected.map((s) => String(s.data.cfId))
        const sd = snapDelta(
          delta,
          this.moveBoundsStart,
          this.snapSettings,
          this.docLayer.children,
          exclude,
          this.snapTol(),
        )
        delta = sd.point
        this.drawSmartGuides(sd.guideX, sd.guideY)
      }
      for (const o of this.moveOrigPositions) {
        if (!o.item.data.locked) o.item.position = o.position.add(delta)
      }
      if (delta.length > 0.5) this.didTransform = true
      this.drawHandles()
    } else if (this.mode === 'rotate' && this.transformOrigin) {
      let ang = Math.atan2(
        e.point.y - this.transformOrigin.y,
        e.point.x - this.transformOrigin.x,
      )
      let absDeg = (ang * 180) / Math.PI
      if (e.modifiers.shift) {
        absDeg = snapAngleDeg(absDeg)
        ang = (absDeg * Math.PI) / 180
      }
      const deg = absDeg - this.rotateBaseDeg
      for (const item of this.selected) {
        if (!item.data.locked) item.rotate(deg, this.transformOrigin!)
      }
      this.rotateBaseDeg = absDeg
      this.startRotation = ang
      this.didTransform = true
      this.drawHandles()
    } else if (this.mode === 'resize' && this.startBounds && this.resizeCorner) {
      const exclude = this.selected.map((s) => String(s.data.cfId))
      const pt = this.applySnap(e.point, exclude)
      this.applyResize(pt)
      this.didTransform = true
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
    for (const o of this.origScalings) {
      if (o.item.data.locked) continue
      o.item.scaling = o.scaling
      o.item.position = o.position
      o.item.scale(s, pivot)
    }
  }

  private onSelectUp() {
    if (this.mode === 'marquee' && this.marquee && this.dragStart) {
      const rect = this.marquee.bounds
      const hits = this.docLayer.children.filter(
        (c) =>
          c.visible &&
          !c.data.locked &&
          !isGuide(c) &&
          c.bounds.intersects(rect),
      )
      if (hits.length) {
        const merged = [...new Set([...this.selected, ...hits])]
        this.selectItems(merged)
      }
      this.clearMarquee()
    } else if (
      (this.mode === 'move' ||
        this.mode === 'resize' ||
        this.mode === 'rotate') &&
      this.gestureBefore
    ) {
      if (this.didTransform) {
        this.history.pushBefore(this.gestureBefore)
        this.dirty = true
      }
      this.gestureBefore = null
    }
    this.clearSmartGuides()
    this.moveBoundsStart = null
    this.movePointerStart = null
    this.moveOrigPositions = []
    this.didTransform = false
    this.mode = 'none'
    this.dragStart = null
    this.origScalings = []
    this.notify()
  }

  private onDrawDown(e: paper.ToolEvent) {
    const skipEdges = this.tool === 'freehand'
    const pt = this.applySnap(e.point, [], { skipEdges })
    this.dragStart = pt.clone()
    this.mode = 'draw'
    this.docLayer.activate()

    if (this.tool === 'freehand') {
      this.gestureBefore = this.snapshotDoc()
      this.currentPath = new paper.Path({ segments: [pt] })
      this.styleNew(this.currentPath)
      this.docLayer.addChild(this.currentPath)
    } else if (this.tool === 'polygon') {
      let polyPt = pt
      if (e.modifiers.shift && this.polygonPoints.length) {
        const last = this.polygonPoints[this.polygonPoints.length - 1]
        const c = constrainPointToAngle(last, polyPt)
        polyPt = new paper.Point(c.x, c.y)
      }
      this.polygonPoints.push(polyPt.clone())
      this.preview?.remove()
      this.preview = new paper.Path(this.polygonPoints.map((p) => p.clone()))
      this.styleNew(this.preview)
      this.docLayer.addChild(this.preview)
      this.status = `Polygon: ${this.polygonPoints.length} pts — Enter/dblclick finish`
      this.notify()
    } else if (this.tool === 'text') {
      const content = window.prompt('Text content:', 'CutForge') ?? ''
      if (!content) {
        this.setTool('select')
        return
      }
      const before = this.snapshotDoc()
      const t = new paper.PointText({
        point: pt,
        content,
        fontSize: 18,
        fontFamily: 'Inter, system-ui, sans-serif',
      })
      this.styleNew(t)
      t.data.fontId = 'inter'
      this.docLayer.addChild(t)
      this.history.pushBefore(before)
      this.selectItems([t])
      this.setTool('select')
    } else {
      this.gestureBefore = this.snapshotDoc()
    }
  }

  private onDrawDrag(e: paper.ToolEvent) {
    if (!this.dragStart) return
    this.docLayer.activate()
    const skipEdges = this.tool === 'freehand'
    let pt = this.applySnap(e.point, [], { skipEdges })
    if (this.tool === 'freehand' && this.currentPath) {
      this.currentPath.add(pt)
      return
    }
    if (this.tool === 'polygon' || this.tool === 'text') return

    if (e.modifiers.shift && this.dragStart) {
      if (this.tool === 'line') {
        const c = constrainPointToAngle(this.dragStart, pt)
        pt = new paper.Point(c.x, c.y)
      } else if (this.tool === 'rect' || this.tool === 'ellipse') {
        // Shift = square / circle
        const dx = pt.x - this.dragStart.x
        const dy = pt.y - this.dragStart.y
        const s = Math.max(Math.abs(dx), Math.abs(dy))
        pt = new paper.Point(
          this.dragStart.x + Math.sign(dx || 1) * s,
          this.dragStart.y + Math.sign(dy || 1) * s,
        )
      }
    }

    this.preview?.remove()
    if (this.tool === 'rect') {
      this.preview = new paper.Path.Rectangle(
        new paper.Rectangle(this.dragStart, pt),
      )
    } else if (this.tool === 'ellipse') {
      this.preview = new paper.Path.Ellipse(
        new paper.Rectangle(this.dragStart, pt),
      )
    } else if (this.tool === 'line') {
      this.preview = new paper.Path.Line(this.dragStart, pt)
    }
    if (this.preview) {
      this.styleNew(this.preview)
      this.docLayer.addChild(this.preview)
    }
  }

  private onDrawUp(_e: paper.ToolEvent) {
    if (this.tool === 'freehand' && this.currentPath) {
      if (this.currentPath.segments.length > 2) this.currentPath.simplify(2.5)
      if (this.currentPath.segments.length >= 2) {
        if (this.gestureBefore) this.history.pushBefore(this.gestureBefore)
        this.dirty = true
        this.selectItems([this.currentPath])
      } else {
        this.currentPath.remove()
      }
      this.currentPath = null
      this.gestureBefore = null
      this.setTool('select')
    } else if (
      this.preview &&
      (this.tool === 'rect' || this.tool === 'ellipse' || this.tool === 'line')
    ) {
      if (this.preview.bounds.width < 1 && this.preview.bounds.height < 1) {
        this.preview.remove()
      } else {
        if (this.gestureBefore) this.history.pushBefore(this.gestureBefore)
        this.dirty = true
        this.selectItems([this.preview])
      }
      this.preview = null
      this.gestureBefore = null
      this.setTool('select')
    }
    this.clearSmartGuides()
    this.mode = 'none'
    this.dragStart = null
  }

  private finishPolygon() {
    if (this.polygonPoints.length < 3) {
      this.status = 'Need at least 3 points'
      this.notify()
      return
    }
    const before = this.snapshotDoc()
    this.preview?.remove()
    this.docLayer.activate()
    const path = new paper.Path(this.polygonPoints.map((p) => p.clone()))
    path.closed = true
    this.styleNew(path)
    this.docLayer.addChild(path)
    this.polygonPoints = []
    this.preview = null
    this.history.pushBefore(before)
    this.selectItems([path])
    this.setTool('select')
  }

  private onDblClick = () => {
    if (this.tool === 'polygon') this.finishPolygon()
  }

  private onMouseMove = (e: MouseEvent) => {
    const pt = paper.view.viewToProject(new paper.Point(e.offsetX, e.offsetY))
    this.cursor = {
      xMm: pt.x / PX_PER_MM,
      yMm: pt.y / PX_PER_MM,
      xView: e.offsetX,
      yView: e.offsetY,
    }
    if (!this._cursorRaf) {
      this._cursorRaf = requestAnimationFrame(() => {
        this._cursorRaf = 0
        for (const fn of this.cursorListeners) fn(this.cursor)
      })
    }
  }
  private _cursorRaf = 0

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
    void oldZoom
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
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'd') {
      this.duplicateSelected()
      e.preventDefault()
    }
    if (mod && e.key.toLowerCase() === 'a') {
      this.selectAll()
      e.preventDefault()
    }
    if (mod && e.key.toLowerCase() === 'c') {
      this.copySelected()
      e.preventDefault()
    }
    if (mod && e.key.toLowerCase() === 'v') {
      void this.pasteClipboard()
      e.preventDefault()
    }
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      this.undo()
      e.preventDefault()
    }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      this.redo()
      e.preventDefault()
    }
    if (e.key === 'Enter' && this.tool === 'polygon') this.finishPolygon()
    if (e.key === 'Escape') {
      const drawing =
        this.tool !== 'select' ||
        this.polygonPoints.length > 0 ||
        !!this.preview ||
        !!this.currentPath ||
        this.mode === 'marquee'
      this.polygonPoints = []
      this.clearPreview()
      this.clearMarquee()
      this.clearSmartGuides()
      if (drawing && this.tool !== 'select') {
        this.setTool('select')
      } else if (this.selected.length) {
        this.deselectAll()
        this.status = 'Selection cleared'
        this.notify()
      } else {
        this.setTool('select')
      }
      e.preventDefault()
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
    if (map[k] && !mod && !e.altKey) this.setTool(map[k])
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.spacePan = false
  }
}

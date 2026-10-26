import paper from 'paper'
import { applyCutTypeVisual, styleFromItem } from './styles'
import { HistoryStack } from './history'
import { snapDelta, snapPoint } from './snap'
import { booleanOperate, offsetPath } from './booleans'
import { constrainPointToAngle, snapAngleDeg } from './angles'
import { buildRegistrationMarks } from './regMarks'
import { packShelf } from './nesting'
import {
  cloneLayer,
  createLayer,
  defaultLayers,
  type CfLayer,
} from './layerModel'
import {
  breakAtNode,
  collectPaths,
  deleteNodes,
  findNearestCurve,
  findNearestNode,
  insertNodeAtClick,
  isPathLike,
  joinOpenPathChain,
  nodesToCusp,
  nodesToSmooth,
  segmentsToCurve,
  segmentsToLine,
  type NodeRef,
} from './pathEdit'
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
  ContextMenuAction,
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
    | 'vertex'
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
  /** Named layers; index 0 = top of panel = cut first */
  private layers: CfLayer[] = defaultLayers()
  private activeLayerId: string = this.layers[0]?.id || ''
  private rotateBaseDeg = 0
  private vertexPath: paper.Path | null = null
  private vertexIndex = -1
  /** Selected nodes in Shape tool (multi-select with Shift). */
  private shapeNodes: NodeRef[] = []
  private shapeNodeStarts: { ref: NodeRef; point: paper.Point }[] = []
  private handleDragKind: 'in' | 'out' | null = null
  /** When set, editing children inside this group (dblclick to enter, Esc to leave). */
  private isolatedGroup: paper.Group | null = null
  /** Join endpoint tolerance in mm (open paths). */
  private joinTolMm = 0.5

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
    this.unbindGlobalPointerUp()
    this.releasePointerCaptureSafe()
    this.endPointerGesture(true)
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

  canJoinOpen(): boolean {
    const paths = this.selected
      .filter((i) => !i.data.locked && i.visible)
      .flatMap((i) => collectPaths(i))
      .filter((p) => !p.closed)
    return paths.length >= 2
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
    this.ensureLayers()
    const items: paper.Item[] = []
    // Cut order: layers[0] (top of panel) first, then document z-order within layer
    for (const layer of this.layers) {
      if (excludeHidden && !layer.visible) continue
      for (const item of this.docLayer.children) {
        this.ensureItemLayer(item)
        if (String(item.data.layerId) !== layer.id) continue
        if (excludeHidden && (!item.visible || !layer.visible)) continue
        if (excludeLocked && (item.data?.locked || layer.locked)) continue
        items.push(item)
      }
    }
    if (includeReg && this.regMarksGroup) {
      items.push(this.regMarksGroup)
    }
    return items
  }

  getLayers(): CfLayer[] {
    return this.layers.map(cloneLayer)
  }

  getActiveLayerId() {
    return this.activeLayerId
  }

  getLayerMap(): Map<string, CfLayer> {
    return new Map(this.layers.map((l) => [l.id, l]))
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

  /** Bounding box of selection, or all export items if none selected (canvas px). */
  getJobBounds(preferSelection = true): paper.Rectangle | null {
    if (preferSelection) {
      const sel = this.selected.filter((i) => !i.data.locked && i.visible)
      const b = this.boundsOf(sel)
      if (b) return b
    }
    const items = this.getExportItems({
      includeRegMarks: false,
      excludeLocked: true,
      excludeHidden: true,
    })
    return this.boundsOf(items)
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

  cutSelected() {
    if (!this.selected.length) return
    this.copySelected()
    this.deleteSelected()
    this.status = 'Cut to clipboard'
  }

  bringSelectionToFront() {
    if (!this.selected.length) return
    const before = this.snapshotDoc()
    for (const item of this.selected) item.bringToFront()
    this.history.pushBefore(before)
    this.dirty = true
    this.status = 'Brought to front'
    this.notify()
  }

  sendSelectionToBack() {
    if (!this.selected.length) return
    const before = this.snapshotDoc()
    for (const item of [...this.selected].reverse()) item.sendToBack()
    this.history.pushBefore(before)
    this.dirty = true
    this.status = 'Sent to back'
    this.notify()
  }

  toggleSelectionLocked() {
    if (!this.selected.length) return
    const before = this.snapshotDoc()
    const lock = !this.selected.every((i) => !!i.data.locked)
    for (const item of this.selected) item.data.locked = lock
    this.history.pushBefore(before)
    this.dirty = true
    if (lock) this.deselectAll()
    this.status = lock ? 'Locked' : 'Unlocked'
    this.notify()
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
    if (src.data?.layerId) result.data.layerId = src.data.layerId
    this.attachToActiveLayer(result)
    if (src.data?.layerId) result.data.layerId = src.data.layerId
    for (const i of items) i.remove()
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems([result])
    const labels: Record<BooleanOp, string> = {
      unite: 'Weld / Unite',
      subtract: 'Subtract',
      intersect: 'Clip / Intersect',
      exclude: 'Exclude (XOR)',
    }
    this.status = labels[op] || `Boolean ${op}`
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
      this.ensureItemLayer(item)
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
    this.ensureLayers()
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
      layers: this.layers,
      activeLayerId: this.activeLayerId,
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
    if (parsed.layers?.length) {
      this.layers = parsed.layers.map(cloneLayer)
      this.activeLayerId =
        parsed.activeLayerId &&
        this.layers.some((l) => l.id === parsed.activeLayerId)
          ? parsed.activeLayerId
          : this.layers[0].id
    } else {
      this.layers = defaultLayers()
      this.activeLayerId = this.layers[0].id
    }
    this.rebuildPage()
    this.rebuildRegMarks()
    this.docLayer.removeChildren()
    this.docLayer.activate()
    for (const s of parsed.objects) {
      const item = paper.project.importJSON(s) as paper.Item | null
      if (!item) continue
      if (item.layer !== this.docLayer) this.docLayer.addChild(item)
      ensureMeta(item)
      this.ensureItemLayer(item)
    }
    this.syncItemsToLayerFlags()
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

  getTool(): Tool {
    return this.tool
  }

  setTool(tool: Tool) {
    // No-op when unchanged — avoids resize/notify/React churn that blanked the canvas
    if (tool === this.tool) {
      this.ensureViewHealthy()
      return
    }
    this.tool = tool
    // Always end any in-progress pointer gesture when changing tools
    this.endPointerGesture(true)
    this.clearPreview()
    this.clearMarquee()
    if (tool !== 'polygon') this.polygonPoints = []
    if (tool !== 'select' && tool !== 'shape') {
      this.deselectAll()
      this.shapeNodes = []
    }
    if (tool === 'shape') {
      this.shapeNodes = []
    }
    // Shape + Select both show handles (nodes vs transform box)
    if (tool === 'shape' || tool === 'select') {
      this.drawHandles()
    } else {
      this.clearHandles()
    }
    this.status = this.toolTip(tool)
    this.ensureViewHealthy()
    this.notify()
  }

  private toolTip(tool: Tool): string {
    const tips: Record<Tool, string> = {
      select:
        'Select — marquee · Shift+click · Del · Esc clears · dblclick path → Shape',
      shape:
        'Shape (nodes) — drag nodes · dblclick segment = add · dblclick node = delete · Shift+click multi',
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
      this.attachToActiveLayer(item)
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

  /**
   * Nest / pack shapes onto the page (AABB shelf packing, optional 90°).
   * One undo restores prior positions and rotations.
   */
  nestItems(
    mode: 'selection' | 'all',
    opts?: { gapMm?: number; marginMm?: number; allowRotate90?: boolean },
  ): { placed: number; failed: number } {
    const gapMm = opts?.gapMm ?? 2.5
    const marginMm = opts?.marginMm ?? 3
    const allowRotate90 = opts?.allowRotate90 !== false

    let items: paper.Item[]
    if (mode === 'selection') {
      items = this.selected.filter((i) => this.isNestable(i))
    } else {
      items = this.docLayer.children.filter((i) => this.isNestable(i))
    }
    if (items.length < 1) {
      this.status = 'Nest: nothing to pack'
      this.notify()
      return { placed: 0, failed: 0 }
    }

    const before = this.snapshotDoc()
    const gapPx = gapMm * PX_PER_MM
    const marginPx = marginMm * PX_PER_MM
    const binW = this.page.widthMm * PX_PER_MM - 2 * marginPx
    const binH = this.page.heightMm * PX_PER_MM - 2 * marginPx
    if (binW <= 1 || binH <= 1) {
      this.status = 'Nest: page too small for margin'
      this.notify()
      return { placed: 0, failed: items.length }
    }

    const idOf = (it: paper.Item) => String(it.data.cfId || it.id)
    const parts = items.map((it) => ({
      id: idOf(it),
      width: it.bounds.width,
      height: it.bounds.height,
    }))

    const { placements, failedIds } = packShelf(parts, {
      binWidth: binW,
      binHeight: binH,
      gap: gapPx,
      allowRotate90,
    })

    const byId = new Map(items.map((it) => [idOf(it), it]))
    const origin = new paper.Point(marginPx, marginPx)

    for (const pl of placements) {
      const item = byId.get(pl.id)
      if (!item) continue
      if (pl.rotated) {
        item.rotate(90, item.bounds.center)
      }
      // Position so AABB top-left sits at bin slot
      const b = item.bounds
      item.position = item.position.add(
        new paper.Point(
          origin.x + pl.x - b.left,
          origin.y + pl.y - b.top,
        ),
      )
    }

    this.history.pushBefore(before)
    this.dirty = true
    this.drawHandles()
    const placed = placements.length
    const failed = failedIds.length
    this.status =
      failed > 0
        ? `Nested ${placed} · ${failed} did not fit (gap ${gapMm} mm, margin ${marginMm} mm)`
        : `Nested ${placed} parts (gap ${gapMm} mm)`
    this.notify()
    return { placed, failed }
  }

  private isNestable(item: paper.Item): boolean {
    if (!item.visible || item.data?.locked) return false
    if (isGuide(item)) return false
    if (item.data?.isRegMark) return false
    if (item.data?.isHandle || item.data?.isPage) return false
    if (item.bounds.width < 0.1 || item.bounds.height < 0.1) return false
    this.ensureItemLayer(item)
    const layer = this.layers.find((l) => l.id === item.data.layerId)
    if (layer && (!layer.visible || layer.locked)) return false
    return true
  }


  /** Click layer in panel: activate + select all members */
  selectById(id: string, additive = false) {
    const layer = this.layers.find((l) => l.id === id)
    if (layer) {
      this.setActiveLayer(id)
      const members = this.docLayer.children.filter(
        (c) => String(c.data?.layerId) === id && !c.data?.locked && c.visible,
      )
      if (additive) {
        const set = new Set(this.selected)
        for (const m of members) {
          if (set.has(m)) set.delete(m)
          else set.add(m)
        }
        this.selectItems([...set])
      } else {
        this.selectItems(members)
      }
      return
    }
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

  setActiveLayer(id: string) {
    if (!this.layers.some((l) => l.id === id)) return
    this.activeLayerId = id
    this.notify()
  }

  setLayerVisible(id: string, visible: boolean) {
    const layer = this.layers.find((l) => l.id === id)
    if (!layer) return
    const before = this.snapshotDoc()
    layer.visible = visible
    for (const item of this.docLayer.children) {
      if (String(item.data?.layerId) === id) {
        item.visible = visible
        if (!visible) this.selected = this.selected.filter((s) => s !== item)
      }
    }
    this.history.pushBefore(before)
    this.drawHandles()
    this.status = visible
      ? `Layer “${layer.name}” shown`
      : `Layer “${layer.name}” hidden`
    this.notify()
  }

  setLayerLocked(id: string, locked: boolean) {
    const layer = this.layers.find((l) => l.id === id)
    if (!layer) return
    const before = this.snapshotDoc()
    layer.locked = locked
    for (const item of this.docLayer.children) {
      if (String(item.data?.layerId) === id) {
        item.data.locked = locked
        if (locked) this.selected = this.selected.filter((s) => s !== item)
      }
    }
    this.history.pushBefore(before)
    this.drawHandles()
    this.notify()
  }

  renameLayer(id: string, name: string) {
    const layer = this.layers.find((l) => l.id === id)
    if (!layer) return
    const before = this.snapshotDoc()
    layer.name = name.trim() || layer.name
    this.history.pushBefore(before)
    this.notify()
  }

  /** Reorder layers in the panel (cut order). up = toward top / cut earlier. */
  reorderLayer(id: string, direction: 'up' | 'down' | 'top' | 'bottom') {
    const idx = this.layers.findIndex((l) => l.id === id)
    if (idx < 0) return
    const before = this.snapshotDoc()
    const arr = [...this.layers]
    const [layer] = arr.splice(idx, 1)
    if (direction === 'top') arr.unshift(layer)
    else if (direction === 'bottom') arr.push(layer)
    else if (direction === 'up' && idx > 0) arr.splice(idx - 1, 0, layer)
    else if (direction === 'down' && idx < this.layers.length)
      arr.splice(idx + 1, 0, layer)
    else {
      arr.splice(idx, 0, layer)
      return
    }
    this.layers = arr
    this.history.pushBefore(before)
    this.notify()
  }

  moveLayer(id: string, toIndexFromTop: number) {
    const idx = this.layers.findIndex((l) => l.id === id)
    if (idx < 0) return
    const before = this.snapshotDoc()
    const arr = [...this.layers]
    const [layer] = arr.splice(idx, 1)
    const ti = Math.max(0, Math.min(toIndexFromTop, arr.length))
    arr.splice(ti, 0, layer)
    this.layers = arr
    this.history.pushBefore(before)
    this.notify()
  }

  addLayer(cutType: CutType = 'cut'): string {
    const before = this.snapshotDoc()
    const layer = createLayer({
      cutType,
      name: cutType[0].toUpperCase() + cutType.slice(1),
    })
    this.layers = [layer, ...this.layers]
    this.activeLayerId = layer.id
    this.history.pushBefore(before)
    this.status = `Added layer “${layer.name}”`
    this.notify()
    return layer.id
  }

  duplicateLayer(id: string) {
    const src = this.layers.find((l) => l.id === id)
    if (!src) return
    const before = this.snapshotDoc()
    const copy2 = createLayer({
      name: `${src.name} copy`,
      color: src.color,
      cutType: src.cutType,
      power: src.power,
      speed: src.speed,
      passes: src.passes,
      visible: src.visible,
      locked: false,
    })
    const idx = this.layers.findIndex((l) => l.id === id)
    const arr = [...this.layers]
    arr.splice(idx, 0, copy2)
    this.layers = arr
    this.docLayer.activate()
    const created: paper.Item[] = []
    for (const item of [...this.docLayer.children]) {
      if (String(item.data?.layerId) !== id) continue
      const json = item.exportJSON({ asString: true }) as string
      const clone = paper.project.importJSON(json) as paper.Item | null
      if (!clone) continue
      clone.data.cfId = nextId()
      clone.data.layerId = copy2.id
      if (clone.layer !== this.docLayer) this.docLayer.addChild(clone)
      created.push(clone)
    }
    this.activeLayerId = copy2.id
    this.history.pushBefore(before)
    this.selectItems(created)
    this.status = `Duplicated layer “${src.name}” (${created.length} objects)`
    this.notify()
  }

  deleteLayer(id: string) {
    if (this.layers.length <= 1) {
      this.status = 'Cannot delete the last layer'
      this.notify()
      return
    }
    const layer = this.layers.find((l) => l.id === id)
    if (!layer) return
    const members = this.docLayer.children.filter(
      (c) => String(c.data?.layerId) === id,
    )
    if (
      members.length &&
      !window.confirm(
        `Delete layer “${layer.name}” and its ${members.length} object(s)?`,
      )
    ) {
      return
    }
    const before = this.snapshotDoc()
    for (const item of members) item.remove()
    this.layers = this.layers.filter((l) => l.id !== id)
    if (this.activeLayerId === id) this.activeLayerId = this.layers[0].id
    this.selected = this.selected.filter((s) => !members.includes(s))
    this.history.pushBefore(before)
    this.drawHandles()
    this.status = `Deleted layer “${layer.name}”`
    this.notify()
  }

  updateLayer(
    id: string,
    partial: Partial<
      Pick<
        CfLayer,
        | 'name'
        | 'color'
        | 'cutType'
        | 'power'
        | 'speed'
        | 'passes'
        | 'visible'
        | 'locked'
      >
    >,
  ) {
    const layer = this.layers.find((l) => l.id === id)
    if (!layer) return
    const before = this.snapshotDoc()
    Object.assign(layer, partial)
    if (partial.cutType) {
      for (const item of this.docLayer.children) {
        if (String(item.data?.layerId) !== id) continue
        item.data.cutType = partial.cutType
        applyCutTypeVisual(item, partial.cutType, {
          ...styleFromItem(item),
          cutType: partial.cutType,
          strokeColor: layer.color,
        })
      }
    }
    if (partial.color) {
      for (const item of this.docLayer.children) {
        if (String(item.data?.layerId) !== id) continue
        item.data.strokeColor = partial.color
        try {
          ;(item as paper.Path).strokeColor =
            partial.color as unknown as paper.Color
        } catch {
          /* */
        }
      }
    }
    if (partial.visible != null || partial.locked != null) {
      this.syncItemsToLayerFlags()
    }
    this.history.pushBefore(before)
    this.notify()
  }

  moveSelectionToLayer(layerId: string) {
    if (!this.layers.some((l) => l.id === layerId)) return
    const layer = this.layers.find((l) => l.id === layerId)!
    if (layer.locked) {
      this.status = 'Target layer is locked'
      this.notify()
      return
    }
    const items = this.selected.filter((i) => !i.data.locked && i.visible)
    if (!items.length) return
    const before = this.snapshotDoc()
    for (const item of items) {
      item.data.layerId = layerId
      item.data.cutType = layer.cutType
      applyCutTypeVisual(item, layer.cutType, {
        ...styleFromItem(item),
        cutType: layer.cutType,
        strokeColor: layer.color,
      })
      item.visible = layer.visible
    }
    this.history.pushBefore(before)
    this.status = `Moved ${items.length} to “${layer.name}”`
    this.notify()
  }

  private ensureLayers() {
    if (!this.layers.length) {
      this.layers = defaultLayers()
      this.activeLayerId = this.layers[0].id
    }
    if (!this.layers.some((l) => l.id === this.activeLayerId)) {
      this.activeLayerId = this.layers[0].id
    }
  }

  private ensureItemLayer(item: paper.Item) {
    this.ensureLayers()
    if (
      !item.data.layerId ||
      !this.layers.some((l) => l.id === item.data.layerId)
    ) {
      item.data.layerId = this.activeLayerId || this.layers[0].id
    }
  }

  private attachToActiveLayer(item: paper.Item) {
    this.ensureLayers()
    const layer =
      this.layers.find((l) => l.id === this.activeLayerId) || this.layers[0]
    item.data.layerId = layer.id
    item.data.cutType = layer.cutType
    applyCutTypeVisual(item, layer.cutType, {
      ...this.style,
      cutType: layer.cutType,
      strokeColor: layer.color,
    })
    item.visible = layer.visible
    if (layer.locked) item.data.locked = true
  }

  private syncItemsToLayerFlags() {
    for (const layer of this.layers) {
      for (const item of this.docLayer.children) {
        if (String(item.data?.layerId) !== layer.id) continue
        item.visible = layer.visible
        item.data.locked = layer.locked
      }
    }
  }


  resizeToCanvas(width: number, height: number) {
    // Ignore transient 0-size layouts (tool switch / React reflow) — those were
    // blanking the view when Paper applied a tiny viewSize.
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    if (width < 32 || height < 32) return

    const vs = paper.view.viewSize
    const changed =
      Math.abs(vs.width - width) > 0.5 || Math.abs(vs.height - height) > 0.5
    if (changed) {
      // Preserve camera across buffer resize
      const zoom = paper.view.zoom
      const center = paper.view.center.clone()
      paper.view.viewSize = new paper.Size(width, height)
      paper.view.zoom = zoom
      paper.view.center = center
      // Keep CSS fill; Paper may set inline px without [resize] — restore 100%
      // so the canvas still fills .canvas-wrap after React re-renders.
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      this.reapplyPixelRatioScale()
    }
    this.ensureViewHealthy()
    // Do NOT notify() here — that re-entered React → ResizeObserver → blank loop
  }

  /** Re-apply HiDPI ctx.scale after anything that may have reset the 2D context. */
  private reapplyPixelRatioScale() {
    try {
      const view = paper.view as paper.View & {
        pixelRatio?: number
        _pixelRatio?: number
        _context?: CanvasRenderingContext2D
      }
      const ratio =
        view.pixelRatio ||
        view._pixelRatio ||
        (typeof window !== 'undefined' ? window.devicePixelRatio : 1) ||
        1
      const ctx =
        view._context ||
        this.canvas.getContext('2d')
      if (!ctx || ratio === 1) return
      // Match Paper CanvasView._setElementSize: restore/save/scale
      try {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      } catch {
        /* */
      }
    } catch {
      /* */
    }
  }

  /**
   * Keep page/grid/doc visible after tool switches. Recovers from a blank
   * canvas without wiping the project.
   */
  ensureViewHealthy() {
    try {
      if (this.guideLayer) this.guideLayer.visible = true
      if (this.docLayer) this.docLayer.visible = true
      if (this.overlayLayer) this.overlayLayer.visible = true
      this.docLayer?.activate()
      // Force a full redraw even if Paper thinks nothing changed
      const view = paper.view as paper.View & {
        _needsUpdate?: boolean
        draw?: () => void
        update?: (force?: boolean) => boolean
      }
      if (typeof view.update === 'function') {
        view._needsUpdate = true
        view.update(true)
      } else if (typeof view.draw === 'function') {
        view.draw()
      }
    } catch (err) {
      console.error('ensureViewHealthy failed', err)
    }
  }

  /**
   * Shared pointer → project mapper. Uses Paper's getEventPoint so CSS size,
   * devicePixelRatio, zoom, and pan stay in sync (never raw offsetX alone).
   */
  clientToProject(e: MouseEvent | WheelEvent | { clientX: number; clientY: number }): paper.Point {
    const view = paper.view as paper.View & {
      getEventPoint?: (ev: Event) => paper.Point
    }
    if (typeof view.getEventPoint === 'function' && 'target' in e) {
      try {
        return view.getEventPoint(e as Event)
      } catch {
        /* fall through */
      }
    }
    // Fallback: map client coords via canvas bounding rect into view space
    const el = this.canvas
    const rect = el.getBoundingClientRect()
    const cssW = el.offsetWidth || rect.width || 1
    const cssH = el.offsetHeight || rect.height || 1
    const x = ((e.clientX - rect.left) / cssW) * paper.view.viewSize.width
    const y = ((e.clientY - rect.top) / cssH) * paper.view.viewSize.height
    return paper.view.viewToProject(new paper.Point(x, y))
  }

  // --- internals ---

  private snapshotDoc(): string {
    return JSON.stringify({
      v: 2,
      layers: this.layers.map(cloneLayer),
      activeLayerId: this.activeLayerId,
      objects: this.docLayer.children.map((c) =>
        c.exportJSON({ asString: true }),
      ),
    })
  }

  private restoreDoc(raw: string) {
    this.deselectAll()
    this.clearHandles()
    this.clearMarquee()
    this.docLayer.removeChildren()
    this.docLayer.activate()
    try {
      const parsed = JSON.parse(raw) as
        | string[]
        | {
            v?: number
            layers?: CfLayer[]
            activeLayerId?: string
            objects?: string[]
          }
      let list: string[]
      if (Array.isArray(parsed)) {
        list = parsed
      } else {
        if (parsed.layers?.length) {
          this.layers = parsed.layers.map(cloneLayer)
          this.activeLayerId =
            parsed.activeLayerId &&
            this.layers.some((l) => l.id === parsed.activeLayerId)
              ? parsed.activeLayerId
              : this.layers[0].id
        }
        list = parsed.objects || []
      }
      for (const s of list) {
        const item = paper.project.importJSON(s) as paper.Item | null
        if (!item) continue
        if (item.layer !== this.docLayer) this.docLayer.addChild(item)
        ensureMeta(item)
        this.ensureItemLayer(item)
      }
      this.syncItemsToLayerFlags()
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
      canUngroup: this.canUngroup(),
      canJoin: this.canJoinOpen(),
      hasText: this.hasSelectedText(),
      printAndCut: this.printAndCutMode,
      activeLayerId: this.activeLayerId,
    }
  }

  private listLayers(): LayerInfo[] {
    this.ensureLayers()
    return this.layers.map((layer) => {
      const members = this.docLayer.children.filter(
        (c) => String(c.data?.layerId) === layer.id,
      )
      return {
        id: layer.id,
        name: layer.name,
        color: layer.color,
        visible: layer.visible,
        locked: layer.locked,
        active: layer.id === this.activeLayerId,
        selected: members.some((m) => this.selected.includes(m)),
        itemCount: members.length,
        cutType: layer.cutType,
        power: layer.power,
        speed: layer.speed,
        passes: layer.passes,
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
    ensureMeta(item, this.autoName(this.toolLabel()))
    this.attachToActiveLayer(item)
    this.applyStrokeWidth(item)
  }

  private toolLabel() {
    const map: Record<Tool, string> = {
      select: 'Object',
      shape: 'Path',
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
    const z = Math.max(0.05, paper.view.zoom || 1)
    this.overlayLayer.activate()
    this.handleGroup = new paper.Group()
    this.handleGroup.data.isHandle = true

    const shapeMode = this.tool === 'shape'
    try {

    if (!shapeMode) {
      const bounds = this.selectedBounds()
      if (!bounds) {
        this.docLayer.activate()
        return
      }
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
        ['n', new paper.Point(bounds.center.x, bounds.top)],
        ['s', new paper.Point(bounds.center.x, bounds.bottom)],
        ['w', new paper.Point(bounds.left, bounds.center.y)],
        ['e', new paper.Point(bounds.right, bounds.center.y)],
      ]
      for (const [name, pt] of corners) {
        const h = new paper.Path.Rectangle(
          new paper.Rectangle(pt.x - size / 2, pt.y - size / 2, size, size),
        )
        h.fillColor = new paper.Color(name.length === 1 ? '#7ec8ff' : '#5b9cff')
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
    }

    // Node / handle overlays in Shape mode (or after entering via dblclick)
    if (shapeMode) {
      for (const root of this.selected) {
        if (!isPathLike(root)) continue
        for (const path of collectPaths(root)) {
          path.segments.forEach((seg, index) => {
            const selected = this.shapeNodes.some(
              (n) => n.path === path && n.index === index,
            )
            // Bezier handles for selected nodes
            if (selected) {
              if (seg.handleIn && seg.handleIn.length > 0.5) {
                const hiAbs = seg.point.add(seg.handleIn)
                const lin = new paper.Path.Line(seg.point, hiAbs)
                lin.strokeColor = new paper.Color('#aaa')
                lin.strokeWidth = 1 / z
                lin.data.isHandle = true
                this.handleGroup!.addChild(lin)
                const hi = new paper.Path.Circle(hiAbs, 3.5 / z)
                hi.fillColor = new paper.Color('#fff')
                hi.strokeColor = new paper.Color('#888')
                hi.strokeWidth = 1 / z
                hi.data.isHandle = true
                hi.data.handle = 'handle-in'
                hi.data.vertexIndex = index
                hi.data.vertexPath = path
                this.handleGroup!.addChild(hi)
              }
              if (seg.handleOut && seg.handleOut.length > 0.5) {
                const hoAbs = seg.point.add(seg.handleOut)
                const lout = new paper.Path.Line(seg.point, hoAbs)
                lout.strokeColor = new paper.Color('#aaa')
                lout.strokeWidth = 1 / z
                lout.data.isHandle = true
                this.handleGroup!.addChild(lout)
                const ho = new paper.Path.Circle(hoAbs, 3.5 / z)
                ho.fillColor = new paper.Color('#fff')
                ho.strokeColor = new paper.Color('#888')
                ho.strokeWidth = 1 / z
                ho.data.isHandle = true
                ho.data.handle = 'handle-out'
                ho.data.vertexIndex = index
                ho.data.vertexPath = path
                this.handleGroup!.addChild(ho)
              }
            }
            const vh = new paper.Path.Circle(seg.point, selected ? 5.5 / z : 4.5 / z)
            vh.fillColor = new paper.Color(selected ? '#f39c12' : '#f1c40f')
            vh.strokeColor = new paper.Color('#1a1a1a')
            vh.strokeWidth = 1 / z
            vh.data.isHandle = true
            vh.data.handle = 'vertex'
            vh.data.vertexIndex = index
            vh.data.vertexPath = path
            this.handleGroup!.addChild(vh)
          })
        }
      }
    }
    } catch (err) {
      console.error('drawHandles failed', err)
      this.clearHandles()
    } finally {
      this.docLayer.activate()
      try {
        paper.view.update()
      } catch {
        /* */
      }
    }
  }

  private hitDrawable(point: paper.Point): paper.Item | null {
    const hit = this.docLayer.hitTest(point, {
      fill: true,
      stroke: true,
      tolerance: 8 / paper.view.zoom,
    })
    let item = hit?.item ?? null
    while (item && item.parent && item.parent !== this.docLayer) {
      if (this.isolatedGroup && item.parent === this.isolatedGroup) break
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
        this.capturePointerFromEvent(e)
        this.bindGlobalPointerUp()
        return
      }
      if (this.tool === 'select' || this.tool === 'shape') {
        this.onSelectDown(e)
        this.capturePointerFromEvent(e)
        this.bindGlobalPointerUp()
      } else {
        this.onDrawDown(e)
        // Capture for drag-draw tools so mouseup off-canvas still ends the gesture
        if (
          this.tool === 'rect' ||
          this.tool === 'ellipse' ||
          this.tool === 'line' ||
          this.tool === 'freehand'
        ) {
          this.capturePointerFromEvent(e)
        }
        this.bindGlobalPointerUp()
      }
    }

    this.paperTool.onMouseDrag = (e: paper.ToolEvent) => {
      if (this.mode === 'pan' && this.panStart && this.viewCenterStart) {
        const delta = this.panStart.subtract(e.point)
        paper.view.center = this.viewCenterStart.add(delta)
        this.notify()
        return
      }
      // Prefer draw drag while a draw gesture is active (even if tool flipped)
      if (this.mode === 'draw' || this.currentPath) {
        this.onDrawDrag(e)
      } else if (this.tool === 'select' || this.tool === 'shape') {
        this.onSelectDrag(e)
      } else {
        this.onDrawDrag(e)
      }
    }

    this.paperTool.onMouseUp = (_e: paper.ToolEvent) => {
      this.handlePointerUp()
    }
  }

  private capturedPointerId: number | null = null

  private bindGlobalPointerUp() {
    // Always (re)attach listeners — never leave us deaf to mouseup
    window.removeEventListener('pointerup', this.onGlobalPointerUp, true)
    window.removeEventListener('mouseup', this.onGlobalPointerUp, true)
    window.removeEventListener('blur', this.onGlobalPointerUp)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('pointerup', this.onGlobalPointerUp, true)
    window.addEventListener('mouseup', this.onGlobalPointerUp, true)
    window.addEventListener('blur', this.onGlobalPointerUp)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  private unbindGlobalPointerUp() {
    window.removeEventListener('pointerup', this.onGlobalPointerUp, true)
    window.removeEventListener('mouseup', this.onGlobalPointerUp, true)
    window.removeEventListener('blur', this.onGlobalPointerUp)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }

  private capturePointerFromEvent(e: paper.ToolEvent) {
    try {
      const ne = (e as paper.ToolEvent & { event?: Event }).event
      if (
        ne &&
        'pointerId' in ne &&
        typeof (ne as PointerEvent).pointerId === 'number'
      ) {
        const id = (ne as PointerEvent).pointerId
        this.canvas.setPointerCapture(id)
        this.capturedPointerId = id
      }
    } catch {
      /* capture unsupported or already captured */
    }
  }

  private releasePointerCaptureSafe() {
    try {
      const id = this.capturedPointerId
      if (id != null && this.canvas.hasPointerCapture?.(id)) {
        this.canvas.releasePointerCapture(id)
      }
    } catch {
      /* */
    }
    this.capturedPointerId = null
  }

  private onGlobalPointerUp = () => {
    this.handlePointerUp()
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.handlePointerUp()
  }

  /** True while a drag-draw gesture still needs onDrawUp (even if tool flipped). */
  private isDrawGestureActive(): boolean {
    if (this.mode === 'draw' || this.preview || this.currentPath) return true
    if (
      this.dragStart &&
      (this.tool === 'rect' ||
        this.tool === 'ellipse' ||
        this.tool === 'line' ||
        this.tool === 'freehand')
    ) {
      return true
    }
    return false
  }

  /** End marquee / move / draw / pan — safe to call multiple times. */
  private handlePointerUp() {
    this.unbindGlobalPointerUp()
    this.releasePointerCaptureSafe()
    if (this.mode === 'pan') {
      this.mode = 'none'
      this.panStart = null
      this.viewCenterStart = null
      return
    }
    // Prefer finishing an in-progress draw even if tool flipped to select/shape
    // mid-gesture (e.g. React sync or a prior onDrawUp→setTool race).
    if (this.isDrawGestureActive()) {
      this.onDrawUp({} as paper.ToolEvent)
      return
    }
    if (this.tool === 'select' || this.tool === 'shape') {
      this.onSelectUp()
    } else {
      this.endPointerGesture(false)
    }
  }

  private endPointerGesture(clearMarqueePath: boolean) {
    if (clearMarqueePath) this.clearMarquee()
    else if (this.mode === 'marquee') this.clearMarquee()
    this.mode = 'none'
    this.dragStart = null
    this.panStart = null
    this.viewCenterStart = null
    this.moveBoundsStart = null
    this.movePointerStart = null
    this.moveOrigPositions = []
    this.origScalings = []
    this.didTransform = false
    this.gestureBefore = null
    this.vertexPath = null
    this.vertexIndex = -1
    this.handleDragKind = null
    this.shapeNodeStarts = []
    this.clearSmartGuides()
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
      if (h === 'vertex' || h === 'handle-in' || h === 'handle-out') {
        const vpath = handleHit.item.data.vertexPath as paper.Path | undefined
        const vidx = Number(handleHit.item.data.vertexIndex)
        if (vpath && Number.isFinite(vidx) && vpath.segments[vidx]) {
          this.mode = 'vertex'
          this.didTransform = false
          this.vertexPath = vpath
          this.vertexIndex = vidx
          this.dragStart = e.point.clone()
          this.handleDragKind =
            h === 'handle-in' ? 'in' : h === 'handle-out' ? 'out' : null
          if (h === 'vertex') {
            const already = this.shapeNodes.find(
              (n) => n.path === vpath && n.index === vidx,
            )
            if (e.modifiers.shift) {
              if (already) {
                this.shapeNodes = this.shapeNodes.filter(
                  (n) => !(n.path === vpath && n.index === vidx),
                )
              } else {
                this.shapeNodes = [...this.shapeNodes, { path: vpath, index: vidx }]
              }
            } else if (!already) {
              this.shapeNodes = [{ path: vpath, index: vidx }]
            }
            this.shapeNodeStarts = this.shapeNodes.map((n) => ({
              ref: n,
              point: n.path.segments[n.index].point.clone(),
            }))
            this.drawHandles()
          }
        }
        return
      }
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
      if (this.tool === 'shape') {
        if (!this.selected.includes(item)) {
          this.selectItems([item])
          this.shapeNodes = []
        }
        // Click empty of nodes: clear node selection
        this.shapeNodes = []
        this.drawHandles()
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
    } else if (
      this.mode === 'vertex' &&
      this.vertexPath &&
      this.vertexIndex >= 0
    ) {
      const exclude = [String(this.selected[0]?.data?.cfId || '')]
      const snapped = this.applySnap(e.point, exclude)
      if (this.handleDragKind === 'in') {
        const seg = this.vertexPath.segments[this.vertexIndex]
        if (seg) {
          seg.handleIn = snapped.subtract(seg.point)
          this.didTransform = true
          this.drawHandles()
        }
      } else if (this.handleDragKind === 'out') {
        const seg = this.vertexPath.segments[this.vertexIndex]
        if (seg) {
          seg.handleOut = snapped.subtract(seg.point)
          this.didTransform = true
          this.drawHandles()
        }
      } else if (this.shapeNodeStarts.length && this.dragStart) {
        const delta = snapped.subtract(this.dragStart)
        for (const s of this.shapeNodeStarts) {
          const seg = s.ref.path.segments[s.ref.index]
          if (seg) seg.point = s.point.add(delta)
        }
        this.didTransform = true
        this.drawHandles()
      } else {
        const seg = this.vertexPath.segments[this.vertexIndex]
        if (seg) {
          seg.point = snapped
          this.didTransform = true
          this.drawHandles()
        }
      }
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
      this.applyResize(pt, e.modifiers.shift)
      this.didTransform = true
      this.drawHandles()
    }
  }

  private applyResize(point: paper.Point, shift = false) {
    if (!this.startBounds || !this.resizeCorner) return
    const b = this.startBounds
    const corner = this.resizeCorner
    // Opposite edge/corner stays anchored (absolute from gesture start).
    let pivot: paper.Point
    let startCorner: paper.Point
    let lockX = false
    let lockY = false
    switch (corner) {
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
      case 'se':
        pivot = b.topLeft
        startCorner = b.bottomRight
        break
      case 'n':
        pivot = new paper.Point(b.center.x, b.bottom)
        startCorner = new paper.Point(b.center.x, b.top)
        lockX = true
        break
      case 's':
        pivot = new paper.Point(b.center.x, b.top)
        startCorner = new paper.Point(b.center.x, b.bottom)
        lockX = true
        break
      case 'w':
        pivot = new paper.Point(b.right, b.center.y)
        startCorner = new paper.Point(b.left, b.center.y)
        lockY = true
        break
      case 'e':
        pivot = new paper.Point(b.left, b.center.y)
        startCorner = new paper.Point(b.right, b.center.y)
        lockY = true
        break
      default:
        pivot = b.topLeft
        startCorner = b.bottomRight
    }
    const startDx = startCorner.x - pivot.x
    const startDy = startCorner.y - pivot.y
    const nowDx = point.x - pivot.x
    const nowDy = point.y - pivot.y
    // Signed ratio from gesture-start size — allows shrink (<1) and grow (>1).
    // Crossing the pivot would flip/mirror; clamp to a small positive scale instead.
    const minS = 0.05
    const maxS = 20
    let sx = lockX || startDx === 0 ? 1 : nowDx / startDx
    let sy = lockY || startDy === 0 ? 1 : nowDy / startDy
    if (sx < 0) sx = minS
    if (sy < 0) sy = minS
    sx = Math.max(minS, Math.min(maxS, sx))
    sy = Math.max(minS, Math.min(maxS, sy))
    // Shift = uniform (keep aspect), using the axis that moved more toward intent
    if (shift && !lockX && !lockY) {
      const u = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy
      sx = sy = u
    }
    for (const o of this.origScalings) {
      if (o.item.data.locked) continue
      o.item.scaling = o.scaling.clone()
      o.item.position = o.position.clone()
      o.item.scale(sx, sy, pivot)
    }
  }

  private onSelectUp() {
    if (this.mode === 'marquee') {
      if (this.marquee && this.dragStart) {
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
      }
      this.clearMarquee()
    } else if (
      (this.mode === 'move' ||
        this.mode === 'resize' ||
        this.mode === 'rotate' ||
        this.mode === 'vertex') &&
      this.gestureBefore
    ) {
      if (this.didTransform) {
        this.history.pushBefore(this.gestureBefore)
        this.dirty = true
      }
      this.gestureBefore = null
    }
    this.endPointerGesture(false)
    this.drawHandles()
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
    // Idempotent: Paper mouseup + window pointerup may both arrive.
    const hadGesture =
      this.mode === 'draw' ||
      !!this.preview ||
      !!this.currentPath ||
      !!this.dragStart
    if (!hadGesture) return

    if (this.currentPath) {
      // Freehand (commit even if tool flipped mid-gesture)
      if (this.currentPath.segments.length > 2) this.currentPath.simplify(2.5)
      if (this.currentPath.segments.length >= 2) {
        if (this.gestureBefore) this.history.pushBefore(this.gestureBefore)
        this.dirty = true
      } else {
        this.currentPath.remove()
      }
      this.currentPath = null
      this.gestureBefore = null
      // Stay on freehand — LightBurn-style continuous drawing
      this.deselectAll()
    } else if (
      this.preview &&
      this.polygonPoints.length === 0 &&
      (this.tool === 'rect' ||
        this.tool === 'ellipse' ||
        this.tool === 'line' ||
        this.mode === 'draw')
    ) {
      // Rect / ellipse / line preview → commit (or discard if tiny)
      if (this.preview.bounds.width < 1 && this.preview.bounds.height < 1) {
        this.preview.remove()
      } else {
        if (this.gestureBefore) this.history.pushBefore(this.gestureBefore)
        this.dirty = true
        // Leave committed path in doc; deselect so next drag starts a new shape
        // (handles under a draw tool would steal hit-testing).
      }
      this.preview = null
      this.gestureBefore = null
      this.deselectAll()
    }
    // polygon / text: only clear drag state; multi-click polygon keeps preview
    this.clearSmartGuides()
    this.mode = 'none'
    this.dragStart = null
    this.notify()
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

  private onDblClick = (e: MouseEvent) => {
    if (this.tool === 'polygon') {
      this.finishPolygon()
      return
    }
    const pt = this.clientToProject(e)
    const hit = this.hitDrawable(pt)
    if (
      hit &&
      (hit instanceof paper.Group || hit.data?.isGroup) &&
      this.tool === 'select'
    ) {
      this.enterIsolatedGroup(hit as paper.Group)
      return
    }
    // Corel-like: dblclick node → delete; dblclick segment → add at click
    if (this.tool === 'shape' || this.tool === 'select') {
      if (this.handleShapeDblClick(pt)) return
    }
  }

  /**
   * Corel Shape tool dblclick:
   * - on a node → delete that node
   * - on a segment → insert node at nearest point on the segment
   * Select tool: first dblclick on a path enters Shape mode; same add/delete rules.
   */
  private handleShapeDblClick(point: paper.Point): boolean {
    const nodeTol = 8 / paper.view.zoom
    const edgeTol = 10 / paper.view.zoom
    const editable = (item: paper.Item) => this.isEditableDrawable(item)

    const roots =
      this.tool === 'shape' && this.selected.length
        ? this.selected
        : this.docLayer.children

    const nearNode = findNearestNode(roots, point, nodeTol, editable)
    if (nearNode) {
      if (this.tool === 'select') {
        this.setTool('shape')
        this.selectItems([nearNode.root])
      }
      const before = this.snapshotDoc()
      const ok = deleteNodes([nearNode.ref])
      if (!ok) {
        this.status = 'Need at least 2–3 nodes to delete'
        this.notify()
        return true
      }
      this.history.pushBefore(before)
      this.dirty = true
      this.shapeNodes = []
      this.selectItems([nearNode.root])
      this.status = 'Node deleted'
      this.notify()
      return true
    }

    const hit = findNearestCurve(roots, point, edgeTol, editable)
    if (!hit) {
      // Dblclick path fill / body → enter Shape mode
      const item = this.hitDrawable(point)
      if (item && isPathLike(item) && this.tool === 'select') {
        this.setTool('shape')
        this.selectItems([item])
        this.status = 'Shape tool — edit nodes (A)'
        this.notify()
        return true
      }
      return false
    }

    if (this.tool === 'select') {
      this.setTool('shape')
      this.selectItems([hit.root])
    } else if (!this.selected.includes(hit.root)) {
      this.selectItems([hit.root])
    }

    const before = this.snapshotDoc()
    const seg = insertNodeAtClick(hit.curve, point)
    if (!seg) return false
    this.history.pushBefore(before)
    this.dirty = true
    const idx = hit.path.segments.indexOf(seg)
    if (idx >= 0) this.shapeNodes = [{ path: hit.path, index: idx }]
    this.drawHandles()
    this.status = 'Node added on segment'
    this.notify()
    return true
  }

  private isEditableDrawable(item: paper.Item): boolean {
    if (!item || isGuide(item) || !item.visible || item.data?.locked) return false
    if (item.data?.isHandle || item.data?.isPage || item.data?.isRegMark) return false
    const layerId = item.data?.layerId as string | undefined
    if (layerId) {
      const layer = this.layers.find((l) => l.id === layerId)
      if (layer && (!layer.visible || layer.locked)) return false
    }
    return isPathLike(item)
  }



  deleteSelectedNodes() {
    if (!this.shapeNodes.length) return
    const before = this.snapshotDoc()
    if (!deleteNodes(this.shapeNodes)) {
      this.status = 'Cannot delete — path needs more nodes'
      this.notify()
      return
    }
    this.history.pushBefore(before)
    this.dirty = true
    this.shapeNodes = []
    this.drawHandles()
    this.status = 'Node(s) deleted'
    this.notify()
  }

  shapeAddNodeAt(point: paper.Point) {
    const hit = findNearestCurve(
      this.selected.length ? this.selected : this.docLayer.children,
      point,
      12 / paper.view.zoom,
      (i) => this.isEditableDrawable(i),
    )
    if (!hit) return
    const before = this.snapshotDoc()
    const seg = insertNodeAtClick(hit.curve, point)
    if (!seg) return
    this.history.pushBefore(before)
    this.dirty = true
    const idx = hit.path.segments.indexOf(seg)
    if (idx >= 0) this.shapeNodes = [{ path: hit.path, index: idx }]
    this.selectItems([hit.root])
    this.drawHandles()
    this.status = 'Node added'
    this.notify()
  }

  shapeSegmentsToLine() {
    if (!this.shapeNodes.length) return
    const before = this.snapshotDoc()
    if (!segmentsToLine(this.shapeNodes)) return
    this.history.pushBefore(before)
    this.dirty = true
    this.drawHandles()
    this.status = 'To line'
    this.notify()
  }

  shapeSegmentsToCurve() {
    if (!this.shapeNodes.length) return
    const before = this.snapshotDoc()
    if (!segmentsToCurve(this.shapeNodes)) return
    this.history.pushBefore(before)
    this.dirty = true
    this.drawHandles()
    this.status = 'To curve'
    this.notify()
  }

  shapeNodesToCusp() {
    if (!this.shapeNodes.length) return
    const before = this.snapshotDoc()
    if (!nodesToCusp(this.shapeNodes)) return
    this.history.pushBefore(before)
    this.dirty = true
    this.drawHandles()
    this.status = 'Cusp node'
    this.notify()
  }

  shapeNodesToSmooth() {
    if (!this.shapeNodes.length) return
    const before = this.snapshotDoc()
    if (!nodesToSmooth(this.shapeNodes)) return
    this.history.pushBefore(before)
    this.dirty = true
    this.drawHandles()
    this.status = 'Smooth node'
    this.notify()
  }

  shapeBreakAtNode() {
    if (this.shapeNodes.length !== 1) {
      this.status = 'Select one node to break'
      this.notify()
      return
    }
    const { path, index } = this.shapeNodes[0]
    const before = this.snapshotDoc()
    const other = breakAtNode(path, index)
    this.history.pushBefore(before)
    this.dirty = true
    if (other) {
      // Match style of original
      other.strokeColor = path.strokeColor
      other.strokeWidth = path.strokeWidth
      other.fillColor = path.fillColor
      other.data = { ...path.data, cfId: undefined }
      ensureMeta(other, 'Path')
      this.attachToActiveLayer(other)
      this.docLayer.addChild(other)
      this.selectItems([path, other])
    }
    this.shapeNodes = []
    this.drawHandles()
    this.status = 'Broke path at node'
    this.notify()
  }

  shapeJoinEndpoints() {
    this.joinSelectedOpenPaths()
  }

  /** Join selected open paths end-to-end when endpoints are within joinTolMm. */
  joinSelectedOpenPaths(tolMm?: number) {
    const tol =
      Math.max(
        6 / paper.view.zoom,
        (tolMm ?? this.joinTolMm) * PX_PER_MM,
      )
    const roots = this.selected.filter((i) => !i.data.locked && i.visible)
    const paths = roots.flatMap((i) => collectPaths(i)).filter((p) => !p.closed)
    if (paths.length < 2) {
      this.status = 'Select 2+ open paths to Join'
      this.notify()
      return
    }
    const before = this.snapshotDoc()
    const { joined, mergeCount } = joinOpenPathChain(paths, tol)
    if (!mergeCount) {
      this.status = `Endpoints farther than ${this.joinTolMm} mm — move ends closer or raise tolerance`
      this.notify()
      return
    }
    // Remove empty parents (CompoundPath with no children, etc.)
    for (const r of roots) {
      if (r instanceof paper.CompoundPath && r.children.length === 0) r.remove()
      else if (r instanceof paper.Path && !r.segments.length) r.remove()
    }
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems(joined.filter((p) => p.parent))
    this.shapeNodes = []
    this.drawHandles()
    this.status = `Joined ${mergeCount} connection(s) (tol ${this.joinTolMm} mm)`
    this.notify()
  }

  setJoinToleranceMm(mm: number) {
    this.joinTolMm = Math.max(0.05, Math.min(20, mm))
  }

  getJoinToleranceMm() {
    return this.joinTolMm
  }

  /** Weld = boolean unite (closed paths). */
  weldSelected() {
    this.booleanSelected('unite')
  }

  /** Clip = intersect (keep overlap). First selected = subject. */
  clipSelected() {
    this.booleanSelected('intersect')
  }

  groupSelected() {
    const items = this.selected.filter(
      (i) => !i.data.locked && i.visible && !isGuide(i),
    )
    if (items.length < 2) {
      this.status = 'Select 2+ objects to Group'
      this.notify()
      return
    }
    // Don't nest already-isolated partials oddly — leave isolate first
    this.leaveIsolatedGroup(false)
    const before = this.snapshotDoc()
    this.docLayer.activate()
    const g = new paper.Group()
    g.data.isGroup = true
    // Preserve layer from first item
    const layerId = items[0].data?.layerId
    for (const it of items) {
      g.addChild(it)
    }
    if (layerId) g.data.layerId = layerId
    ensureMeta(g, 'Group')
    this.attachToActiveLayer(g)
    if (layerId) g.data.layerId = layerId
    this.docLayer.addChild(g)
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems([g])
    this.status = `Grouped ${items.length} objects (⌘G)`
    this.notify()
  }

  ungroupSelected() {
    const groups = this.selected.filter(
      (i) =>
        (i instanceof paper.Group || i.data?.isGroup) &&
        !i.data?.isHandle &&
        !isGuide(i),
    ) as paper.Group[]
    if (!groups.length) {
      this.status = 'Select a group to Ungroup'
      this.notify()
      return
    }
    this.leaveIsolatedGroup(false)
    const before = this.snapshotDoc()
    const released: paper.Item[] = []
    for (const g of groups) {
      const kids = [...g.children]
      const layerId = g.data?.layerId
      for (const c of kids) {
        this.docLayer.addChild(c)
        if (layerId && c.data) c.data.layerId = layerId
        released.push(c)
      }
      g.remove()
    }
    this.history.pushBefore(before)
    this.dirty = true
    this.selectItems(released)
    this.status = `Ungrouped → ${released.length} object(s)`
    this.notify()
  }

  canUngroup(): boolean {
    return this.selected.some(
      (i) =>
        (i instanceof paper.Group || i.data?.isGroup) &&
        !i.data?.isHandle &&
        !isGuide(i),
    )
  }

  enterIsolatedGroup(g: paper.Group) {
    this.isolatedGroup = g
    const kids = [...g.children].filter((c) => c.visible && !c.data?.locked)
    this.selectItems(kids.length ? kids : [g])
    this.status = 'Inside group — Esc to leave · edit children'
    this.notify()
  }

  leaveIsolatedGroup(reselect = true) {
    const g = this.isolatedGroup
    if (!g) return
    this.isolatedGroup = null
    if (reselect && g.parent) this.selectItems([g])
    this.status = 'Left group'
    this.notify()
  }

  hasClipboard(): boolean {
    return this.clipboard.length > 0
  }

  /** Build right-click menu actions for a project point (null = no menu / empty canvas). */
  getContextMenuActions(point: paper.Point): ContextMenuAction[] | null {
    const nodeTol = 8 / paper.view.zoom
    const nearNode = findNearestNode(
      this.selected.length ? this.selected : this.docLayer.children,
      point,
      nodeTol,
      (i) => this.isEditableDrawable(i),
    )
    const item = this.hitDrawable(point)
    if (!item && !nearNode && !this.selected.length) return null

    if (item && !this.selected.includes(item) && !nearNode) {
      this.selectItems([item])
    }

    const actions: ContextMenuAction[] = []
    const hasSel = this.selected.length > 0
    const nodeMode = this.tool === 'shape' || !!nearNode

    if (nearNode) {
      if (this.tool !== 'shape') this.setTool('shape')
      if (!this.shapeNodes.some((n) => n.path === nearNode.ref.path && n.index === nearNode.ref.index)) {
        this.shapeNodes = [nearNode.ref]
        this.selectItems([nearNode.root])
        this.drawHandles()
      }
      actions.push({ id: 'node-delete', label: 'Delete node' })
      actions.push({ id: 'node-to-line', label: 'To line' })
      actions.push({ id: 'node-to-curve', label: 'To curve' })
      actions.push({ id: 'node-cusp', label: 'Cusp' })
      actions.push({ id: 'node-smooth', label: 'Smooth' })
      actions.push({ id: 'node-break', label: 'Break at node' })
      actions.push({ id: 'sep-n', label: '', separator: true })
    } else if (hasSel && isPathLike(this.selected[0])) {
      actions.push({ id: 'enter-shape', label: 'Edit nodes (Shape tool)' })
      actions.push({ id: 'node-add', label: 'Add node here' })
      actions.push({ id: 'sep-s', label: '', separator: true })
    }

    actions.push(
      { id: 'cut', label: 'Cut', disabled: !hasSel },
      { id: 'copy', label: 'Copy', disabled: !hasSel },
      { id: 'paste', label: 'Paste', disabled: !this.hasClipboard() },
      { id: 'duplicate', label: 'Duplicate', disabled: !hasSel },
      { id: 'delete', label: 'Delete', disabled: !hasSel },
      { id: 'sep1', label: '', separator: true },
      { id: 'front', label: 'Bring to front', disabled: !hasSel },
      { id: 'back', label: 'Send to back', disabled: !hasSel },
      { id: 'sep2', label: '', separator: true },
      {
        id: 'lock',
        label: this.selected.some((i) => i.data.locked) ? 'Unlock' : 'Lock',
        disabled: !hasSel,
      },
    )

    if (this.layers.length > 1 && hasSel) {
      actions.push({ id: 'sep3', label: '', separator: true })
      for (const layer of this.layers) {
        actions.push({
          id: `layer:${layer.id}`,
          label: `Move to layer: ${layer.name}`,
        })
      }
    }

    const openCount = this.selected
      .flatMap((i) => collectPaths(i))
      .filter((p) => !p.closed).length
    const canBool = this.canBoolean()

    actions.push({ id: 'sep4', label: '', separator: true })
    actions.push({
      id: 'join',
      label: `Join open paths (≤${this.joinTolMm} mm)`,
      disabled: openCount < 2,
    })
    actions.push({ id: 'weld', label: 'Weld / Unite', disabled: !canBool })
    actions.push({
      id: 'clip',
      label: 'Clip (Intersect)',
      disabled: !canBool,
    })
    actions.push({
      id: 'subtract',
      label: 'Subtract (first − rest)',
      disabled: !canBool,
    })
    actions.push({
      id: 'exclude',
      label: 'Exclude (XOR)',
      disabled: !canBool,
    })
    actions.push({ id: 'sep5', label: '', separator: true })
    actions.push({
      id: 'group',
      label: 'Group',
      disabled: this.selected.length < 2,
    })
    actions.push({
      id: 'ungroup',
      label: 'Ungroup',
      disabled: !this.canUngroup(),
    })
    if (hasSel) {
      actions.push({ id: 'nest', label: 'Nest selection' })
    }

    void nodeMode
    return actions
  }

  runContextMenuAction(id: string, point?: { x: number; y: number } | paper.Point) {
    switch (id) {
      case 'cut':
        this.cutSelected()
        break
      case 'copy':
        this.copySelected()
        break
      case 'paste':
        void this.pasteClipboard()
        break
      case 'duplicate':
        this.duplicateSelected()
        break
      case 'delete':
        this.deleteSelected()
        break
      case 'front':
        this.bringSelectionToFront()
        break
      case 'back':
        this.sendSelectionToBack()
        break
      case 'lock':
        this.toggleSelectionLocked()
        break
      case 'enter-shape':
        this.setTool('shape')
        break
      case 'node-add':
        if (point) this.shapeAddNodeAt(new paper.Point(point.x, point.y))
        break
      case 'node-delete':
        this.deleteSelectedNodes()
        break
      case 'node-to-line':
        this.shapeSegmentsToLine()
        break
      case 'node-to-curve':
        this.shapeSegmentsToCurve()
        break
      case 'node-cusp':
        this.shapeNodesToCusp()
        break
      case 'node-smooth':
        this.shapeNodesToSmooth()
        break
      case 'node-break':
        this.shapeBreakAtNode()
        break
      case 'join':
        this.joinSelectedOpenPaths()
        break
      case 'weld':
        this.weldSelected()
        break
      case 'clip':
        this.clipSelected()
        break
      case 'subtract':
        this.booleanSelected('subtract')
        break
      case 'exclude':
        this.booleanSelected('exclude')
        break
      case 'group':
        this.groupSelected()
        break
      case 'ungroup':
        this.ungroupSelected()
        break
      case 'nest':
        this.nestItems('selection', { gapMm: 2, marginMm: 2, allowRotate90: true })
        break
      default:
        if (id.startsWith('layer:')) {
          this.moveSelectionToLayer(id.slice(6))
        }
    }
  }

  private onMouseMove = (e: MouseEvent) => {
    const pt = this.clientToProject(e)
    this.cursor = {
      xMm: pt.x / PX_PER_MM,
      yMm: pt.y / PX_PER_MM,
      xView: e.clientX,
      yView: e.clientY,
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
    // Keep the project point under the cursor stable across zoom
    const before = this.clientToProject(e)
    paper.view.zoom = next
    const after = this.clientToProject(e)
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
      if (this.tool === 'shape' && this.shapeNodes.length) {
        this.deleteSelectedNodes()
      } else {
        this.deleteSelected()
      }
      e.preventDefault()
    }
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'd') {
      this.duplicateSelected()
      e.preventDefault()
    }
    if (mod && e.key.toLowerCase() === 'g' && e.shiftKey) {
      this.ungroupSelected()
      e.preventDefault()
    } else if (mod && e.key.toLowerCase() === 'g') {
      this.groupSelected()
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
      if (this.isolatedGroup) {
        this.leaveIsolatedGroup(true)
        e.preventDefault()
        return
      }
      const drawing =
        this.tool !== 'select' ||
        this.polygonPoints.length > 0 ||
        !!this.preview ||
        !!this.currentPath ||
        this.mode === 'marquee'
      this.polygonPoints = []
      this.clearPreview()
      this.endPointerGesture(true)
      this.unbindGlobalPointerUp()
      if (drawing && this.tool !== 'select' && this.tool !== 'shape') {
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
    if (this.tool === 'shape' && !mod && !e.altKey) {
      if (e.key.toLowerCase() === 'c') {
        this.shapeNodesToCusp()
        e.preventDefault()
      }
      if (e.key.toLowerCase() === 's') {
        this.shapeNodesToSmooth()
        e.preventDefault()
      }
    }
    const map: Record<string, Tool> = {
      v: 'select',
      a: 'shape',
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

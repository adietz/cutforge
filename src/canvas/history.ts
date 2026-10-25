/** Document JSON snapshots for undo/redo. */
export class HistoryStack {
  private undoStack: string[] = []
  private redoStack: string[] = []
  private readonly max: number

  constructor(max = 60) {
    this.max = max
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  /** Record state *before* a mutation. Clears redo. */
  pushBefore(snapshot: string) {
    if (!snapshot) return
    const last = this.undoStack[this.undoStack.length - 1]
    if (last === snapshot) return
    this.undoStack.push(snapshot)
    if (this.undoStack.length > this.max) this.undoStack.shift()
    this.redoStack = []
  }

  undo(current: string): string | null {
    if (!this.undoStack.length) return null
    this.redoStack.push(current)
    return this.undoStack.pop() ?? null
  }

  redo(current: string): string | null {
    if (!this.redoStack.length) return null
    this.undoStack.push(current)
    return this.redoStack.pop() ?? null
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
  }
}

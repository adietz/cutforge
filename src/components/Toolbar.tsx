import type { Tool } from '../types'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'V' },
  { id: 'shape', label: 'Shape', hint: 'A' },
  { id: 'rect', label: 'Rect', hint: 'R' },
  { id: 'ellipse', label: 'Ellipse', hint: 'E' },
  { id: 'line', label: 'Line', hint: 'L' },
  { id: 'polygon', label: 'Polygon', hint: 'P' },
  { id: 'freehand', label: 'Freehand', hint: 'F' },
  { id: 'text', label: 'Text', hint: 'T' },
]

export function Toolbar({
  tool,
  onTool,
}: {
  tool: Tool
  onTool: (t: Tool) => void
}) {
  return (
    <aside className="toolbar">
      <div className="brand">CF</div>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'tool active' : 'tool'}
          title={`${t.label} (${t.hint})`}
          onClick={() => onTool(t.id)}
        >
          <span className="tool-label">{t.label}</span>
          <span className="tool-hint">{t.hint}</span>
        </button>
      ))}
    </aside>
  )
}

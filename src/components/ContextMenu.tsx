import { useEffect, useRef } from 'react'
import type { ContextMenuAction } from '../types'

export function ContextMenu({
  x,
  y,
  items,
  onAction,
  onClose,
}: {
  x: number
  y: number
  items: ContextMenuAction[]
  onAction: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose])

  // Keep on screen
  const pad = 8
  const maxW = 240
  const left = Math.min(x, window.innerWidth - maxW - pad)
  const top = Math.min(y, window.innerHeight - 40)

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left, top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} className="context-menu-sep" />
        ) : (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            className="context-menu-item"
            disabled={!!it.disabled}
            onClick={() => {
              if (it.disabled) return
              onAction(it.id)
              onClose()
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  )
}

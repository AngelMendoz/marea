import { useEffect } from 'react'
import { useContextMenu } from '../contextMenu'

export function ContextMenu(): JSX.Element | null {
  const { open, x, y, items, close } = useContextMenu()

  useEffect(() => {
    if (!open) return
    const onDown = (): void => close()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onDown)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onDown)
    }
  }, [open, close])

  if (!open) return null

  // Evitar que el menú se salga de la ventana.
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - items.length * 30 - 12)
  }

  return (
    <div className="ctx-menu" style={style} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="ctx-divider" />
        ) : (
          <button
            key={i}
            className={`ctx-item${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              it.onClick?.()
              close()
            }}
          >
            {it.label}
          </button>
        )
      )}
    </div>
  )
}

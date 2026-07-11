import { RotateCcw, TerminalSquare, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { bridge } from '../bridge'
import { loadTerminalSessions, useTerminalPanel } from '../terminal'
import { useStore } from '../store'

/** Panel inferior acoplable con la terminal del repo activo.
 *  Cada repo/pestaña conserva su propia sesión y scrollback. */
export function TerminalPanel(): JSX.Element | null {
  const open = useTerminalPanel((s) => s.open)
  const close = useTerminalPanel((s) => s.close)
  const repo = useStore((s) => s.repo)
  const hostRef = useRef<HTMLDivElement>(null)
  // Fuerza re-montar la sesión tras un Reiniciar.
  const [generation, setGeneration] = useState(0)

  const path = repo?.path

  useEffect(() => {
    if (!open || !path || !hostRef.current) return
    const container = hostRef.current
    // El módulo de xterm se carga bajo demanda; la limpieza espera a que llegue.
    let cancelled = false
    let teardown: (() => void) | undefined

    void loadTerminalSessions().then((mod) => {
      if (cancelled || !hostRef.current) return
      const sess = mod.getOrCreateSession(path)
      container.appendChild(sess.el)

      const applySize = (): void => {
        sess.fit.fit()
        if (sess.id >= 0) void bridge.termResize(sess.id, sess.term.cols, sess.term.rows)
      }
      // Ajusta al layout ya pintado y en cada cambio de tamaño del panel.
      const raf = requestAnimationFrame(applySize)
      const ro = new ResizeObserver(applySize)
      ro.observe(container)
      sess.term.focus()

      teardown = () => {
        cancelAnimationFrame(raf)
        ro.disconnect()
        if (sess.el.parentElement === container) container.removeChild(sess.el)
      }
    })

    return () => {
      cancelled = true
      teardown?.()
    }
  }, [open, path, generation])

  if (!open || !repo) return null

  return (
    <div className="terminal-dock">
      <div className="term-head">
        <TerminalSquare size={14} color="var(--accent)" />
        <span className="term-title">Terminal</span>
        <span className="term-path" title={repo.path}>
          {repo.name}
        </span>
        <div className="term-tools">
          <button
            className="mini icon"
            title="Reiniciar el shell"
            onClick={() => {
              // El panel está abierto → el módulo ya está cargado (resuelve al instante).
              if (path) void loadTerminalSessions().then((m) => m.restartTerminal(path))
              setGeneration((g) => g + 1)
            }}
          >
            <RotateCcw size={14} />
          </button>
          <button className="mini icon" title="Cerrar terminal" onClick={close}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="term-body" ref={hostRef} />
    </div>
  )
}

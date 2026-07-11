import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { bridge } from './bridge'
import { registerSessionDisposer } from './terminal'

// Parte pesada de la terminal (xterm + addon + CSS): se carga la primera vez
// que se abre el panel. `terminal.ts` solo guarda el estado del panel.

/** Sesión de terminal viva de un repo. El elemento DOM se conserva para que
 *  el scrollback sobreviva a abrir/cerrar el panel y a cambiar de pestaña. */
export interface TermSession {
  /** id del pty en el proceso main (-1 mientras se crea). */
  id: number
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
  exited: boolean
}

const sessions = new Map<string, TermSession>()
let listenersReady = false

// Permite a `store.closeTab` cerrar la sesión de un repo sin conocer xterm.
registerSessionDisposer(disposeTerminal)

/** Colores del tema actual leídos de las variables CSS de la app. */
function themeFromCss(): { background: string; foreground: string; cursor: string } {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback
  return {
    background: v('--bg-app', '#141f28'),
    foreground: v('--text', '#d5e0e8'),
    cursor: v('--accent', '#1fb6d6')
  }
}

function ensureListeners(): void {
  if (listenersReady) return
  listenersReady = true
  bridge.onTermData((id, data) => {
    for (const s of sessions.values()) {
      if (s.id === id) s.term.write(data)
    }
  })
  bridge.onTermExit((id, exitCode) => {
    for (const s of sessions.values()) {
      if (s.id === id) {
        s.exited = true
        s.term.write(`\r\n\x1b[2m[el shell terminó con código ${exitCode} — Reiniciar para abrir otro]\x1b[0m\r\n`)
      }
    }
  })
}

/** Devuelve la sesión del repo, creando el pty si es la primera vez. */
export function getOrCreateSession(repoPath: string): TermSession {
  const existing = sessions.get(repoPath)
  if (existing) return existing

  ensureListeners()
  const css = getComputedStyle(document.documentElement)
  const term = new Terminal({
    fontFamily: css.getPropertyValue('--mono').trim() || 'Consolas, monospace',
    fontSize: 12.5,
    cursorBlink: true,
    scrollback: 4000,
    theme: themeFromCss()
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  const el = document.createElement('div')
  el.className = 'term-host'
  term.open(el)

  const session: TermSession = { id: -1, term, fit, el, exited: false }
  sessions.set(repoPath, session)

  void bridge.termCreate(repoPath, term.cols, term.rows).then((id) => {
    session.id = id
  })
  term.onData((data) => {
    if (session.id >= 0 && !session.exited) void bridge.termInput(session.id, data)
  })
  return session
}

/** Cierra el pty y descarta la sesión del repo (al cerrar la pestaña). */
export function disposeTerminal(repoPath: string): void {
  const s = sessions.get(repoPath)
  if (!s) return
  sessions.delete(repoPath)
  if (s.id >= 0) void bridge.termDispose(s.id)
  s.term.dispose()
  s.el.remove()
}

/** Mata el shell actual del repo y crea uno nuevo (botón Reiniciar). */
export function restartTerminal(repoPath: string): TermSession {
  disposeTerminal(repoPath)
  return getOrCreateSession(repoPath)
}

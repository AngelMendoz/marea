import { ipcMain, type WebContents } from 'electron'
import { spawn, type IPty } from 'node-pty'

/** Sesiones de pseudo-terminal activas: id → pty y su ventana. */
interface Session {
  pty: IPty
  wc: WebContents
}

const sessions = new Map<number, Session>()
let nextId = 1

/** Shell por defecto del sistema operativo. */
function defaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || 'bash'
}

function dispose(id: number): void {
  const s = sessions.get(id)
  if (!s) return
  sessions.delete(id)
  try {
    s.pty.kill()
  } catch {
    /* proceso ya terminado */
  }
}

/** Cierra todos los pty de una ventana (al cerrarla no quedan huérfanos). */
function disposeForWebContents(wc: WebContents): void {
  for (const [id, s] of sessions) {
    if (s.wc === wc) dispose(id)
  }
}

export function registerTerminalIpc(): void {
  /** Crea un pty con el shell del sistema en la carpeta del repo. */
  ipcMain.handle('term:create', (e, repoPath: string, cols?: number, rows?: number) => {
    const id = nextId++
    const wc = e.sender
    const pty = spawn(defaultShell(), [], {
      name: 'xterm-256color',
      cwd: repoPath,
      env: process.env as Record<string, string>,
      cols: cols || 80,
      rows: rows || 24
    })
    sessions.set(id, { pty, wc })

    pty.onData((data) => {
      if (!wc.isDestroyed()) wc.send('term:data', id, data)
    })
    pty.onExit(({ exitCode }) => {
      sessions.delete(id)
      if (!wc.isDestroyed()) wc.send('term:exit', id, exitCode)
    })
    // Si la ventana muere, no dejar shells colgados.
    wc.once('destroyed', () => disposeForWebContents(wc))
    return id
  })

  ipcMain.handle('term:input', (_e, id: number, data: string) => {
    sessions.get(id)?.pty.write(data)
  })

  ipcMain.handle('term:resize', (_e, id: number, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) {
      try {
        sessions.get(id)?.pty.resize(cols, rows)
      } catch {
        /* pty terminando */
      }
    }
  })

  ipcMain.handle('term:dispose', (_e, id: number) => dispose(id))
}

/** Mata todos los pty al salir de la app. */
export function disposeAllTerminals(): void {
  for (const id of [...sessions.keys()]) dispose(id)
}

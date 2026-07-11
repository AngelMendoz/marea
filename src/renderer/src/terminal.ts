import { create } from 'zustand'

// Estado del panel de terminal; el módulo con xterm se carga bajo demanda
// para que el arranque no pague xterm+CSS si la terminal nunca se abre.

/** Estado del panel de terminal. */
interface TerminalPanelState {
  open: boolean
  toggle: () => void
  close: () => void
}

export const useTerminalPanel = create<TerminalPanelState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false })
}))

export type TerminalSessionModule = typeof import('./terminalSession')

let modulePromise: Promise<TerminalSessionModule> | null = null

/** Carga (una sola vez) el módulo pesado de sesiones xterm. Se invoca al abrir
 *  el panel; las llamadas siguientes reutilizan la promesa ya resuelta. */
export function loadTerminalSessions(): Promise<TerminalSessionModule> {
  if (!modulePromise) modulePromise = import('./terminalSession')
  return modulePromise
}

// El módulo pesado registra aquí su `disposeTerminal` cuando se carga, para que
// `store.closeTab` pueda cerrar una sesión sin importar xterm.
let sessionDisposer: ((repoPath: string) => void) | null = null

/** Lo llama `terminalSession` al cargarse. */
export function registerSessionDisposer(fn: (repoPath: string) => void): void {
  sessionDisposer = fn
}

/** Cierra la sesión de un repo si la terminal llegó a abrirse alguna vez. Si el
 *  módulo pesado nunca se cargó no hay sesión que cerrar (y no se carga xterm). */
export function disposeTerminal(repoPath: string): void {
  sessionDisposer?.(repoPath)
}

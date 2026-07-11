import { create } from 'zustand'
import type { PullMode } from '@shared/types'
import { bridge } from './bridge'

/** Niveles de zoom disponibles (factor 1 = 100%). */
export const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.5, 1.75, 2]

/** Acciones que pueden dispararse con un atajo de teclado. */
export type ShortcutAction =
  | 'fetch'
  | 'pull'
  | 'push'
  | 'newBranch'
  | 'stash'
  | 'stashPop'
  | 'toggleSidebar'
  | 'toggleRightPanel'
  | 'toggleTerminal'
  | 'toggleTheme'
  | 'openSettings'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  fetch: 'Fetch',
  pull: 'Pull',
  push: 'Push',
  newBranch: 'Nueva rama',
  stash: 'Guardar en stash',
  stashPop: 'Stash pop',
  toggleSidebar: 'Mostrar/ocultar panel izquierdo',
  toggleRightPanel: 'Mostrar/ocultar panel derecho',
  toggleTerminal: 'Mostrar/ocultar terminal',
  toggleTheme: 'Cambiar tema',
  openSettings: 'Abrir preferencias',
  zoomIn: 'Acercar (zoom +)',
  zoomOut: 'Alejar (zoom −)',
  zoomReset: 'Restablecer zoom'
}

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  fetch: 'Ctrl+Shift+F',
  pull: 'Ctrl+Shift+L',
  push: 'Ctrl+Shift+P',
  newBranch: 'Ctrl+B',
  stash: 'Ctrl+Shift+S',
  stashPop: 'Ctrl+Shift+O',
  toggleSidebar: 'Ctrl+K',
  toggleRightPanel: 'Ctrl+J',
  toggleTerminal: 'Ctrl+T',
  toggleTheme: '',
  openSettings: 'Ctrl+,',
  zoomIn: 'Ctrl+=',
  zoomOut: 'Ctrl+-',
  zoomReset: 'Ctrl+0'
}

/** Combos que usa el sistema/Electron y no deben reasignarse. */
const RESERVED_COMBOS = new Set(['Ctrl+W', 'Ctrl+Q', 'Alt+F4', 'Ctrl+Shift+I', 'F11'])

/** Convierte un KeyboardEvent en un combo 'Ctrl+Shift+X' normalizado.
 *  Devuelve '' para pulsaciones sin tecla principal (solo modificadores). */
export function comboFromEvent(e: KeyboardEvent): string {
  const key = e.key
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return ''
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  // Tecla principal normalizada: letras sueltas en mayúscula para mostrar/comparar.
  parts.push(key.length === 1 ? key.toUpperCase() : key)
  return parts.join('+')
}

export function isReservedCombo(combo: string): boolean {
  return RESERVED_COMBOS.has(combo)
}

interface PersistedSettings {
  zoom: number
  showSidebar: boolean
  showRightPanel: boolean
  sidebarWidth: number
  pullMode: PullMode
  /** Minutos entre auto-fetch (0 = desactivado). */
  autoFetchMinutes: number
  /** Comando del editor externo ('' = aplicación por defecto del sistema). */
  externalEditor: string
  /** Ruta del ejecutable git ('' = el del PATH). Se reaplica al arrancar. */
  gitPath: string
  shortcuts: Record<ShortcutAction, string>
}

const DEFAULTS: PersistedSettings = {
  zoom: 1,
  showSidebar: true,
  showRightPanel: true,
  sidebarWidth: 0, // 0 = ancho fluido por defecto (clamp del CSS)
  pullMode: 'merge',
  autoFetchMinutes: 0,
  externalEditor: '',
  gitPath: '',
  shortcuts: { ...DEFAULT_SHORTCUTS }
}

function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem('marea-settings')
    if (!raw) return { ...DEFAULTS }
    const saved = JSON.parse(raw) as Partial<PersistedSettings>
    return {
      ...DEFAULTS,
      ...saved,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(saved.shortcuts ?? {}) }
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(s: PersistedSettings): void {
  try {
    localStorage.setItem(
      'marea-settings',
      JSON.stringify({
        zoom: s.zoom,
        showSidebar: s.showSidebar,
        showRightPanel: s.showRightPanel,
        sidebarWidth: s.sidebarWidth,
        pullMode: s.pullMode,
        autoFetchMinutes: s.autoFetchMinutes,
        externalEditor: s.externalEditor,
        gitPath: s.gitPath,
        shortcuts: s.shortcuts
      })
    )
  } catch {
    /* sin almacenamiento */
  }
}

/** Aplica el zoom a la ventana: zoomFactor en Electron, CSS en navegador. */
function applyZoom(zoom: number): void {
  if (bridge.isElectron) {
    void window.api!.window.setZoom(zoom)
  } else {
    ;(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(zoom)
  }
}

interface SettingsState extends PersistedSettings {
  /** Panel de preferencias abierto. */
  open: boolean
  openPanel: () => void
  closePanel: () => void

  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  toggleSidebar: () => void
  toggleRightPanel: () => void
  setSidebarWidth: (px: number) => void
  setPullMode: (mode: PullMode) => void
  setAutoFetchMinutes: (min: number) => void
  setExternalEditor: (cmd: string) => void
  setGitPath: (path: string) => void
  /** Reasigna un atajo. Devuelve la acción en conflicto si el combo ya se usa. */
  setShortcut: (action: ShortcutAction, combo: string) => ShortcutAction | null
  resetShortcuts: () => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  open: false,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),

  setZoom: (zoom) => {
    const z = Math.min(2, Math.max(0.5, zoom))
    applyZoom(z)
    set({ zoom: z })
    persist(get())
  },
  zoomIn: () => {
    const { zoom, setZoom } = get()
    const next = ZOOM_LEVELS.find((l) => l > zoom + 0.001)
    setZoom(next ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1])
  },
  zoomOut: () => {
    const { zoom, setZoom } = get()
    const prev = [...ZOOM_LEVELS].reverse().find((l) => l < zoom - 0.001)
    setZoom(prev ?? ZOOM_LEVELS[0])
  },

  toggleSidebar: () => {
    set((s) => ({ showSidebar: !s.showSidebar }))
    persist(get())
  },
  toggleRightPanel: () => {
    set((s) => ({ showRightPanel: !s.showRightPanel }))
    persist(get())
  },
  setSidebarWidth: (px) => {
    set({ sidebarWidth: px === 0 ? 0 : Math.min(420, Math.max(170, px)) })
    persist(get())
  },
  setPullMode: (pullMode) => {
    set({ pullMode })
    persist(get())
  },
  setAutoFetchMinutes: (autoFetchMinutes) => {
    set({ autoFetchMinutes })
    persist(get())
  },
  setExternalEditor: (externalEditor) => {
    set({ externalEditor: externalEditor.trim() })
    persist(get())
  },
  setGitPath: (gitPath) => {
    set({ gitPath: gitPath.trim() })
    persist(get())
  },

  setShortcut: (action, combo) => {
    const { shortcuts } = get()
    if (combo) {
      const clash = (Object.keys(shortcuts) as ShortcutAction[]).find(
        (a) => a !== action && shortcuts[a] === combo
      )
      if (clash) return clash
    }
    set({ shortcuts: { ...shortcuts, [action]: combo } })
    persist(get())
    return null
  },
  resetShortcuts: () => {
    set({ shortcuts: { ...DEFAULT_SHORTCUTS } })
    persist(get())
  }
}))

/** Reaplica al arrancar las preferencias que viven fuera del renderer:
 *  el zoom (Electron abre siempre al 100%) y el ejecutable git elegido. */
export function applyStartupSettings(): void {
  const { zoom, gitPath } = useSettings.getState()
  if (zoom !== 1) applyZoom(zoom)
  if (gitPath && bridge.isElectron) {
    void bridge.setGitBinary(gitPath).catch(() => {
      // El binario guardado ya no existe: vuelve al git del PATH.
      useSettings.getState().setGitPath('')
    })
  }
}

import { useEffect } from 'react'
import {
  doFetch,
  doPull,
  doStashPop,
  primaryPush,
  promptNewBranch,
  promptStash
} from './lib/gitActions'
import { comboFromEvent, useSettings, type ShortcutAction } from './settings'
import { useStore } from './store'
import { useTerminalPanel } from './terminal'

/** Implementación de cada acción de atajo. */
const ACTIONS: Record<ShortcutAction, () => void> = {
  fetch: doFetch,
  pull: () => doPull(),
  push: primaryPush,
  newBranch: promptNewBranch,
  stash: promptStash,
  stashPop: doStashPop,
  toggleSidebar: () => useSettings.getState().toggleSidebar(),
  toggleRightPanel: () => useSettings.getState().toggleRightPanel(),
  toggleTerminal: () => {
    if (useStore.getState().repo) useTerminalPanel.getState().toggle()
  },
  toggleTheme: () => useStore.getState().toggleTheme(),
  openSettings: () => useSettings.getState().openPanel(),
  zoomIn: () => useSettings.getState().zoomIn(),
  zoomOut: () => useSettings.getState().zoomOut(),
  zoomReset: () => useSettings.getState().setZoom(1)
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/** Handler global de atajos configurables. Se registra una vez en App. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const combo = comboFromEvent(e)
      if (!combo) return
      // Dentro de un campo de texto solo se atienden combos con Ctrl/Alt/Meta
      // (los demás son escritura normal).
      if (isEditable(e.target) && !e.ctrlKey && !e.altKey && !e.metaKey) return
      const shortcuts = useSettings.getState().shortcuts
      const action = (Object.keys(shortcuts) as ShortcutAction[]).find(
        (a) => shortcuts[a] && shortcuts[a] === combo
      )
      if (!action) return
      e.preventDefault()
      ACTIONS[action]()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

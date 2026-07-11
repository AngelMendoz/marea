import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SessionData } from '../shared/types'

// La sesión (pestañas abiertas + activa) se guarda en un archivo del userData:
// el origen de localStorage cambia entre dev y producción y puede vaciarse.

function storeFile(): string {
  return join(app.getPath('userData'), 'session.json')
}

export function getSession(): SessionData {
  try {
    const file = storeFile()
    if (!existsSync(file)) return { tabs: [], active: null }
    const data = JSON.parse(readFileSync(file, 'utf-8')) as SessionData
    const tabs = Array.isArray(data.tabs)
      ? data.tabs.filter((t): t is string => typeof t === 'string' && t.length > 0)
      : []
    return { tabs, active: typeof data.active === 'string' ? data.active : null }
  } catch {
    return { tabs: [], active: null }
  }
}

export function saveSession(tabs: string[], active: string | null): void {
  try {
    writeFileSync(storeFile(), JSON.stringify({ tabs, active }, null, 2), 'utf-8')
  } catch {
    /* disco no disponible: la sesión simplemente no se restaurará */
  }
}

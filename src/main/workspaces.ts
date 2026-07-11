import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Workspace, WorkspacesData } from '../shared/types'

// Los workspaces agrupan repos (por ruta) bajo un nombre y viven en un JSON
// del userData, como los repos recientes. El workspace activo y el orden de
// los repos también se persisten aquí.

function storeFile(): string {
  return join(app.getPath('userData'), 'workspaces.json')
}

export function getWorkspaces(): WorkspacesData {
  try {
    const file = storeFile()
    if (!existsSync(file)) return { workspaces: [], active: null }
    const data = JSON.parse(readFileSync(file, 'utf-8')) as WorkspacesData
    const workspaces = Array.isArray(data.workspaces)
      ? data.workspaces.filter(
          (w): w is Workspace => !!w && typeof w.name === 'string' && Array.isArray(w.repos)
        )
      : []
    const active =
      typeof data.active === 'string' && workspaces.some((w) => w.name === data.active)
        ? data.active
        : null
    return { workspaces, active }
  } catch {
    return { workspaces: [], active: null }
  }
}

function write(data: WorkspacesData): WorkspacesData {
  try {
    writeFileSync(storeFile(), JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    /* disco no disponible: los cambios no sobreviven a la sesión */
  }
  return data
}

/** Crea o actualiza (por nombre) un workspace: repos y su orden. */
export function saveWorkspace(ws: Workspace): WorkspacesData {
  const data = getWorkspaces()
  const repos = [...new Set(ws.repos.map((r) => r.replace(/\\/g, '/')))]
  const i = data.workspaces.findIndex((w) => w.name === ws.name)
  if (i >= 0) data.workspaces[i] = { ...data.workspaces[i], repos }
  else data.workspaces.push({ name: ws.name, repos, createdAt: ws.createdAt || Date.now() })
  return write(data)
}

export function deleteWorkspace(name: string): WorkspacesData {
  const data = getWorkspaces()
  data.workspaces = data.workspaces.filter((w) => w.name !== name)
  if (data.active === name) data.active = null
  return write(data)
}

export function renameWorkspace(oldName: string, newName: string): WorkspacesData {
  const data = getWorkspaces()
  const trimmed = newName.trim()
  if (!trimmed || data.workspaces.some((w) => w.name === trimmed)) return data
  const ws = data.workspaces.find((w) => w.name === oldName)
  if (!ws) return data
  ws.name = trimmed
  if (data.active === oldName) data.active = trimmed
  return write(data)
}

export function setActiveWorkspace(name: string | null): WorkspacesData {
  const data = getWorkspaces()
  data.active = name && data.workspaces.some((w) => w.name === name) ? name : null
  return write(data)
}

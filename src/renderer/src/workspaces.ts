import { create } from 'zustand'
import type { Workspace, WorkspacesData } from '@shared/types'
import { bridge } from './bridge'

/** Estado compartido de Workspaces (lo consumen el panel y la Actividad).
 *  Cada acción persiste vía bridge y sincroniza con la respuesta. */
interface WorkspacesState {
  data: WorkspacesData | null
  load: () => Promise<void>
  save: (ws: Workspace) => Promise<void>
  remove: (name: string) => Promise<void>
  rename: (oldName: string, newName: string) => Promise<void>
  setActive: (name: string | null) => Promise<void>
}

export const useWorkspaces = create<WorkspacesState>((set) => ({
  data: null,
  load: async () => set({ data: await bridge.workspacesGet() }),
  save: async (ws) => set({ data: await bridge.workspaceSave(ws) }),
  remove: async (name) => set({ data: await bridge.workspaceDelete(name) }),
  rename: async (oldName, newName) => set({ data: await bridge.workspaceRename(oldName, newName) }),
  setActive: async (name) => set({ data: await bridge.workspaceSetActive(name) })
}))

/** Workspace activo según los datos cargados (null si no hay). */
export function activeWorkspace(data: WorkspacesData | null): Workspace | null {
  if (!data?.active) return null
  return data.workspaces.find((w) => w.name === data.active) ?? null
}

/** Ejecuta `fn` sobre `items` con un máximo de `limit` en paralelo. */
export async function withLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await fn(item)
    }
  })
  await Promise.all(workers)
}

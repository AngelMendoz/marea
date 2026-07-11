import { spawn } from 'child_process'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { accountsService } from './accounts'
import { githubService } from './git/github'
import { gitService } from './git/gitService'
import { addRecentRepo, getRecentRepos, removeRecentRepo } from './recentRepos'
import { startWatch, stopWatch } from './repoWatcher'
import { getSession, saveSession } from './session'
import { registerTerminalIpc } from './terminal'
import {
  deleteWorkspace,
  getWorkspaces,
  renameWorkspace,
  saveWorkspace,
  setActiveWorkspace
} from './workspaces'
import type { Workspace } from '../shared/types'

/** Despacho genérico: window.api.git(method, ...args) se enruta a
 *  gitService[method] y responde { ok, data } | { ok: false, error }. */
export function registerIpc(): void {
  ipcMain.handle('git', async (_e, method: string, args: unknown[]) => {
    try {
      const fn = (gitService as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
        method
      ]
      if (typeof fn !== 'function') {
        throw new Error(`Método git desconocido: ${method}`)
      }
      const data = await fn.apply(gitService, args)
      return { ok: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  })

  // --- GitHub (Pull Requests) ----------------------------------------------
  ipcMain.handle('github', async (_e, method: string, args: unknown[]) => {
    try {
      const fn = (githubService as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
        method
      ]
      if (typeof fn !== 'function') throw new Error(`Método github desconocido: ${method}`)
      const data = await fn.apply(githubService, args)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // --- Cuentas de proveedores --------------------------------------
  ipcMain.handle('accounts', async (_e, method: string, args: unknown[]) => {
    try {
      const fn = (accountsService as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
        method
      ]
      if (typeof fn !== 'function') throw new Error(`Método de cuentas desconocido: ${method}`)
      const data = await fn.apply(accountsService, args)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // --- Terminal integrada -----------------------------------------
  registerTerminalIpc()

  // --- Repos recientes -----------------------------------------------------
  ipcMain.handle('recent:list', () => getRecentRepos())
  ipcMain.handle('recent:add', (_e, path: string) => addRecentRepo(path))
  ipcMain.handle('recent:remove', (_e, path: string) => removeRecentRepo(path))

  // --- Sesión (pestañas abiertas, para restaurar al reabrir) ----------------
  ipcMain.handle('session:get', () => getSession())
  ipcMain.handle('session:save', (_e, tabs: string[], active: string | null) =>
    saveSession(tabs, active)
  )

  // --- Workspaces (grupos de repos) --------------------------------
  ipcMain.handle('workspaces:get', () => getWorkspaces())
  ipcMain.handle('workspaces:save', (_e, ws: Workspace) => saveWorkspace(ws))
  ipcMain.handle('workspaces:delete', (_e, name: string) => deleteWorkspace(name))
  ipcMain.handle('workspaces:rename', (_e, oldName: string, newName: string) =>
    renameWorkspace(oldName, newName)
  )
  ipcMain.handle('workspaces:setActive', (_e, name: string | null) => setActiveWorkspace(name))

  // --- Diálogos del sistema ------------------------------------------------
  ipcMain.handle('dialog:openRepo', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Abrir repositorio',
      properties: ['openDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.handle('dialog:openFolder', async (_e, title: string) => {
    const res = await dialog.showOpenDialog({
      title: title ?? 'Seleccionar carpeta',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  // Solo URLs web: evita lanzar esquemas arbitrarios (file:, manejadores de protocolo…).
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
  })

  // Acciones de archivo/carpeta en el sistema.
  ipcMain.handle('shell:showItemInFolder', (_e, fullPath: string) =>
    shell.showItemInFolder(fullPath.replace(/\//g, '\\'))
  )
  ipcMain.handle('shell:openPath', (_e, fullPath: string) => shell.openPath(fullPath))

  // Abrir un archivo del repo en el editor externo configurado o,
  // si no hay ninguno, en la aplicación por defecto del sistema.
  ipcMain.handle('file:openInEditor', (_e, repoPath: string, file: string, editor?: string) => {
    const target = join(repoPath, file)
    if (editor && editor.trim()) {
      const child = spawn(editor.trim(), [target], { shell: true, detached: true, stdio: 'ignore' })
      child.on('error', () => shell.openPath(target))
      child.unref()
      return
    }
    return shell.openPath(target)
  })

  // --- Watcher del repositorio (detección de cambios en vivo) --------------
  ipcMain.handle('watch:start', (e, path: string) => {
    const wc = e.sender
    startWatch(path, () => {
      if (!wc.isDestroyed()) wc.send('repo:changed')
    })
  })
  ipcMain.handle('watch:stop', () => stopWatch())

  // --- Control de la ventana (frameless) -----------------------------------
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:toggleMaximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })

  // --- Zoom de la interfaz ----------------------------------------
  ipcMain.handle('window:setZoom', (e, factor: number) => {
    const f = Math.min(2, Math.max(0.5, factor))
    e.sender.setZoomFactor(f)
    return f
  })
  ipcMain.handle('window:getZoom', (e) => e.sender.getZoomFactor())
}

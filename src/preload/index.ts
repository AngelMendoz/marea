import { contextBridge, ipcRenderer } from 'electron'

export interface GitResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

const api = {
  /** Invoca un método de gitService por nombre. */
  git<T = unknown>(method: string, ...args: unknown[]): Promise<GitResult<T>> {
    return ipcRenderer.invoke('git', method, args)
  },
  /** Invoca un método de githubService por nombre. */
  github<T = unknown>(method: string, ...args: unknown[]): Promise<GitResult<T>> {
    return ipcRenderer.invoke('github', method, args)
  },
  /** Invoca un método de accountsService por nombre. */
  accounts<T = unknown>(method: string, ...args: unknown[]): Promise<GitResult<T>> {
    return ipcRenderer.invoke('accounts', method, args)
  },
  recent: {
    list: () => ipcRenderer.invoke('recent:list'),
    add: (path: string) => ipcRenderer.invoke('recent:add', path),
    remove: (path: string) => ipcRenderer.invoke('recent:remove', path)
  },
  session: {
    get: () => ipcRenderer.invoke('session:get'),
    save: (tabs: string[], active: string | null) =>
      ipcRenderer.invoke('session:save', tabs, active)
  },
  workspaces: {
    get: () => ipcRenderer.invoke('workspaces:get'),
    save: (ws: unknown) => ipcRenderer.invoke('workspaces:save', ws),
    delete: (name: string) => ipcRenderer.invoke('workspaces:delete', name),
    rename: (oldName: string, newName: string) =>
      ipcRenderer.invoke('workspaces:rename', oldName, newName),
    setActive: (name: string | null) => ipcRenderer.invoke('workspaces:setActive', name)
  },
  dialog: {
    openRepo: (): Promise<string | null> => ipcRenderer.invoke('dialog:openRepo'),
    openFolder: (title: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:openFolder', title)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    setZoom: (factor: number): Promise<number> => ipcRenderer.invoke('window:setZoom', factor),
    getZoom: (): Promise<number> => ipcRenderer.invoke('window:getZoom')
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (fullPath: string) => ipcRenderer.invoke('shell:showItemInFolder', fullPath),
    openPath: (fullPath: string) => ipcRenderer.invoke('shell:openPath', fullPath)
  },
  file: {
    openInEditor: (repoPath: string, file: string, editor?: string) =>
      ipcRenderer.invoke('file:openInEditor', repoPath, file, editor)
  },
  watch: {
    start: (path: string) => ipcRenderer.invoke('watch:start', path),
    stop: () => ipcRenderer.invoke('watch:stop'),
    /** Suscribe a cambios del repo. Devuelve función para cancelar. */
    onChanged: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('repo:changed', listener)
      return () => ipcRenderer.removeListener('repo:changed', listener)
    }
  },
  term: {
    /** Crea un pty en la carpeta del repo; devuelve su id. */
    create: (repoPath: string, cols?: number, rows?: number): Promise<number> =>
      ipcRenderer.invoke('term:create', repoPath, cols, rows),
    input: (id: number, data: string) => ipcRenderer.invoke('term:input', id, data),
    resize: (id: number, cols: number, rows: number) =>
      ipcRenderer.invoke('term:resize', id, cols, rows),
    dispose: (id: number) => ipcRenderer.invoke('term:dispose', id),
    /** Stream de salida del pty (todas las sesiones; filtrar por id). */
    onData: (cb: (id: number, data: string) => void): (() => void) => {
      const listener = (_e: unknown, id: number, data: string): void => cb(id, data)
      ipcRenderer.on('term:data', listener)
      return () => ipcRenderer.removeListener('term:data', listener)
    },
    onExit: (cb: (id: number, exitCode: number) => void): (() => void) => {
      const listener = (_e: unknown, id: number, exitCode: number): void => cb(id, exitCode)
      ipcRenderer.on('term:exit', listener)
      return () => ipcRenderer.removeListener('term:exit', listener)
    }
  }
}

export type MareaApi = typeof api

contextBridge.exposeInMainWorld('api', api)

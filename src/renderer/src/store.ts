import { create } from 'zustand'
import { buildGraph } from '@shared/graph'
import { useCenterView } from './centerView'
import { useDialog } from './dialog'
import { disposeTerminal } from './terminal'
import type {
  BisectState,
  BranchList,
  Commit,
  CommitWithGraph,
  LfsInfo,
  LogResult,
  OperationState,
  RecentRepo,
  RefsResult,
  RepoInfo,
  StatusResult,
  Submodule,
  Worktree
} from '@shared/types'
import { bridge } from './bridge'

export type Theme = 'dark' | 'light'

/** Commits por lote al paginar el historial (scroll infinito). */
export const LOG_PAGE_SIZE = 500

/** Firma barata del historial (hashes + decoraciones) para detectar si de
 *  verdad cambió: el watcher refresca con cada edición de archivo y no tiene
 *  sentido reconstruir el grafo (y re-renderizar cientos de filas) si no. */
function logSignature(commits: Commit[]): string {
  let sig = ''
  for (const c of commits) {
    sig += c.hash
    for (const r of c.refs) sig += r.type + r.name
    sig += '|'
  }
  return sig
}

/** Guarda las pestañas abiertas y la activa para restaurarlas al reabrir.
 *  En Electron persiste en un archivo del userData (fiable entre sesiones);
 *  en navegador cae a localStorage. */
function persistSession(tabs: RepoInfo[], activePath: string | null): void {
  void bridge.sessionSave(
    tabs.map((t) => t.path),
    activePath
  )
}

/** Selección activa en el panel central. */
export type Selection =
  | { kind: 'wip' } // cambios sin commitear (staging)
  | { kind: 'commit'; hash: string }
  | null

/** Archivo abierto en el panel de diff central. */
export interface SelectedFile {
  path: string
  staged?: boolean
  commit?: string
  /** Abre el editor visual de conflictos en vez del diff. */
  conflicted?: boolean
  /** Vista inicial del panel (History/Blame directos desde un menú). */
  mode?: 'diff' | 'history' | 'blame'
}

interface Toast {
  id: number
  type: 'info' | 'error' | 'success'
  message: string
}

interface AppState {
  theme: Theme
  repo: RepoInfo | null
  recents: RecentRepo[]
  /** Commits en crudo cargados (base para grafo y filtro en vivo). */
  commits: Commit[]
  /** Grafo construido a partir de `commits` (historial completo, sin filtrar). */
  log: LogResult | null
  /** Hay más commits por cargar (scroll infinito). */
  logHasMore: boolean
  /** Cargando el siguiente lote. */
  loadingMore: boolean
  status: StatusResult | null
  branches: BranchList | null
  refs: RefsResult | null
  selection: Selection
  /** Multi-selección de commits (Ctrl/Shift + clic en el grafo). */
  multiSel: string[]
  /** Sesión de git bisect en curso (null hasta el primer refresh). */
  bisect: BisectState | null
  /** Merge/rebase/cherry-pick/revert en curso (banner con continuar/abortar). */
  operation: OperationState | null
  /** Worktrees vinculados del repo. */
  worktrees: Worktree[]
  /** Submódulos del repo. */
  submodules: Submodule[]
  /** Estado Git LFS del repo. */
  lfs: LfsInfo | null
  selectedFile: SelectedFile | null
  /** Commit al que el grafo debe desplazarse (salto desde Blame/History). */
  focusCommit: string | null
  loading: boolean
  busy: boolean
  toasts: Toast[]

  toggleTheme: () => void
  setSelection: (sel: Selection) => void
  setMultiSel: (hashes: string[]) => void
  setSelectedFile: (f: SelectedFile | null) => void
  /** Selecciona un commit y pide al grafo centrarse en él. */
  jumpToCommit: (hash: string) => void

  tabs: RepoInfo[]
  aliases: Record<string, string>

  loadRecents: () => Promise<void>
  openRepo: (path: string) => Promise<void>
  /** Reabre las pestañas de la sesión anterior. Devuelve si restauró algo. */
  restoreSession: () => Promise<boolean>
  closeRepo: () => void
  switchTab: (path: string) => Promise<void>
  closeTab: (path: string) => void
  setAlias: (path: string, alias: string) => void
  refresh: () => Promise<void>
  /** Carga el siguiente lote del historial y lo concatena (scroll infinito). */
  loadMore: () => Promise<void>

  notify: (type: Toast['type'], message: string) => void
  dismissToast: (id: number) => void

  /** Ejecuta una acción git y refresca el estado, mostrando errores. */
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>
}

let toastId = 0

/** Repos a los que ya se les ofreció clonar submódulos en esta sesión
 *  (openRepo también se llama al cambiar de pestaña; no re-preguntar). */
const submodulePromptShown = new Set<string>()

export const useStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('marea-theme') as Theme) || 'dark',
  repo: null,
  recents: [],
  commits: [],
  log: null,
  logHasMore: false,
  loadingMore: false,
  status: null,
  branches: null,
  refs: null,
  selection: null,
  multiSel: [],
  bisect: null,
  operation: null,
  worktrees: [],
  submodules: [],
  lfs: null,
  selectedFile: null,
  focusCommit: null,
  loading: false,
  busy: false,
  toasts: [],
  tabs: [],
  aliases: JSON.parse(localStorage.getItem('marea-aliases') || '{}'),

  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('marea-theme', theme)
    document.documentElement.dataset.theme = theme
    set({ theme })
  },

  setSelection: (selection) => set({ selection, selectedFile: null, multiSel: [] }),
  setMultiSel: (multiSel) => set({ multiSel }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),

  jumpToCommit: (hash) => {
    // Cierra el diff y cualquier vista central para que el grafo sea visible.
    useCenterView.getState().close()
    set({ selection: { kind: 'commit', hash }, selectedFile: null, multiSel: [], focusCommit: hash })
  },

  loadRecents: async () => {
    const recents = await bridge.recentList()
    set({ recents })
  },

  openRepo: async (path) => {
    set({ loading: true })
    try {
      const repo = await bridge.openRepo(path)
      await bridge.recentAdd(path)
      set((s) => {
        const tabs = s.tabs.some((t) => t.path === repo.path) ? s.tabs : [...s.tabs, repo]
        persistSession(tabs, repo.path)
        const sameRepo = s.repo?.path === repo.path
        // El detalle de PR/issue abierto pertenece al repo anterior.
        if (!sameRepo) useCenterView.getState().close()
        return {
          repo,
          selection: { kind: 'wip' as const },
          selectedFile: null,
          multiSel: [],
          tabs,
          // Al cambiar de repo no se muestra el grafo del anterior mientras carga.
          ...(sameRepo
            ? {}
            : { commits: [], log: null, logHasMore: false, status: null, bisect: null, operation: null, worktrees: [], submodules: [], lfs: null })
        }
      })
      bridge.startWatch(repo.path)
      await get().refresh()
      await get().loadRecents()
      // Repo con submódulos sin clonar: ofrece inicializarlos (una vez por
      // repo y sesión, como al clonar un repo padre con submódulos).
      const uninit = get().submodules.filter((s) => s.status === 'uninitialized')
      if (uninit.length > 0 && !submodulePromptShown.has(repo.path)) {
        submodulePromptShown.add(repo.path)
        useDialog.getState().openConfirm({
          title: 'Submódulos sin clonar',
          message: `Este repositorio tiene ${uninit.length === 1 ? 'un submódulo' : `${uninit.length} submódulos`} sin inicializar. ¿Clonar su contenido ahora?`,
          confirmText: 'Clonar submódulos',
          onConfirm: () =>
            void get().run('Submódulos clonados', () =>
              bridge.submoduleUpdate(repo.path, undefined, { init: true, recursive: true })
            )
        })
      }
    } catch (err) {
      get().notify('error', err instanceof Error ? err.message : 'No se pudo abrir el repositorio')
    } finally {
      set({ loading: false })
    }
  },

  restoreSession: async () => {
    let paths: string[] = []
    let active: string | null = null
    try {
      const sess = await bridge.sessionGet()
      paths = sess.tabs
      active = sess.active
    } catch {
      return false
    }
    if (!Array.isArray(paths) || paths.length === 0) return false
    // Valida cada repo guardado en paralelo (abre rápido aunque haya varias
    // pestañas); los que ya no existen se omiten en silencio.
    const results = await Promise.allSettled(paths.map((p) => bridge.openRepo(p)))
    const tabs: RepoInfo[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') tabs.push(r.value)
    }
    if (tabs.length === 0) {
      persistSession([], null)
      return false
    }
    set({ tabs })
    const target = tabs.find((t) => t.path === active) ?? tabs[tabs.length - 1]
    await get().openRepo(target.path)
    return true
  },

  closeRepo: () => {
    bridge.stopWatch()
    useCenterView.getState().close()
    persistSession(get().tabs, null)
    set({
      repo: null,
      commits: [],
      log: null,
      logHasMore: false,
      status: null,
      branches: null,
      refs: null,
      selection: null,
      multiSel: [],
      bisect: null,
      operation: null,
      worktrees: [],
      submodules: [],
      lfs: null,
      selectedFile: null
    })
  },

  switchTab: async (path) => {
    if (get().repo?.path === path) return
    await get().openRepo(path)
  },

  closeTab: (path) => {
    // La terminal de la pestaña muere con ella (sin shells huérfanos).
    disposeTerminal(path)
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path)
      persistSession(tabs, s.repo?.path === path ? null : (s.repo?.path ?? null))
      return { tabs }
    })
    if (get().repo?.path === path) {
      const remaining = get().tabs
      if (remaining.length > 0) get().openRepo(remaining[remaining.length - 1].path)
      else get().closeRepo()
    }
  },

  setAlias: (path, alias) => {
    set((s) => {
      const aliases = { ...s.aliases }
      if (alias.trim()) aliases[path] = alias.trim()
      else delete aliases[path]
      localStorage.setItem('marea-aliases', JSON.stringify(aliases))
      return { aliases }
    })
  },

  refresh: async () => {
    const { repo } = get()
    if (!repo) return
    try {
      // Pide al menos lo que ya está cargado, para no perder el scroll infinito
      // acumulado cuando el watcher refresca.
      const loaded = get().commits.length
      const prevConflicts = get().status?.conflicted.length ?? 0
      const [page, status, branches, refs, bisect, operation, worktrees, submodules, lfs] = await Promise.all([
        bridge.logPage(repo.path, { maxCount: Math.max(LOG_PAGE_SIZE, loaded) }),
        bridge.status(repo.path),
        bridge.branches(repo.path),
        bridge.refs(repo.path),
        bridge.bisectState(repo.path).catch((): BisectState => ({ active: false })),
        bridge.operationState(repo.path).catch((): OperationState => ({ kind: null })),
        bridge.worktrees(repo.path).catch((): Worktree[] => []),
        bridge.submodules(repo.path).catch((): Submodule[] => []),
        bridge.lfsInfo(repo.path).catch((): LfsInfo | null => null)
      ])
      // Si el historial no cambió, conserva los objetos anteriores: las filas
      // memoizadas del grafo no se re-renderizan.
      const prev = get().commits
      const unchanged = prev.length === page.commits.length && logSignature(prev) === logSignature(page.commits)
      set({
        ...(unchanged
          ? {}
          : { commits: page.commits, log: buildGraph(page.commits), logHasMore: page.hasMore }),
        status,
        branches,
        refs,
        bisect,
        operation,
        worktrees,
        submodules,
        lfs
      })
      // Conflictos recién aparecidos (merge/rebase/cherry-pick que se detuvo):
      // abre automáticamente el editor de conflictos con el primer archivo.
      if (
        operation.kind &&
        status.conflicted.length > 0 &&
        prevConflicts === 0 &&
        !get().selectedFile?.conflicted
      ) {
        set({
          selection: { kind: 'wip' },
          selectedFile: { path: status.conflicted[0].path, conflicted: true }
        })
      }
    } catch (err) {
      get().notify('error', err instanceof Error ? err.message : 'Error al refrescar')
    }
  },

  loadMore: async () => {
    const { repo, commits, logHasMore, loadingMore } = get()
    if (!repo || !logHasMore || loadingMore) return
    set({ loadingMore: true })
    try {
      const page = await bridge.logPage(repo.path, {
        maxCount: LOG_PAGE_SIZE,
        skip: commits.length
      })
      // Recalcular el grafo con la lista total mantiene los carriles estables.
      const seen = new Set(commits.map((c) => c.hash))
      const merged = commits.concat(page.commits.filter((c) => !seen.has(c.hash)))
      set({ commits: merged, log: buildGraph(merged), logHasMore: page.hasMore })
    } catch (err) {
      get().notify('error', err instanceof Error ? err.message : 'Error al cargar más commits')
    } finally {
      set({ loadingMore: false })
    }
  },

  notify: (type, message) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    setTimeout(() => get().dismissToast(id), type === 'error' ? 6000 : 3000)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  run: async (label, fn) => {
    set({ busy: true })
    try {
      await fn()
      await get().refresh()
      get().notify('success', `${label} ✓`)
    } catch (err) {
      get().notify('error', `${label}: ${err instanceof Error ? err.message : 'error'}`)
    } finally {
      set({ busy: false })
    }
  }
}))

export function findCommit(log: LogResult | null, hash: string): CommitWithGraph | undefined {
  return log?.commits.find((c) => c.hash === hash)
}

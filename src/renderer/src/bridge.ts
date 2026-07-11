import type {
  Account,
  BisectState,
  BlameLine,
  BranchList,
  CloneOptions,
  Commit,
  CommitFile,
  CommitOptions,
  CreateIssueOptions,
  ConflictVersions,
  CreatePROptions,
  FileHistoryEntry,
  FileHistoryOptions,
  GhLabel,
  GpgKey,
  HooksInfo,
  GitflowConfig,
  GitflowFinishOptions,
  GitflowType,
  Issue,
  IssueComment,
  LfsFile,
  LfsInfo,
  LogOptions,
  LogPage,
  OperationState,
  PullOptions,
  PRComment,
  PRFile,
  PRInlineComment,
  PRMergeMethod,
  PRReviewEvent,
  ProviderKind,
  PullRequest,
  PullRequestDetail,
  PushOptions,
  RebasePlanItem,
  RebaseResult,
  RecentRepo,
  RefDiffOptions,
  RefsResult,
  RepoHost,
  RepoInfo,
  ResetMode,
  SessionData,
  SignatureInfo,
  StatusResult,
  Submodule,
  SubmoduleUpdateOptions,
  Workspace,
  WorkspacesData,
  Worktree,
  WorktreeAddOptions
} from '@shared/types'
import {
  mockBlame,
  mockBranches,
  mockCommitFiles,
  mockConflictVersions,
  mockDiff,
  mockFileHistory,
  mockIssueComments,
  mockIssues,
  mockLogPage,
  mockPRComments,
  mockPRDetail,
  mockPRFiles,
  mockPullRequests,
  mockRawCommits,
  mockRecent,
  mockRefs,
  mockStatus,
  mockSubmodules,
  mockWorktrees
} from './mockData'

export const isElectron = typeof window !== 'undefined' && !!window.api

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const res = await window.api!.git<T>(method, ...args)
  if (!res.ok) throw new Error(res.error ?? 'Error de git')
  return res.data as T
}

async function callGithub<T>(method: string, ...args: unknown[]): Promise<T> {
  const res = await window.api!.github<T>(method, ...args)
  if (!res.ok) throw new Error(res.error ?? 'Error de GitHub')
  return res.data as T
}

async function callAccounts<T>(method: string, ...args: unknown[]): Promise<T> {
  const res = await window.api!.accounts<T>(method, ...args)
  if (!res.ok) throw new Error(res.error ?? 'Error de cuentas')
  return res.data as T
}

/** Pausa para que el modo navegador "sienta" como datos remotos. */
const tick = () => new Promise((r) => setTimeout(r, 120))

/** Terminal falsa del modo navegador: un eco con prompt. */
let webTermId = 0
const webTermListeners = new Set<(id: number, data: string) => void>()
function webTermEmit(id: number, data: string): void {
  for (const cb of webTermListeners) cb(id, data)
}

/** Workspaces en modo navegador: persistidos en localStorage con un ejemplo
 *  inicial, para poder ejercitar el flujo completo en la preview web. */
function webWorkspaces(): WorkspacesData {
  try {
    const raw = localStorage.getItem('marea-workspaces')
    if (raw) return JSON.parse(raw) as WorkspacesData
  } catch {
    /* almacenamiento corrupto: se regenera el ejemplo */
  }
  const seed: WorkspacesData = {
    workspaces: [
      {
        name: 'Equipo Marea',
        repos: ['C:/Users/sofia/Proyectos/marea', 'C:/Users/sofia/Proyectos/tienda-online'],
        createdAt: Date.now()
      }
    ],
    active: 'Equipo Marea'
  }
  webSaveWorkspaces(seed)
  return seed
}

function webSaveWorkspaces(data: WorkspacesData): WorkspacesData {
  try {
    localStorage.setItem('marea-workspaces', JSON.stringify(data))
  } catch {
    /* sin almacenamiento */
  }
  return data
}

export const bridge = {
  isElectron,

  // ---- Repos ----
  async pickRepo(): Promise<string | null> {
    if (!isElectron) return 'C:/Users/sofia/Proyectos/marea'
    return window.api!.dialog.openRepo()
  },
  async pickFolder(title: string): Promise<string | null> {
    if (!isElectron) return 'C:/Users/sofia/Proyectos'
    return window.api!.dialog.openFolder(title)
  },
  async openRepo(path: string): Promise<RepoInfo> {
    if (!isElectron) {
      await tick()
      return { path, name: path.split(/[\\/]/).pop() || 'repo', currentBranch: 'main', isDetached: false }
    }
    return call<RepoInfo>('open', path)
  },
  async initRepo(dir: string): Promise<RepoInfo> {
    if (!isElectron) return { path: dir, name: dir.split(/[\\/]/).pop() || 'repo', currentBranch: 'main', isDetached: false }
    return call<RepoInfo>('init', dir)
  },
  /** ¿La ruta existe y es un repositorio git? (marca rutas rotas en Workspaces). */
  async isRepo(path: string): Promise<boolean> {
    if (!isElectron) return !path.includes('perdido')
    return call<boolean>('isRepo', path)
  },
  async clone(opts: CloneOptions): Promise<string> {
    if (!isElectron) return `${opts.dir}/clone`
    return call<string>('clone', opts)
  },

  // ---- Sesión (pestañas abiertas) ----
  async sessionGet(): Promise<SessionData> {
    if (!isElectron) {
      // En navegador se conserva el comportamiento anterior con localStorage.
      try {
        return {
          tabs: JSON.parse(localStorage.getItem('marea-tabs') || '[]'),
          active: localStorage.getItem('marea-active-tab')
        }
      } catch {
        return { tabs: [], active: null }
      }
    }
    return window.api!.session.get()
  },
  async sessionSave(tabs: string[], active: string | null): Promise<void> {
    if (!isElectron) {
      try {
        localStorage.setItem('marea-tabs', JSON.stringify(tabs))
        if (active) localStorage.setItem('marea-active-tab', active)
        else localStorage.removeItem('marea-active-tab')
      } catch {
        /* almacenamiento no disponible */
      }
      return
    }
    await window.api!.session.save(tabs, active)
  },

  // ---- Workspaces ----
  async workspacesGet(): Promise<WorkspacesData> {
    if (!isElectron) return webWorkspaces()
    return window.api!.workspaces.get()
  },
  async workspaceSave(ws: Workspace): Promise<WorkspacesData> {
    if (!isElectron) {
      const data = webWorkspaces()
      const repos = [...new Set(ws.repos)]
      const i = data.workspaces.findIndex((w) => w.name === ws.name)
      if (i >= 0) data.workspaces[i] = { ...data.workspaces[i], repos }
      else data.workspaces.push({ name: ws.name, repos, createdAt: ws.createdAt || Date.now() })
      return webSaveWorkspaces(data)
    }
    return window.api!.workspaces.save(ws)
  },
  async workspaceDelete(name: string): Promise<WorkspacesData> {
    if (!isElectron) {
      const data = webWorkspaces()
      data.workspaces = data.workspaces.filter((w) => w.name !== name)
      if (data.active === name) data.active = null
      return webSaveWorkspaces(data)
    }
    return window.api!.workspaces.delete(name)
  },
  async workspaceRename(oldName: string, newName: string): Promise<WorkspacesData> {
    if (!isElectron) {
      const data = webWorkspaces()
      const ws = data.workspaces.find((w) => w.name === oldName)
      if (ws && newName.trim() && !data.workspaces.some((w) => w.name === newName.trim())) {
        ws.name = newName.trim()
        if (data.active === oldName) data.active = ws.name
      }
      return webSaveWorkspaces(data)
    }
    return window.api!.workspaces.rename(oldName, newName)
  },
  async workspaceSetActive(name: string | null): Promise<WorkspacesData> {
    if (!isElectron) {
      const data = webWorkspaces()
      data.active = name && data.workspaces.some((w) => w.name === name) ? name : null
      return webSaveWorkspaces(data)
    }
    return window.api!.workspaces.setActive(name)
  },

  // ---- Recientes ----
  async recentList(): Promise<RecentRepo[]> {
    if (!isElectron) return mockRecent
    return window.api!.recent.list()
  },
  async recentAdd(path: string): Promise<RecentRepo[]> {
    if (!isElectron) return mockRecent
    return window.api!.recent.add(path)
  },
  async recentRemove(path: string): Promise<RecentRepo[]> {
    if (!isElectron) return mockRecent.filter((r) => r.path !== path)
    return window.api!.recent.remove(path)
  },

  // ---- Lectura ----
  /** Lee un lote del historial (commits en crudo). Ver `gitService.logPage`. */
  async logPage(path: string, opts: LogOptions = {}): Promise<LogPage> {
    if (!isElectron) {
      await tick()
      return mockLogPage(opts)
    }
    return call<LogPage>('logPage', path, opts)
  },
  async status(path: string): Promise<StatusResult> {
    if (!isElectron) return mockStatus
    return call<StatusResult>('status', path)
  },
  async branches(path: string): Promise<BranchList> {
    if (!isElectron) return mockBranches
    return call<BranchList>('branches', path)
  },
  async refs(path: string): Promise<RefsResult> {
    if (!isElectron) return mockRefs
    return call<RefsResult>('refs', path)
  },
  async diff(
    path: string,
    opts: { file?: string; staged?: boolean; commit?: string; ignoreWhitespace?: boolean }
  ): Promise<string> {
    if (!isElectron) return mockDiff
    return call<string>('diff', path, opts)
  },
  // ---- Comparaciones avanzadas, File History y Blame ----
  /** Diff entre dos refs (sin `b` compara contra el working tree). */
  async diffRefs(path: string, opts: RefDiffOptions): Promise<string> {
    if (!isElectron) {
      await tick()
      return mockDiff
    }
    return call<string>('diffRefs', path, opts)
  },
  /** Archivos que cambian entre dos refs. */
  async diffRefsFiles(path: string, opts: RefDiffOptions): Promise<CommitFile[]> {
    if (!isElectron) {
      await tick()
      return mockCommitFiles
    }
    return call<CommitFile[]>('diffRefsFiles', path, opts)
  },
  /** Historial de un archivo/carpeta/ref (con ruta por commit si follow). */
  async fileHistory(path: string, opts: FileHistoryOptions = {}): Promise<FileHistoryEntry[]> {
    if (!isElectron) {
      await tick()
      return mockFileHistory
    }
    return call<FileHistoryEntry[]>('fileHistory', path, opts)
  },
  /** Anotación por línea de un archivo (blame). */
  async blame(path: string, file: string, ref?: string): Promise<BlameLine[]> {
    if (!isElectron) {
      await tick()
      return mockBlame
    }
    return call<BlameLine[]>('blame', path, file, ref)
  },
  /** Restaura la versión de `ref` en el working tree. */
  async restoreFileVersion(path: string, file: string, ref: string) {
    if (!isElectron) return
    return call('restoreFileVersion', path, file, ref)
  },

  async fileContent(path: string, opts: { file: string; staged?: boolean; commit?: string }): Promise<string> {
    if (!isElectron) {
      // En navegador: reconstruye una vista aproximada a partir del diff mock.
      return mockDiff
        .split('\n')
        .filter((l) => !l.startsWith('-') && !l.startsWith('diff ') && !l.startsWith('index ') && !l.startsWith('@@') && !l.startsWith('--- ') && !l.startsWith('+++ '))
        .map((l) => (l.startsWith('+') ? l.slice(1) : l))
        .join('\n')
    }
    return call<string>('fileContent', path, opts)
  },
  openInEditor(path: string, file: string): void {
    // El comando del editor externo vive en las preferencias; se lee
    // aquí directamente de localStorage para no acoplar bridge al store.
    let editor = ''
    try {
      editor = (JSON.parse(localStorage.getItem('marea-settings') || '{}') as { externalEditor?: string })
        .externalEditor ?? ''
    } catch {
      /* preferencias corruptas: editor por defecto */
    }
    if (isElectron) window.api!.file.openInEditor(path, file, editor || undefined)
  },
  async writeFile(path: string, file: string, content: string) {
    if (!isElectron) return
    return call('writeFile', path, file, content)
  },
  async applyHunk(
    path: string,
    patch: string,
    mode: 'stage' | 'unstage' | 'discard',
    opts: { recount?: boolean } = {}
  ) {
    if (!isElectron) return
    return call('applyPatch', path, patch, mode, opts)
  },

  // ---- GitHub (Pull Requests) ----
  async githubHostInfo(path: string): Promise<RepoHost> {
    if (!isElectron) return { host: 'github', owner: 'pleamarlabs', repo: 'marea' }
    const res = await window.api!.github<RepoHost>('hostInfo', path)
    if (!res.ok) throw new Error(res.error ?? 'Error de GitHub')
    return res.data as RepoHost
  },
  /** Login del usuario autenticado ('' si no hay credenciales). */
  async githubUser(): Promise<string> {
    if (!isElectron) return 'sofia-luna'
    const res = await window.api!.github<string>('user')
    return res.ok ? (res.data as string) : ''
  },
  async listPullRequests(path: string): Promise<PullRequest[]> {
    if (!isElectron) return mockPullRequests
    const res = await window.api!.github<PullRequest[]>('listPullRequests', path)
    if (!res.ok) throw new Error(res.error ?? 'Error de GitHub')
    return res.data as PullRequest[]
  },
  async createPullRequest(path: string, opts: CreatePROptions): Promise<{ number: number; url: string }> {
    if (!isElectron) return { number: 999, url: 'https://github.com/pleamarlabs/marea/pull/999' }
    const res = await window.api!.github<{ number: number; url: string }>('createPullRequest', path, opts)
    if (!res.ok) throw new Error(res.error ?? 'Error de GitHub')
    return res.data as { number: number; url: string }
  },
  async listCollaborators(path: string): Promise<string[]> {
    if (!isElectron) return ['diego-rios', 'sofia-luna', 'camila-vega', 'mateo-soto']
    const res = await window.api!.github<string[]>('listCollaborators', path)
    return res.ok ? (res.data as string[]) : []
  },
  async listLabels(path: string): Promise<GhLabel[]> {
    if (!isElectron)
      return [
        { name: 'bug', color: '#e2607b' },
        { name: 'enhancement', color: '#1fb6d6' },
        { name: 'documentation', color: '#5bc873' }
      ]
    const res = await window.api!.github<GhLabel[]>('listLabels', path)
    return res.ok ? (res.data as GhLabel[]) : []
  },

  // ---- GitHub (revisión de Pull Requests) ----
  async getPullRequest(path: string, number: number): Promise<PullRequestDetail> {
    if (!isElectron) {
      await tick()
      return mockPRDetail(number)
    }
    return callGithub<PullRequestDetail>('getPullRequest', path, number)
  },
  async prFiles(path: string, number: number): Promise<PRFile[]> {
    if (!isElectron) {
      await tick()
      return mockPRFiles
    }
    return callGithub<PRFile[]>('prFiles', path, number)
  },
  async prDiff(path: string, number: number): Promise<string> {
    if (!isElectron) return mockDiff
    return callGithub<string>('prDiff', path, number)
  },
  async prComments(path: string, number: number): Promise<PRComment[]> {
    if (!isElectron) {
      await tick()
      return mockPRComments
    }
    return callGithub<PRComment[]>('prComments', path, number)
  },
  async reviewPullRequest(
    path: string,
    number: number,
    event: PRReviewEvent,
    body?: string,
    comments?: PRInlineComment[]
  ): Promise<void> {
    if (!isElectron) return
    await callGithub('reviewPullRequest', path, number, event, body, comments)
  },
  async commentPullRequest(path: string, number: number, body: string): Promise<void> {
    if (!isElectron) return
    await callGithub('commentPullRequest', path, number, body)
  },
  async inlineCommentPullRequest(
    path: string,
    number: number,
    comment: PRInlineComment,
    commitId: string
  ): Promise<void> {
    if (!isElectron) return
    await callGithub('inlineCommentPullRequest', path, number, comment, commitId)
  },
  async mergePullRequest(path: string, number: number, method: PRMergeMethod): Promise<void> {
    if (!isElectron) return
    await callGithub('mergePullRequest', path, number, method)
  },
  async closePullRequest(path: string, number: number): Promise<void> {
    if (!isElectron) return
    await callGithub('closePullRequest', path, number)
  },

  // ---- GitHub (Issues) ----
  async listIssues(path: string): Promise<Issue[]> {
    if (!isElectron) {
      await tick()
      return mockIssues
    }
    return callGithub<Issue[]>('listIssues', path)
  },
  async getIssue(path: string, number: number): Promise<Issue> {
    if (!isElectron) {
      await tick()
      return mockIssues.find((i) => i.number === number) ?? mockIssues[0]
    }
    return callGithub<Issue>('getIssue', path, number)
  },
  async createIssue(path: string, opts: CreateIssueOptions): Promise<{ number: number; url: string }> {
    if (!isElectron) return { number: 153, url: 'https://github.com/pleamarlabs/marea/issues/153' }
    return callGithub<{ number: number; url: string }>('createIssue', path, opts)
  },
  async issueComments(path: string, number: number): Promise<IssueComment[]> {
    if (!isElectron) {
      await tick()
      return number === 152 ? mockIssueComments : []
    }
    return callGithub<IssueComment[]>('issueComments', path, number)
  },
  async commentIssue(path: string, number: number, body: string): Promise<void> {
    if (!isElectron) return
    await callGithub('commentIssue', path, number, body)
  },
  openExternal(url: string): void {
    if (isElectron) window.api!.shell.openExternal(url)
    else window.open(url, '_blank')
  },
  /** Muestra un archivo del repo en el explorador del sistema. */
  showInFolder(repoPath: string, file: string): void {
    if (isElectron) void window.api!.shell.showItemInFolder(`${repoPath.replace(/\\/g, '/')}/${file}`)
  },
  /** Abre una carpeta (p. ej. la del repositorio) en el explorador. */
  openFolder(fullPath: string): void {
    if (isElectron) void window.api!.shell.openPath(fullPath)
  },
  async commitFiles(path: string, sha: string): Promise<CommitFile[]> {
    if (!isElectron) return mockCommitFiles
    return call<CommitFile[]>('commitFiles', path, sha)
  },

  // ---- Terminal integrada ----
  /** Crea un pty en la carpeta del repo (mock eco en navegador). */
  async termCreate(repoPath: string, cols?: number, rows?: number): Promise<number> {
    if (!isElectron) {
      const id = ++webTermId
      setTimeout(() => {
        webTermEmit(id, `Terminal de demostración (modo navegador) — ${repoPath}\r\n`)
        webTermEmit(id, 'Los comandos solo se repiten como eco.\r\n> ')
      }, 60)
      return id
    }
    return window.api!.term.create(repoPath, cols, rows)
  },
  async termInput(id: number, data: string): Promise<void> {
    if (!isElectron) {
      // Eco simple: imprime lo tecleado y simula un prompt al pulsar Enter.
      webTermEmit(id, data === '\r' ? '\r\n> ' : data)
      return
    }
    await window.api!.term.input(id, data)
  },
  async termResize(id: number, cols: number, rows: number): Promise<void> {
    if (!isElectron) return
    await window.api!.term.resize(id, cols, rows)
  },
  async termDispose(id: number): Promise<void> {
    if (!isElectron) return
    await window.api!.term.dispose(id)
  },
  onTermData(cb: (id: number, data: string) => void): () => void {
    if (!isElectron) {
      webTermListeners.add(cb)
      return () => webTermListeners.delete(cb)
    }
    return window.api!.term.onData(cb)
  },
  onTermExit(cb: (id: number, exitCode: number) => void): () => void {
    if (!isElectron) return () => undefined
    return window.api!.term.onExit(cb)
  },

  // ---- Watcher (detección de cambios en vivo) ----
  startWatch(path: string): void {
    if (isElectron) window.api!.watch.start(path)
  },
  stopWatch(): void {
    if (isElectron) window.api!.watch.stop()
  },
  onRepoChanged(cb: () => void): () => void {
    if (!isElectron) return () => undefined
    return window.api!.watch.onChanged(cb)
  },

  // ---- Escritura (no-op en navegador) ----
  async stage(path: string, files: string[]) {
    if (!isElectron) return
    return call('stage', path, files)
  },
  async stageAll(path: string) {
    if (!isElectron) return
    return call('stageAll', path)
  },
  async unstage(path: string, files: string[]) {
    if (!isElectron) return
    return call('unstage', path, files)
  },
  async unstageAll(path: string) {
    if (!isElectron) return
    return call('unstageAll', path)
  },
  async discard(path: string, files: string[]) {
    if (!isElectron) return
    return call('discard', path, files)
  },
  async commit(path: string, message: string, opts: CommitOptions = {}) {
    if (!isElectron) return
    return call('commit', path, message, opts)
  },

  // ---- Firmas, hooks y plantillas ----
  async getConfig(
    path: string,
    keys: string[],
    opts: { scope?: 'global' | 'local' } = {}
  ): Promise<Record<string, string>> {
    if (!isElectron) {
      const mock: Record<string, string> = {
        'commit.gpgsign': 'true',
        'gpg.format': 'ssh',
        'user.signingkey': 'C:/Users/sofia/.ssh/id_ed25519.pub',
        'commit.template': '',
        'user.name': 'Sofia',
        'user.email': 'sofia@example.com',
        'credential.helper': 'manager',
        'merge.tool': 'vscode',
        'diff.tool': 'vscode'
      }
      return Object.fromEntries(keys.map((k) => [k, mock[k] ?? '']))
    }
    return call<Record<string, string>>('getConfig', path, keys, opts)
  },
  async setConfig(path: string, key: string, value: string, opts: { global?: boolean } = {}) {
    if (!isElectron) return
    return call('setConfig', path, key, value, opts)
  },
  // ---- Preferencias ----
  /** Versión del git en uso ('' si no se pudo ejecutar). */
  async gitVersion(): Promise<string> {
    if (!isElectron) return 'git version 2.47.0.windows.1'
    return call<string>('gitVersion')
  },
  /** Cambia el ejecutable git global de la app; devuelve su versión. */
  async setGitBinary(path: string): Promise<string> {
    if (!isElectron) return path ? `git version 2.47.0 (${path})` : 'git version 2.47.0.windows.1'
    return call<string>('setGitBinary', path)
  },

  async listGpgKeys(): Promise<GpgKey[]> {
    if (!isElectron)
      return [
        { id: '9A8B7C6D5E4F3A2B', uid: 'Sofia <sofia@example.com>' },
        { id: '1122334455667788', uid: 'Sofia (trabajo) <sofia@pleamarlabs.dev>' }
      ]
    return call<GpgKey[]>('listGpgKeys')
  },
  async listSshKeys(): Promise<string[]> {
    if (!isElectron) return ['C:/Users/sofia/.ssh/id_ed25519.pub', 'C:/Users/sofia/.ssh/id_rsa.pub']
    return call<string[]>('listSshKeys')
  },
  async commitSignature(path: string, sha: string): Promise<SignatureInfo> {
    if (!isElectron) {
      await tick()
      // Mock: los merges aparecen firmados, el resto sin firma.
      return sha.startsWith('h01')
        ? { code: 'G', signer: 'Sofia <sofia@example.com>', key: '9A8B7C6D5E4F3A2B' }
        : { code: 'N', signer: '', key: '' }
    }
    return call<SignatureInfo>('commitSignature', path, sha)
  },
  async hooksInfo(path: string): Promise<HooksInfo> {
    if (!isElectron) return { dir: 'C:/Users/sofia/Proyectos/marea/.git/hooks', hooks: ['pre-commit'] }
    return call<HooksInfo>('hooksInfo', path)
  },
  async commitTemplate(path: string): Promise<string> {
    if (!isElectron) return ''
    return call<string>('commitTemplate', path)
  },
  async checkout(path: string, ref: string) {
    if (!isElectron) return
    return call('checkout', path, ref)
  },
  async createBranch(path: string, name: string, opts: { startPoint?: string; checkout?: boolean } = {}) {
    if (!isElectron) return
    return call('createBranch', path, name, opts)
  },
  async deleteBranch(path: string, name: string, force = false) {
    if (!isElectron) return
    return call('deleteBranch', path, name, force)
  },
  async renameBranch(path: string, oldName: string, newName: string) {
    if (!isElectron) return
    return call('renameBranch', path, oldName, newName)
  },
  async merge(path: string, ref: string, opts: { squash?: boolean; noFf?: boolean } = {}) {
    if (!isElectron) return
    return call('merge', path, ref, opts)
  },
  async rebase(path: string, onto: string) {
    if (!isElectron) return
    return call('rebase', path, onto)
  },
  async cherryPick(path: string, sha: string) {
    if (!isElectron) return
    return call('cherryPick', path, sha)
  },
  async mergeInto(path: string, source: string, target: string, mode: 'ff' | 'merge' | 'squash' | 'noff' = 'merge') {
    if (!isElectron) return
    return call('mergeInto', path, source, target, mode)
  },
  async rebaseOnto(path: string, branch: string, onto: string) {
    if (!isElectron) return
    return call('rebaseOnto', path, branch, onto)
  },
  async revert(path: string, sha: string) {
    if (!isElectron) return
    return call('revert', path, sha)
  },
  async reset(path: string, mode: ResetMode, ref: string) {
    if (!isElectron) return
    return call('reset', path, mode, ref)
  },
  async resetBranchTo(path: string, branch: string, ref: string, mode: ResetMode = 'hard') {
    if (!isElectron) return
    return call('resetBranchTo', path, branch, ref, mode)
  },
  async fetch(path: string, opts: { prune?: boolean } = {}) {
    if (!isElectron) return
    return call('fetch', path, opts)
  },
  async pull(path: string, opts: PullOptions = {}) {
    if (!isElectron) return
    return call('pull', path, opts)
  },
  async push(path: string, opts: PushOptions = {}) {
    if (!isElectron) return
    return call('push', path, opts)
  },
  async stashCreate(path: string, message?: string) {
    if (!isElectron) return
    return call('stashCreate', path, message)
  },
  async stashApply(path: string, index: number) {
    if (!isElectron) return
    return call('stashApply', path, index)
  },
  async stashPop(path: string, index: number) {
    if (!isElectron) return
    return call('stashPop', path, index)
  },
  async stashDrop(path: string, index: number) {
    if (!isElectron) return
    return call('stashDrop', path, index)
  },
  /** Cambia el mensaje de un stash conservando su contenido. */
  async stashRename(path: string, index: number, message: string) {
    if (!isElectron) return
    return call('stashRename', path, index, message)
  },
  // ---- Remotos y sincronización avanzada ----
  async addRemote(path: string, name: string, url: string) {
    if (!isElectron) return
    return call('addRemote', path, name, url)
  },
  async removeRemote(path: string, name: string) {
    if (!isElectron) return
    return call('removeRemote', path, name)
  },
  async setRemoteUrl(path: string, name: string, url: string, opts: { push?: boolean } = {}) {
    if (!isElectron) return
    return call('setRemoteUrl', path, name, url, opts)
  },
  async renameRemote(path: string, oldName: string, newName: string) {
    if (!isElectron) return
    return call('renameRemote', path, oldName, newName)
  },
  async setDefaultRemote(path: string, name: string) {
    if (!isElectron) return
    return call('setDefaultRemote', path, name)
  },
  async fetchRemote(path: string, remote: string, opts: { prune?: boolean } = {}) {
    if (!isElectron) return
    return call('fetchRemote', path, remote, opts)
  },
  async fetchRemoteBranch(path: string, remote: string, branch: string) {
    if (!isElectron) return
    return call('fetchRemoteBranch', path, remote, branch)
  },
  async deleteRemoteBranch(path: string, remote: string, branch: string) {
    if (!isElectron) return
    return call('deleteRemoteBranch', path, remote, branch)
  },
  async setUpstream(path: string, branch: string, remoteBranch: string) {
    if (!isElectron) return
    return call('setUpstream', path, branch, remoteBranch)
  },

  async createTag(path: string, name: string, opts: { message?: string; ref?: string } = {}) {
    if (!isElectron) return
    return call('createTag', path, name, opts)
  },
  async deleteTag(path: string, name: string) {
    if (!isElectron) return
    return call('deleteTag', path, name)
  },

  // ---- Tags avanzado y Git LFS ----
  async renameTag(path: string, oldName: string, newName: string, opts: { remote?: string } = {}) {
    if (!isElectron) return
    return call('renameTag', path, oldName, newName, opts)
  },
  async pushTag(path: string, name: string, remote: string) {
    if (!isElectron) return
    return call('pushTag', path, name, remote)
  },
  async deleteRemoteTag(path: string, remote: string, name: string) {
    if (!isElectron) return
    return call('deleteRemoteTag', path, remote, name)
  },
  async lfsInfo(path: string): Promise<LfsInfo> {
    if (!isElectron)
      return {
        installed: true,
        version: 'git-lfs/3.6.0 (mock)',
        used: true,
        patterns: ['*.psd', 'assets/**/*.bin']
      }
    return call<LfsInfo>('lfsInfo', path)
  },
  async lfsFiles(path: string): Promise<LfsFile[]> {
    if (!isElectron) {
      await tick()
      return [
        { oid: '4bc2d1a9e0', path: 'design/mockup.psd' },
        { oid: '9f81c3b2d7', path: 'assets/video/intro.bin' }
      ]
    }
    return call<LfsFile[]>('lfsFiles', path)
  },
  async lfsPull(path: string) {
    if (!isElectron) return
    return call('lfsPull', path)
  },

  // ---- Cuentas de proveedores ----
  async accountsList(): Promise<Account[]> {
    if (!isElectron) {
      try {
        return JSON.parse(localStorage.getItem('marea-mock-accounts') || '[]') as Account[]
      } catch {
        return []
      }
    }
    return callAccounts<Account[]>('list')
  },
  async accountAdd(provider: ProviderKind, host: string, token: string, username = ''): Promise<Account> {
    if (!isElectron) {
      await tick()
      const acc: Account = {
        id: String(Date.now()),
        provider,
        host: host || 'github.com',
        username: username || 'cuenta-demo'
      }
      const all = await this.accountsList()
      localStorage.setItem('marea-mock-accounts', JSON.stringify([...all, acc]))
      return acc
    }
    return callAccounts<Account>('add', provider, host, token, username)
  },
  async accountRemove(id: string): Promise<Account[]> {
    if (!isElectron) {
      const all = (await this.accountsList()).filter((a) => a.id !== id)
      localStorage.setItem('marea-mock-accounts', JSON.stringify(all))
      return all
    }
    return callAccounts<Account[]>('remove', id)
  },
  async repoAccountGet(path: string): Promise<string> {
    if (!isElectron) return localStorage.getItem(`marea-mock-repo-account:${path}`) ?? ''
    return callAccounts<string>('getRepoAccount', path)
  },
  async repoAccountSet(path: string, accountId: string) {
    if (!isElectron) {
      if (accountId) localStorage.setItem(`marea-mock-repo-account:${path}`, accountId)
      else localStorage.removeItem(`marea-mock-repo-account:${path}`)
      return
    }
    return callAccounts('setRepoAccount', path, accountId)
  },

  // ---- Worktrees ----
  async worktrees(path: string): Promise<Worktree[]> {
    if (!isElectron) return mockWorktrees
    return call<Worktree[]>('worktrees', path)
  },
  async worktreeAdd(path: string, opts: WorktreeAddOptions) {
    if (!isElectron) return
    return call('worktreeAdd', path, opts)
  },
  async worktreeRemove(path: string, dir: string, force = false) {
    if (!isElectron) return
    return call('worktreeRemove', path, dir, force)
  },
  async worktreeLock(path: string, dir: string) {
    if (!isElectron) return
    return call('worktreeLock', path, dir)
  },
  async worktreeUnlock(path: string, dir: string) {
    if (!isElectron) return
    return call('worktreeUnlock', path, dir)
  },
  async worktreePrune(path: string) {
    if (!isElectron) return
    return call('worktreePrune', path)
  },

  // ---- Submódulos ----
  async submodules(path: string): Promise<Submodule[]> {
    if (!isElectron) return mockSubmodules
    return call<Submodule[]>('submodules', path)
  },
  async submoduleAdd(path: string, url: string, dir?: string) {
    if (!isElectron) return
    return call('submoduleAdd', path, url, dir)
  },
  async submoduleInit(path: string, dir?: string) {
    if (!isElectron) return
    return call('submoduleInit', path, dir)
  },
  async submoduleUpdate(path: string, dir?: string, opts: SubmoduleUpdateOptions = {}) {
    if (!isElectron) return
    return call('submoduleUpdate', path, dir, opts)
  },
  async submoduleSync(path: string, dir?: string) {
    if (!isElectron) return
    return call('submoduleSync', path, dir)
  },
  async submoduleSetUrl(path: string, dir: string, url: string) {
    if (!isElectron) return
    return call('submoduleSetUrl', path, dir, url)
  },

  // ---- Gitflow ----
  async gitflowConfig(path: string): Promise<GitflowConfig> {
    if (!isElectron) {
      await tick()
      return {
        initialized: true,
        master: 'main',
        develop: 'develop',
        featurePrefix: 'feature/',
        releasePrefix: 'release/',
        hotfixPrefix: 'hotfix/',
        tagPrefix: 'v'
      }
    }
    return call<GitflowConfig>('gitflowConfig', path)
  },
  async gitflowInit(path: string, cfg: GitflowConfig) {
    if (!isElectron) return
    return call('gitflowInit', path, cfg)
  },
  async gitflowStart(path: string, type: GitflowType, name: string) {
    if (!isElectron) return
    return call('gitflowStart', path, type, name)
  },
  async gitflowFinish(path: string, type: GitflowType, name: string, opts: GitflowFinishOptions = {}) {
    if (!isElectron) return
    return call('gitflowFinish', path, type, name, opts)
  },

  // ---- Operación en curso y conflictos ----
  async operationState(path: string): Promise<OperationState> {
    // Mock: merge en curso, acorde al archivo en conflicto de mockStatus.
    if (!isElectron) return { kind: 'merge' }
    return call<OperationState>('operationState', path)
  },
  async conflictVersions(path: string, file: string): Promise<ConflictVersions> {
    if (!isElectron) {
      await tick()
      return mockConflictVersions
    }
    return call<ConflictVersions>('conflictVersions', path, file)
  },
  async keepSide(path: string, file: string, side: 'ours' | 'theirs') {
    if (!isElectron) return
    return call('keepSide', path, file, side)
  },
  async markResolved(path: string, files: string[]) {
    if (!isElectron) return
    return call('markResolved', path, files)
  },
  async resolveDelete(path: string, file: string) {
    if (!isElectron) return
    return call('resolveDelete', path, file)
  },
  async continueOperation(path: string) {
    if (!isElectron) return
    return call('continueOperation', path)
  },
  async abortOperation(path: string) {
    if (!isElectron) return
    return call('abortOperation', path)
  },

  // ---- Rebase interactivo ----
  async commitsSince(path: string, base: string, head = 'HEAD'): Promise<Commit[]> {
    if (!isElectron) {
      await tick()
      // Mock: los 4 commits más recientes, del más antiguo al más nuevo.
      return [...mockRawCommits.slice(0, 4)].reverse()
    }
    return call<Commit[]>('commitsSince', path, base, head)
  },
  async interactiveRebase(
    path: string,
    base: string,
    plan: RebasePlanItem[],
    opts: { autostash?: boolean; head?: string } = {}
  ): Promise<RebaseResult> {
    if (!isElectron) return { completed: true, message: 'Successfully rebased (mock)' }
    return call<RebaseResult>('interactiveRebase', path, base, plan, opts)
  },

  // ---- Bisect ----
  async bisectState(path: string): Promise<BisectState> {
    if (!isElectron) return { active: false }
    return call<BisectState>('bisectState', path)
  },
  async bisectStart(path: string, opts: { bad: string; good: string }): Promise<string> {
    if (!isElectron) return 'Bisecting: 3 revisions left to test after this'
    return call<string>('bisectStart', path, opts)
  },
  async bisectMark(path: string, verdict: 'good' | 'bad', ref?: string): Promise<string> {
    if (!isElectron) return 'Bisecting: 1 revision left to test after this'
    return call<string>('bisectMark', path, verdict, ref)
  },
  async bisectReset(path: string) {
    if (!isElectron) return
    return call('bisectReset', path)
  }
}

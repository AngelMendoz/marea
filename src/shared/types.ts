// Tipos compartidos entre el proceso main (Node/Electron) y el renderer (React).

export interface RecentRepo {
  path: string
  name: string
  lastOpened: number
}

export interface RepoInfo {
  path: string
  name: string
  currentBranch: string
  isDetached: boolean
}

export interface RefDecoration {
  type: 'head' | 'localBranch' | 'remoteBranch' | 'tag'
  name: string
}

export interface Commit {
  hash: string
  shortHash: string
  parents: string[]
  authorName: string
  authorEmail: string
  /** Unix timestamp en segundos. */
  date: number
  subject: string
  refs: RefDecoration[]
}

/** Segmento de línea a dibujar dentro de la celda del grafo de un commit.
 *  y: 0 = borde superior, 0.5 = centro (nodo), 1 = borde inferior. */
export interface GraphSegment {
  fromCol: number
  fromY: number
  toCol: number
  toY: number
  color: string
}

export interface GraphRow {
  col: number
  color: string
  segments: GraphSegment[]
  /** Número máximo de columna que ocupa esta fila (para dimensionar). */
  maxCol: number
}

export interface CommitWithGraph extends Commit {
  graph: GraphRow
}

export interface LogResult {
  commits: CommitWithGraph[]
  /** Máximo de columnas en todo el grafo (ancho global). */
  maxCol: number
}

/** Opciones de paginación/búsqueda para `log`. */
export interface LogOptions {
  /** Cuántos commits traer en este lote. */
  maxCount?: number
  /** Cuántos commits saltar (paginación / scroll infinito). */
  skip?: number
  /** Búsqueda literal en el mensaje del commit (`--grep -i -F`). */
  grep?: string
  /** Filtro por autor (`--author`, literal con `-F`). */
  author?: string
  /** Incluir todas las ramas/refs (`--all`). Por defecto true. */
  all?: boolean
}

/** Un lote de commits en crudo (sin grafo; el renderer lo recalcula). */
export interface LogPage {
  commits: Commit[]
  /** Hay más commits más allá de este lote (para scroll infinito). */
  hasMore: boolean
}

export type FileChangeType =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted'
  | 'copied'
  | 'unknown'

export interface FileChange {
  path: string
  /** En renombrados, ruta anterior. */
  oldPath?: string
  type: FileChangeType
  staged: boolean
}

export interface StatusResult {
  staged: FileChange[]
  unstaged: FileChange[]
  conflicted: FileChange[]
  ahead: number
  behind: number
  current: string
  tracking: string | null
}

export interface Branch {
  name: string
  current: boolean
  isRemote: boolean
  upstream: string | null
  ahead: number
  behind: number
  tip: string
}

export interface BranchList {
  local: Branch[]
  remote: Branch[]
  current: string
}

export interface Remote {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface Stash {
  index: number
  message: string
  branch: string
  hash: string
}

export interface Tag {
  name: string
  hash: string
  annotated: boolean
}

export interface RefsResult {
  remotes: Remote[]
  tags: Tag[]
  stashes: Stash[]
  /** Remoto por defecto (checkout.defaultRemote o el primero). */
  defaultRemote: string
}

export interface CommitFile {
  path: string
  oldPath?: string
  type: FileChangeType
}

export type ResetMode = 'soft' | 'mixed' | 'hard'

export interface CloneOptions {
  url: string
  dir: string
}

export interface PushOptions {
  remote?: string
  branch?: string
  force?: boolean
  setUpstream?: boolean
  tags?: boolean
}

/** Estrategia de pull: merge (por defecto), rebase o solo fast-forward. */
export type PullMode = 'merge' | 'rebase' | 'ff-only'

export interface PullOptions {
  mode?: PullMode
  /** Remoto/rama concretos (por defecto el upstream de la rama actual). */
  remote?: string
  branch?: string
}

export interface PullRequest {
  number: number
  title: string
  state: string
  author: string
  head: string
  base: string
  url: string
  draft: boolean
  assignees: string[]
}

/** Detalle completo de un PR (vista de revisión). */
export interface PullRequestDetail extends PullRequest {
  body: string
  createdAt: number
  merged: boolean
  /** null = GitHub aún calcula la mergeabilidad. */
  mergeable: boolean | null
  /** SHA de la punta del head (necesario para comentarios en línea). */
  headSha: string
  /** head con owner (owner:rama) para PRs de forks. */
  headLabel: string
  additions: number
  deletions: number
  changedFiles: number
}

/** Archivo cambiado en un PR (GET /pulls/{n}/files). */
export interface PRFile {
  path: string
  previousPath?: string
  type: FileChangeType
  additions: number
  deletions: number
  /** Diff del archivo (solo hunks @@, sin cabecera de archivo). */
  patch?: string
}

/** Comentario de la conversación de un PR (general, de review o en línea). */
export interface PRComment {
  id: number
  author: string
  body: string
  createdAt: number
  kind: 'general' | 'review' | 'inline'
  /** Para kind 'review': APPROVED | CHANGES_REQUESTED | COMMENTED. */
  state?: string
  /** Para kind 'inline': archivo, línea y lado del diff (LEFT = lado viejo). */
  path?: string
  line?: number
  side?: 'LEFT' | 'RIGHT'
}

export type PRReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
export type PRMergeMethod = 'merge' | 'squash' | 'rebase'

/** Comentario en línea sobre el diff de un PR. */
export interface PRInlineComment {
  path: string
  line: number
  side: 'LEFT' | 'RIGHT'
  body: string
}

export interface CreatePROptions {
  title: string
  body?: string
  head: string
  base: string
  draft?: boolean
  reviewers?: string[]
  assignees?: string[]
  labels?: string[]
}

export interface GhLabel {
  name: string
  color: string
}

/** Issue del proveedor (GitHub primero; GitLab/Jira con el mismo contrato). */
export interface Issue {
  number: number
  title: string
  state: string
  author: string
  assignees: string[]
  labels: GhLabel[]
  /** Número de comentarios (para el contador de la lista). */
  comments: number
  createdAt: number
  url: string
  body: string
}

export interface IssueComment {
  id: number
  author: string
  body: string
  createdAt: number
}

export interface CreateIssueOptions {
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
}

/** Worktree vinculado del repositorio (git worktree list --porcelain). */
export interface Worktree {
  path: string
  head: string
  /** Rama checkout en el worktree (null = detached HEAD). */
  branch: string | null
  locked: boolean
  lockReason?: string
  bare: boolean
  /** git puede podarlo (directorio desaparecido). */
  prunable: boolean
  /** Es el working tree principal (no se puede eliminar ni bloquear). */
  main: boolean
}

/** Opciones para crear un worktree. */
export interface WorktreeAddOptions {
  /** Carpeta destino (no debe existir). */
  dir: string
  /** Rama existente a checkout en el worktree. */
  branch: string
}

/** Submódulo del repo (combinación de .gitmodules y `git submodule status`). */
export interface Submodule {
  name: string
  /** Ruta relativa dentro del repo padre. */
  path: string
  url: string
  /** SHA del commit del submódulo (el registrado si no está inicializado). */
  sha: string | null
  /** ok | carpeta sin clonar | checkout distinto al referenciado | conflictos. */
  status: 'ok' | 'uninitialized' | 'modified' | 'conflict'
}

export interface SubmoduleUpdateOptions {
  /** Trae el último commit del remoto (--remote) en vez del referenciado. */
  remote?: boolean
  /** Inicializa el submódulo si hace falta (--init). */
  init?: boolean
  /** Aplica también a submódulos anidados (--recursive). */
  recursive?: boolean
}

/** Pestañas guardadas de la sesión anterior (restauración al abrir). */
export interface SessionData {
  tabs: string[]
  active: string | null
}

/** Grupo de repositorios con nombre. Persistido en userData. */
export interface Workspace {
  name: string
  /** Rutas de los repos, en el orden elegido por el usuario. */
  repos: string[]
  createdAt: number
}

export interface WorkspacesData {
  workspaces: Workspace[]
  /** Nombre del workspace activo (se conserva entre sesiones). */
  active: string | null
}

/** Configuración Gitflow del repo (claves gitflow.* de git config). */
export interface GitflowConfig {
  initialized: boolean
  master: string
  develop: string
  featurePrefix: string
  releasePrefix: string
  hotfixPrefix: string
  tagPrefix: string
}

export type GitflowType = 'feature' | 'release' | 'hotfix'

export interface GitflowFinishOptions {
  /** Crear tag al finalizar (release/hotfix). */
  tag?: boolean
  tagName?: string
  message?: string
  /** Conservar la rama en vez de eliminarla. */
  keepBranch?: boolean
}

/** Estado de una sesión de git bisect en curso. */
export interface BisectState {
  active: boolean
  /** SHA completo del commit que se está probando (HEAD durante bisect). */
  current?: string
  /** Contenido de BISECT_LOG (marcas good/bad realizadas). */
  log?: string
}

/** Operación git multi-paso en curso (con posibles conflictos). */
export type OperationKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

export interface OperationState {
  kind: OperationKind | null
  /** Progreso del rebase (paso actual / total), si se conoce. */
  step?: number
  total?: number
}

/** Las tres versiones de un archivo en conflicto + el working tree con marcadores. */
export interface ConflictVersions {
  base: string | null
  ours: string | null
  theirs: string | null
  working: string
}

/** Acción por commit en un rebase interactivo. */
export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

export interface RebasePlanItem {
  hash: string
  action: RebaseAction
  /** Mensaje nuevo (reword) o mensaje final de la cadena (squash). */
  message?: string
}

export interface RebaseResult {
  /** false: el rebase quedó detenido (p. ej. conflictos); ver banner de operación. */
  completed: boolean
  message: string
}

/** Comparación entre dos referencias (commits/ramas/tags/stash). */
export interface RefDiffOptions {
  /** Referencia base (lado «viejo» del diff). */
  a: string
  /** Referencia destino. Vacía/omitida = working tree. */
  b?: string
  /** `a...b`: cambios de b desde el merge-base (en vez de `a b` exacto). */
  threeDots?: boolean
  /** Limita el diff a un archivo o carpeta. */
  file?: string
  ignoreWhitespace?: boolean
}

/** Entrada del historial de un archivo/carpeta. */
export interface FileHistoryEntry {
  commit: Commit
  /** Ruta del archivo EN ese commit (con --follow cambia en renombres). */
  path: string
}

export interface FileHistoryOptions {
  /** Archivo o carpeta a filtrar. Omitido = historial de la ref completa. */
  file?: string
  /** Ref de partida (por defecto HEAD). Permite historial de un tag/rama. */
  ref?: string
  /** Sigue renombres (`--follow`, solo válido con un archivo). */
  follow?: boolean
  maxCount?: number
}

/** Línea anotada por `git blame`. */
export interface BlameLine {
  /** SHA del commit que introdujo la línea (40 ceros = sin commitear). */
  hash: string
  shortHash: string
  author: string
  /** Unix timestamp en segundos. */
  date: number
  summary: string
  /** Número de línea en la versión mostrada (1-based). */
  lineNo: number
  text: string
}

/** Clave GPG secreta disponible para firmar. */
export interface GpgKey {
  /** Id largo de la clave (para user.signingkey). */
  id: string
  /** Identidad «Nombre <correo>» de la clave. */
  uid: string
}

/** Estado de la firma de un commit (`git log --format=%G?`). */
export interface SignatureInfo {
  /** G buena · B mala · U buena sin confianza · X/Y expirada · R revocada ·
   *  E no verificable · N sin firma. */
  code: string
  /** Identidad del firmante (si se pudo verificar). */
  signer: string
  /** Id de la clave usada. */
  key: string
}

/** Hooks del repositorio. */
export interface HooksInfo {
  /** Carpeta efectiva de hooks (core.hooksPath o .git/hooks). */
  dir: string
  /** Hooks activos (sin extensión .sample). */
  hooks: string[]
}

/** Opciones del commit. */
export interface CommitOptions {
  amend?: boolean
  /** Salta los hooks pre-commit/commit-msg (`--no-verify`). */
  noVerify?: boolean
  /** Fuerza la firma de este commit (`-S`), aunque commit.gpgsign sea false. */
  sign?: boolean
}

/** Proveedores de hosting soportados (GitHub implementado; el resto con
 *  contrato definido en `src/main/git/providers.ts`). */
export type ProviderKind =
  | 'github'
  | 'gitlab'
  | 'bitbucket-cloud'
  | 'bitbucket-server'
  | 'azure'
  | 'unknown'

export interface RepoHost {
  host: ProviderKind
  owner: string
  repo: string
}

/** Información Git LFS del repositorio. */
export interface LfsInfo {
  /** git-lfs está instalado en el sistema. */
  installed: boolean
  /** Salida de `git lfs version` (si está instalado). */
  version: string
  /** El repo usa LFS (.gitattributes con filter=lfs). */
  used: boolean
  /** Patrones rastreados por LFS en .gitattributes. */
  patterns: string[]
}

/** Archivo gestionado por LFS (`git lfs ls-files`). */
export interface LfsFile {
  oid: string
  path: string
}

/** Cuenta conectada de un proveedor. El token se guarda cifrado
 *  con safeStorage en el proceso main y nunca viaja al renderer. */
export interface Account {
  id: string
  provider: ProviderKind
  host: string
  username: string
}

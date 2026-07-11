import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, isAbsolute, join } from 'path'
import simpleGit, { type SimpleGit } from 'simple-git'
import type {
  BisectState,
  BlameLine,
  Branch,
  BranchList,
  CloneOptions,
  Commit,
  CommitFile,
  CommitOptions,
  ConflictVersions,
  FileChange,
  FileChangeType,
  FileHistoryEntry,
  FileHistoryOptions,
  GitflowConfig,
  GitflowFinishOptions,
  GitflowType,
  GpgKey,
  HooksInfo,
  LfsFile,
  LfsInfo,
  LogOptions,
  LogPage,
  OperationState,
  PullOptions,
  PushOptions,
  RebasePlanItem,
  RebaseResult,
  RefDecoration,
  RefDiffOptions,
  RefsResult,
  Remote,
  RepoInfo,
  ResetMode,
  SignatureInfo,
  Stash,
  StatusResult,
  Submodule,
  SubmoduleUpdateOptions,
  Tag,
  Worktree,
  WorktreeAddOptions
} from '../../shared/types'

const US = '\x1f' // separador de campos
const RS = '\x1e' // separador de registros

/** Ejecutable git a usar. Vacío = el `git` del PATH. */
let gitBinary = ''

function git(repoPath: string): SimpleGit {
  return simpleGit({
    baseDir: repoPath,
    maxConcurrentProcesses: 4,
    ...(gitBinary ? { binary: gitBinary } : {})
  })
}

/** Directorio .git real (soporta worktrees, donde .git es un archivo). */
async function resolveGitDir(repoPath: string): Promise<string | null> {
  try {
    const d = (await git(repoPath).revparse(['--git-dir'])).trim()
    return isAbsolute(d) ? d : join(repoPath, d)
  } catch {
    return null
  }
}

/** Ejecuta git con spawn (sin shell) capturando stdout/stderr. */
function execGit(
  repoPath: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(gitBinary || 'git', ['-C', repoPath, ...args], { env: opts.env ?? process.env })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d.toString()))
    p.stderr.on('data', (d) => (err += d.toString()))
    p.on('error', reject)
    p.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(err.trim() || out.trim() || `git salió con código ${code}`))
    )
    p.stdin.end()
  })
}

/** Parsea un registro individual del formato US usado por logPage. */
function parseLogRecord(line: string): Commit | null {
  if (!line.trim()) return null
  const [hash, parents, an, ae, at, subject, decoration] = line.split(US)
  if (!hash) return null
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    authorName: an,
    authorEmail: ae,
    date: parseInt(at, 10),
    subject,
    refs: parseRefs(decoration ?? '')
  }
}

/** Parsea la salida de `git log` con el formato US/RS usado por logPage. */
function parseLog(raw: string): Commit[] {
  const commits: Commit[] = []
  for (const record of raw.split(RS)) {
    const commit = parseLogRecord(record.replace(/^\n/, ''))
    if (commit) commits.push(commit)
  }
  return commits
}

const LOG_FORMAT = ['%H', '%P', '%an', '%ae', '%at', '%s', '%D'].join(US)

function parseRefs(decoration: string): RefDecoration[] {
  if (!decoration) return []
  const refs: RefDecoration[] = []
  for (let raw of decoration.split(',')) {
    raw = raw.trim()
    if (!raw) continue
    if (raw.startsWith('HEAD -> ')) {
      refs.push({ type: 'head', name: raw.slice('HEAD -> '.length) })
    } else if (raw === 'HEAD') {
      refs.push({ type: 'head', name: 'HEAD' })
    } else if (raw.startsWith('tag: ')) {
      refs.push({ type: 'tag', name: raw.slice('tag: '.length) })
    } else if (raw.includes('/')) {
      refs.push({ type: 'remoteBranch', name: raw })
    } else {
      refs.push({ type: 'localBranch', name: raw })
    }
  }
  return refs
}

function mapStatusCode(code: string): FileChangeType {
  switch (code) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case '?':
      return 'untracked'
    case 'U':
      return 'conflicted'
    default:
      return 'unknown'
  }
}

export const gitService = {
  async isRepo(repoPath: string): Promise<boolean> {
    if (!existsSync(repoPath)) return false
    try {
      return await git(repoPath).checkIsRepo()
    } catch {
      return false
    }
  },

  async open(repoPath: string): Promise<RepoInfo> {
    const g = git(repoPath)
    if (!(await g.checkIsRepo())) {
      throw new Error('La carpeta no es un repositorio Git válido.')
    }
    // Rama actual sin `git status` completo: status recorre todo el working
    // tree y hacía lenta la apertura (y la restauración de varias pestañas)
    // en repos grandes. symbolic-ref funciona incluso en ramas sin commits.
    let currentBranch = ''
    let isDetached = false
    try {
      currentBranch = (await g.raw(['symbolic-ref', '--short', '-q', 'HEAD'])).trim()
    } catch {
      /* detached HEAD */
    }
    if (!currentBranch) {
      isDetached = true
      try {
        currentBranch = (await g.revparse(['--short', 'HEAD'])).trim()
      } catch {
        currentBranch = 'HEAD'
      }
    }
    return {
      path: repoPath,
      name: basename(repoPath),
      currentBranch,
      isDetached
    }
  },

  async init(dir: string): Promise<RepoInfo> {
    await simpleGit({ baseDir: dir }).init()
    return this.open(dir)
  },

  async clone(opts: CloneOptions): Promise<string> {
    const name = opts.url
      .replace(/\.git$/, '')
      .split(/[\\/]/)
      .pop()!
    const target = join(opts.dir, name)
    await simpleGit({ baseDir: opts.dir }).clone(opts.url, target)
    return target
  },

  /** Lee un lote del historial en crudo; el renderer recalcula los carriles
   *  con la lista acumulada para que el scroll infinito sea estable.
   *  `grep`/`author` van como argv con `-F -i`: búsqueda literal. */
  async logPage(repoPath: string, opts: LogOptions = {}): Promise<LogPage> {
    const { maxCount = 500, skip = 0, grep, author, all = true } = opts
    const args = ['log']
    if (all) args.push('--all')
    args.push(
      '--date-order',
      `--pretty=format:${LOG_FORMAT}${RS}`,
      `--max-count=${maxCount}`,
      `--skip=${skip}`
    )
    if (grep || author) args.push('-i', '-F')
    if (grep) args.push(`--grep=${grep}`)
    if (author) args.push(`--author=${author}`)

    const commits = parseLog(await git(repoPath).raw(args))
    // Heurística: si llenó el lote, probablemente haya más.
    return { commits, hasMore: commits.length === maxCount }
  },

  async status(repoPath: string): Promise<StatusResult> {
    const s = await git(repoPath).status()
    const staged: FileChange[] = []
    const unstaged: FileChange[] = []
    const conflicted: FileChange[] = []

    const conflictSet = new Set(s.conflicted)

    for (const f of s.files) {
      const path = f.path
      if (conflictSet.has(path)) {
        conflicted.push({ path, type: 'conflicted', staged: false })
        continue
      }
      // index = staged side, working_dir = unstaged side
      const index = f.index?.trim()
      const wd = f.working_dir?.trim()
      if (index && index !== '?') {
        staged.push({ path, type: mapStatusCode(index), staged: true })
      }
      if (wd) {
        unstaged.push({ path, type: mapStatusCode(wd), staged: false })
      }
    }

    return {
      staged,
      unstaged,
      conflicted,
      ahead: s.ahead,
      behind: s.behind,
      current: s.current ?? 'HEAD',
      tracking: s.tracking ?? null
    }
  },

  async branches(repoPath: string): Promise<BranchList> {
    const g = git(repoPath)
    const summary = await g.branch(['-vv', '--all'])
    const local: Branch[] = []
    const remote: Branch[] = []

    for (const name of summary.all) {
      const info = summary.branches[name]
      const isRemote = name.startsWith('remotes/')
      const cleanName = isRemote ? name.replace(/^remotes\//, '') : name

      // Extraer upstream y ahead/behind del label "[origin/main: ahead 1, behind 2]".
      let upstream: string | null = null
      let ahead = 0
      let behind = 0
      const label = info.label ?? ''
      const m = label.match(/^\[([^\]:]+)(?::\s*(.+))?\]/)
      if (m) {
        upstream = m[1]
        const detail = m[2] ?? ''
        const aheadM = detail.match(/ahead (\d+)/)
        const behindM = detail.match(/behind (\d+)/)
        if (aheadM) ahead = parseInt(aheadM[1], 10)
        if (behindM) behind = parseInt(behindM[1], 10)
      }

      const branch: Branch = {
        name: cleanName,
        current: info.current,
        isRemote,
        upstream,
        ahead,
        behind,
        tip: info.commit
      }
      if (isRemote) remote.push(branch)
      else local.push(branch)
    }

    return { local, remote, current: summary.current }
  },

  async refs(repoPath: string): Promise<RefsResult> {
    const g = git(repoPath)

    const remotesRaw = await g.getRemotes(true)
    const remotes: Remote[] = remotesRaw.map((r) => ({
      name: r.name,
      fetchUrl: r.refs.fetch,
      pushUrl: r.refs.push
    }))

    const tags: Tag[] = []
    try {
      const tagRaw = await g.raw([
        'for-each-ref',
        '--format=%(refname:short)' + US + '%(objectname:short)' + US + '%(objecttype)',
        'refs/tags'
      ])
      for (const line of tagRaw.split('\n')) {
        if (!line.trim()) continue
        const [name, hash, type] = line.split(US)
        tags.push({ name, hash, annotated: type === 'tag' })
      }
    } catch {
      /* sin tags */
    }

    const stashes: Stash[] = []
    try {
      const stashRaw = await g.raw([
        'stash',
        'list',
        '--format=%gd' + US + '%gs' + US + '%H'
      ])
      stashRaw.split('\n').forEach((line, i) => {
        if (!line.trim()) return
        const [, message, hash] = line.split(US)
        let branch = ''
        const bm = message.match(/On ([^:]+):/)
        if (bm) branch = bm[1]
        stashes.push({ index: i, message, branch, hash })
      })
    } catch {
      /* sin stashes */
    }

    // Remoto por defecto: checkout.defaultRemote o el primero.
    let defaultRemote = ''
    try {
      defaultRemote = (await g.raw(['config', '--get', 'checkout.defaultRemote'])).trim()
    } catch {
      /* sin configurar */
    }
    if (!remotes.some((r) => r.name === defaultRemote)) defaultRemote = remotes[0]?.name ?? ''

    return { remotes, tags, stashes, defaultRemote }
  },

  async diff(
    repoPath: string,
    opts: { file?: string; staged?: boolean; commit?: string; ignoreWhitespace?: boolean }
  ): Promise<string> {
    const g = git(repoPath)
    if (opts.commit) {
      // Diff de un commit concreto (vs su primer padre).
      const showArgs = ['show', '--format=', opts.commit]
      if (opts.ignoreWhitespace) showArgs.push('-w')
      if (opts.file) showArgs.push('--', opts.file)
      return g.raw(showArgs)
    }
    const args: string[] = ['diff']
    if (opts.ignoreWhitespace) args.push('-w')
    if (opts.staged) args.push('--cached')
    if (opts.file) args.push('--', opts.file)
    return g.raw(args)
  },

  // ---------- Comparaciones avanzadas, File History y Blame ----------

  /** Diff entre dos referencias cualesquiera (commits/ramas/tags/stash).
   *  Sin `b` compara contra el working tree. `threeDots` usa el merge-base. */
  async diffRefs(repoPath: string, opts: RefDiffOptions): Promise<string> {
    const args = ['diff']
    if (opts.ignoreWhitespace) args.push('-w')
    if (opts.b) {
      if (opts.threeDots) args.push(`${opts.a}...${opts.b}`)
      else args.push(opts.a, opts.b)
    } else {
      args.push(opts.a)
    }
    if (opts.file) args.push('--', opts.file)
    return git(repoPath).raw(args)
  },

  /** Archivos que cambian entre dos refs (`diff --name-status -M`). */
  async diffRefsFiles(repoPath: string, opts: RefDiffOptions): Promise<CommitFile[]> {
    const args = ['diff', '--name-status', '-M']
    if (opts.b) {
      if (opts.threeDots) args.push(`${opts.a}...${opts.b}`)
      else args.push(opts.a, opts.b)
    } else {
      args.push(opts.a)
    }
    const raw = await git(repoPath).raw(args)
    const files: CommitFile[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const code = parts[0][0]
      if (code === 'R' || code === 'C') {
        files.push({ type: mapStatusCode(code), oldPath: parts[1], path: parts[2] })
      } else {
        files.push({ type: mapStatusCode(code), path: parts[1] })
      }
    }
    return files
  },

  /** Historial de un archivo, carpeta o ref. Con `follow` (solo archivos)
   *  sigue renombres y devuelve la ruta que el archivo tenía en cada commit. */
  async fileHistory(repoPath: string, opts: FileHistoryOptions = {}): Promise<FileHistoryEntry[]> {
    const { file, ref, follow, maxCount = 500 } = opts
    const useFollow = !!follow && !!file
    // RS al INICIO del formato: con --name-only los nombres van después de
    // cada registro y así quedan dentro del mismo trozo al hacer split(RS).
    const args = ['log', `--pretty=format:${RS}${LOG_FORMAT}`, `--max-count=${maxCount}`]
    args.push(ref || 'HEAD')
    if (useFollow) args.push('--follow', '--name-only')
    if (file) args.push('--', file)
    const raw = await git(repoPath).raw(args)

    const out: FileHistoryEntry[] = []
    for (const chunk of raw.split(RS)) {
      if (!chunk.trim()) continue
      const [head, ...rest] = chunk.split('\n')
      const commit = parseLogRecord(head)
      if (!commit) continue
      const pathAt = useFollow ? rest.find((l) => l.trim())?.trim() : undefined
      out.push({ commit, path: pathAt || file || '' })
    }
    return out
  },

  /** Anotación por línea (`git blame --line-porcelain`). `ref` opcional para
   *  anotar la versión de un commit concreto en vez del working tree. */
  async blame(repoPath: string, file: string, ref?: string): Promise<BlameLine[]> {
    const args = ['blame', '--line-porcelain']
    if (ref) args.push(ref)
    args.push('--', file)
    const raw = await execGit(repoPath, args)

    const lines: BlameLine[] = []
    let cur: Partial<BlameLine> | null = null
    for (const line of raw.split('\n')) {
      const head = line.match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/)
      if (head) {
        cur = { hash: head[1], shortHash: head[1].slice(0, 7), lineNo: parseInt(head[2], 10) }
      } else if (!cur) {
        continue
      } else if (line.startsWith('author ')) {
        cur.author = line.slice('author '.length)
      } else if (line.startsWith('author-time ')) {
        cur.date = parseInt(line.slice('author-time '.length), 10)
      } else if (line.startsWith('summary ')) {
        cur.summary = line.slice('summary '.length)
      } else if (line.startsWith('\t')) {
        lines.push({
          hash: cur.hash!,
          shortHash: cur.shortHash!,
          author: cur.author ?? '',
          date: cur.date ?? 0,
          summary: cur.summary ?? '',
          lineNo: cur.lineNo!,
          text: line.slice(1)
        })
        cur = null
      }
    }
    return lines
  },

  /** Restaura en el working tree la versión de `file` en `ref` (sin tocar el
   *  índice). Si el archivo tenía otro nombre en esa revisión, lo recrea ahí. */
  async restoreFileVersion(repoPath: string, file: string, ref: string): Promise<void> {
    await execGit(repoPath, ['restore', '--source', ref, '--worktree', '--', file])
  },

  /** Contenido completo de un archivo (para "File View"). */
  async fileContent(
    repoPath: string,
    opts: { file: string; staged?: boolean; commit?: string }
  ): Promise<string> {
    const g = git(repoPath)
    try {
      if (opts.commit) return await g.show([`${opts.commit}:${opts.file}`])
      if (opts.staged) return await g.show([`:${opts.file}`])
      return readFileSync(join(repoPath, opts.file), 'utf-8')
    } catch {
      return ''
    }
  },

  /** Guarda el contenido de un archivo del working tree (editor in-app). */
  async writeFile(repoPath: string, file: string, content: string): Promise<void> {
    writeFileSync(join(repoPath, file), content, 'utf-8')
  },

  /**
   * Aplica un parche de un solo hunk (staging/unstaging/descarte parcial).
   * mode: stage (unstaged→index) | unstage (index→unstaged) | discard (quita del working).
   * opts.recount: git recalcula los rangos @@ (parches por línea construidos en la UI).
   */
  async applyPatch(
    repoPath: string,
    patch: string,
    mode: 'stage' | 'unstage' | 'discard',
    opts: { recount?: boolean } = {}
  ): Promise<void> {
    const args = ['-C', repoPath, 'apply', '--whitespace=nowarn']
    if (opts.recount) args.push('--recount')
    if (mode === 'stage') args.push('--cached')
    else if (mode === 'unstage') args.push('--cached', '--reverse')
    else args.push('--reverse')

    await new Promise<void>((resolve, reject) => {
      const p = spawn('git', args)
      let err = ''
      p.stderr.on('data', (d) => (err += d.toString()))
      p.on('error', reject)
      p.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(err.trim() || `git apply salió con código ${code}`))
      )
      p.stdin.write(patch.endsWith('\n') ? patch : patch + '\n')
      p.stdin.end()
    })
  },

  async commitFiles(repoPath: string, sha: string): Promise<CommitFile[]> {
    const raw = await git(repoPath).raw([
      'show',
      '--name-status',
      '--format=',
      sha
    ])
    const files: CommitFile[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const code = parts[0][0]
      if (code === 'R' || code === 'C') {
        files.push({ type: mapStatusCode(code), oldPath: parts[1], path: parts[2] })
      } else {
        files.push({ type: mapStatusCode(code), path: parts[1] })
      }
    }
    return files
  },

  async stage(repoPath: string, files: string[]): Promise<void> {
    await git(repoPath).add(files)
  },

  async stageAll(repoPath: string): Promise<void> {
    await git(repoPath).add(['-A'])
  },

  async unstage(repoPath: string, files: string[]): Promise<void> {
    await git(repoPath).reset(['HEAD', '--', ...files])
  },

  async unstageAll(repoPath: string): Promise<void> {
    await git(repoPath).reset(['HEAD'])
  },

  async discard(repoPath: string, files: string[]): Promise<void> {
    const g = git(repoPath)
    // checkout descarta cambios de archivos rastreados; clean elimina no rastreados.
    await g.checkout(['--', ...files]).catch(() => undefined)
    await g.clean('f', ['--', ...files]).catch(() => undefined)
  },

  async commit(repoPath: string, message: string, opts: CommitOptions = {}): Promise<void> {
    const options: Record<string, null> = {}
    if (opts.amend) options['--amend'] = null
    // Saltar hooks pre-commit/commit-msg.
    if (opts.noVerify) options['--no-verify'] = null
    // Firma puntual; la firma automática la aporta commit.gpgsign en config.
    if (opts.sign) options['-S'] = null
    await git(repoPath).commit(message, undefined, options)
  },

  async checkout(repoPath: string, ref: string): Promise<void> {
    await git(repoPath).checkout(ref)
  },

  async createBranch(
    repoPath: string,
    name: string,
    opts: { startPoint?: string; checkout?: boolean } = {}
  ): Promise<void> {
    const g = git(repoPath)
    if (opts.checkout) {
      const args = ['-b', name]
      if (opts.startPoint) args.push(opts.startPoint)
      await g.checkout(args)
    } else {
      const args = [name]
      if (opts.startPoint) args.push(opts.startPoint)
      await g.branch(args)
    }
  },

  async deleteBranch(repoPath: string, name: string, force = false): Promise<void> {
    await git(repoPath).branch([force ? '-D' : '-d', name])
  },

  async renameBranch(repoPath: string, oldName: string, newName: string): Promise<void> {
    await git(repoPath).branch(['-m', oldName, newName])
  },

  async merge(repoPath: string, ref: string, opts: { squash?: boolean; noFf?: boolean } = {}): Promise<void> {
    const args = [ref]
    if (opts.squash) args.push('--squash')
    if (opts.noFf) args.push('--no-ff')
    await git(repoPath).merge(args)
  },

  async rebase(repoPath: string, onto: string): Promise<void> {
    await git(repoPath).rebase([onto])
  },

  async cherryPick(repoPath: string, sha: string): Promise<void> {
    await git(repoPath).raw(['cherry-pick', sha])
  },

  /** Merge de `source` en `target` (drag & drop de ramas); hace checkout de
   *  `target` primero. mode: ff (--ff-only) | merge | squash | noff (--no-ff). */
  async mergeInto(
    repoPath: string,
    source: string,
    target: string,
    mode: 'ff' | 'merge' | 'squash' | 'noff' = 'merge'
  ): Promise<void> {
    const g = git(repoPath)
    await g.checkout(target)
    const args: string[] = []
    if (mode === 'ff') args.push('--ff-only')
    else if (mode === 'noff') args.push('--no-ff')
    else if (mode === 'squash') args.push('--squash')
    args.push(source)
    await g.merge(args)
    if (mode === 'squash') {
      await g.commit(`Squash merge ${source} into ${target}`)
    }
  },

  /** Rebase de `branch` sobre `onto` (checkout branch primero). */
  async rebaseOnto(repoPath: string, branch: string, onto: string): Promise<void> {
    const g = git(repoPath)
    await g.checkout(branch)
    await g.rebase([onto])
  },

  async revert(repoPath: string, sha: string): Promise<void> {
    await git(repoPath).raw(['revert', '--no-edit', sha])
  },

  async reset(repoPath: string, mode: ResetMode, ref: string): Promise<void> {
    await git(repoPath).reset([`--${mode}`, ref])
  },

  /** Resetea una rama concreta a un commit (checkout branch + reset). */
  async resetBranchTo(
    repoPath: string,
    branch: string,
    ref: string,
    mode: ResetMode = 'hard'
  ): Promise<void> {
    const g = git(repoPath)
    await g.checkout(branch)
    await g.reset([`--${mode}`, ref])
  },

  async fetch(repoPath: string, opts: { prune?: boolean } = {}): Promise<void> {
    const args = ['--all']
    if (opts.prune) args.push('--prune')
    await git(repoPath).fetch(args)
  },

  async pull(repoPath: string, opts: PullOptions = {}): Promise<void> {
    const args: string[] = []
    if (opts.mode === 'rebase') args.push('--rebase')
    else if (opts.mode === 'ff-only') args.push('--ff-only')
    if (opts.remote) {
      args.push(opts.remote)
      if (opts.branch) args.push(opts.branch)
    }
    await git(repoPath).pull(args)
  },

  async push(repoPath: string, opts: PushOptions = {}): Promise<void> {
    const g = git(repoPath)
    const args: string[] = []
    if (opts.tags) args.push('--tags')
    if (opts.force) args.push('--force-with-lease')
    if (opts.setUpstream) {
      // `--set-upstream` requiere destino explícito: <remoto> <rama>.
      const remote = opts.remote || 'origin'
      const branch = opts.branch || (await g.revparse(['--abbrev-ref', 'HEAD'])).trim()
      args.push('--set-upstream', remote, branch)
    } else {
      if (opts.remote) args.push(opts.remote)
      if (opts.branch) args.push(opts.branch)
    }
    await g.push(args)
  },

  async stashCreate(repoPath: string, message?: string): Promise<void> {
    const args = ['push']
    if (message) args.push('-m', message)
    await git(repoPath).stash(args)
  },

  async stashApply(repoPath: string, index: number): Promise<void> {
    await git(repoPath).stash(['apply', `stash@{${index}}`])
  },

  async stashPop(repoPath: string, index: number): Promise<void> {
    await git(repoPath).stash(['pop', `stash@{${index}}`])
  },

  async stashDrop(repoPath: string, index: number): Promise<void> {
    await git(repoPath).stash(['drop', `stash@{${index}}`])
  },

  /** «Renombra» un stash: el mensaje vive en el reflog de refs/stash, así que
   *  se descarta la entrada y se guarda el mismo commit con el mensaje nuevo.
   *  El SHA se resuelve antes del drop; `stash store` sobre el tope actual
   *  sería un no-op, por eso el drop va primero. */
  async stashRename(repoPath: string, index: number, message: string): Promise<void> {
    const rev = (await execGit(repoPath, ['rev-parse', `stash@{${index}}`])).trim()
    await execGit(repoPath, ['stash', 'drop', `stash@{${index}}`])
    await execGit(repoPath, ['stash', 'store', '-m', message, rev])
  },

  async createTag(
    repoPath: string,
    name: string,
    opts: { message?: string; ref?: string } = {}
  ): Promise<void> {
    const args = []
    if (opts.message) {
      args.push('-a', name, '-m', opts.message)
    } else {
      args.push(name)
    }
    if (opts.ref) args.push(opts.ref)
    await git(repoPath).tag(args)
  },

  async deleteTag(repoPath: string, name: string): Promise<void> {
    await git(repoPath).tag(['-d', name])
  },

  // ---------- Tags avanzado y Git LFS ----------

  /** «Renombra» un tag: git no renombra, así que se crea con el nombre nuevo
   *  (apuntando al mismo objeto: conserva la anotación) y se borra el viejo.
   *  Con opts.remote actualiza también el remoto (push nuevo + borrar viejo). */
  async renameTag(
    repoPath: string,
    oldName: string,
    newName: string,
    opts: { remote?: string } = {}
  ): Promise<void> {
    await execGit(repoPath, ['tag', newName, oldName])
    await execGit(repoPath, ['tag', '-d', oldName])
    if (opts.remote) {
      await execGit(repoPath, ['push', opts.remote, `refs/tags/${newName}`, `:refs/tags/${oldName}`])
    }
  },

  /** Publica un tag concreto en el remoto. */
  async pushTag(repoPath: string, name: string, remote: string): Promise<void> {
    await execGit(repoPath, ['push', remote, `refs/tags/${name}`])
  },

  /** Borra un tag del remoto (el local se borra con deleteTag). */
  async deleteRemoteTag(repoPath: string, remote: string, name: string): Promise<void> {
    await execGit(repoPath, ['push', remote, `:refs/tags/${name}`])
  },

  /** Estado Git LFS: instalación, versión y si el repo lo usa (.gitattributes). */
  async lfsInfo(repoPath: string): Promise<LfsInfo> {
    const version = await new Promise<string>((resolve) => {
      const p = spawn(gitBinary || 'git', ['lfs', 'version'])
      let out = ''
      p.stdout.on('data', (d) => (out += d.toString()))
      p.on('error', () => resolve(''))
      p.on('close', (code) => resolve(code === 0 ? out.trim() : ''))
    })
    const patterns: string[] = []
    try {
      const attrs = readFileSync(join(repoPath, '.gitattributes'), 'utf-8')
      for (const line of attrs.split('\n')) {
        if (/filter=lfs/.test(line)) {
          const pattern = line.trim().split(/\s+/)[0]
          if (pattern) patterns.push(pattern)
        }
      }
    } catch {
      /* sin .gitattributes */
    }
    return { installed: !!version, version, used: patterns.length > 0, patterns }
  },

  /** Archivos gestionados por LFS (`git lfs ls-files`). */
  async lfsFiles(repoPath: string): Promise<LfsFile[]> {
    const raw = await execGit(repoPath, ['lfs', 'ls-files'])
    const out: LfsFile[] = []
    for (const line of raw.split('\n')) {
      // Formato: «<oid corto> [*-] <ruta>» (el * marca contenido descargado).
      const m = line.match(/^(\S+)\s+[*-]\s+(.+)$/)
      if (m) out.push({ oid: m[1], path: m[2] })
    }
    return out
  },

  /** Descarga el contenido binario LFS de la rama actual. */
  async lfsPull(repoPath: string): Promise<void> {
    await execGit(repoPath, ['lfs', 'pull'])
  },

  async addRemote(repoPath: string, name: string, url: string): Promise<void> {
    await git(repoPath).addRemote(name, url)
  },

  async removeRemote(repoPath: string, name: string): Promise<void> {
    await git(repoPath).removeRemote(name)
  },

  // ---------- Remotos y sincronización avanzada ----------

  /** Cambia la URL de fetch (o la de push con opts.push) de un remoto. */
  async setRemoteUrl(
    repoPath: string,
    name: string,
    url: string,
    opts: { push?: boolean } = {}
  ): Promise<void> {
    const args = ['remote', 'set-url']
    if (opts.push) args.push('--push')
    args.push(name, url)
    await execGit(repoPath, args)
  },

  async renameRemote(repoPath: string, oldName: string, newName: string): Promise<void> {
    await execGit(repoPath, ['remote', 'rename', oldName, newName])
  },

  /** Fija el remoto por defecto del repo (checkout.defaultRemote). */
  async setDefaultRemote(repoPath: string, name: string): Promise<void> {
    await this.setConfig(repoPath, 'checkout.defaultRemote', name)
  },

  /** Trae los cambios de un remoto concreto. */
  async fetchRemote(repoPath: string, remote: string, opts: { prune?: boolean } = {}): Promise<void> {
    const args = [remote]
    if (opts.prune) args.unshift('--prune')
    await git(repoPath).fetch(args)
  },

  /** Actualiza una rama remota concreta (fetch remoto rama). */
  async fetchRemoteBranch(repoPath: string, remote: string, branch: string): Promise<void> {
    await git(repoPath).fetch([remote, branch])
  },

  /** Elimina una rama del remoto (git push <remoto> --delete <rama>). */
  async deleteRemoteBranch(repoPath: string, remote: string, branch: string): Promise<void> {
    await execGit(repoPath, ['push', remote, '--delete', branch])
  },

  /** Configura (o quita, con valor vacío) el upstream de una rama local. */
  async setUpstream(repoPath: string, branch: string, remoteBranch: string): Promise<void> {
    if (remoteBranch) {
      await execGit(repoPath, ['branch', `--set-upstream-to=${remoteBranch}`, branch])
    } else {
      await execGit(repoPath, ['branch', '--unset-upstream', branch])
    }
  },

  // ---------- Worktrees ----------

  /** Lista los worktrees del repo parseando `git worktree list --porcelain`.
   *  El primero de la lista es siempre el working tree principal. */
  async worktrees(repoPath: string): Promise<Worktree[]> {
    const raw = await execGit(repoPath, ['worktree', 'list', '--porcelain'])
    const out: Worktree[] = []
    let cur: Partial<Worktree> | null = null
    const flush = (): void => {
      if (cur?.path) {
        out.push({
          path: cur.path,
          head: cur.head ?? '',
          branch: cur.branch ?? null,
          locked: !!cur.locked,
          lockReason: cur.lockReason,
          bare: !!cur.bare,
          prunable: !!cur.prunable,
          main: out.length === 0
        })
      }
      cur = null
    }
    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        flush()
        cur = { path: line.slice('worktree '.length).replace(/\\/g, '/') }
      } else if (!cur) {
        continue
      } else if (line.startsWith('HEAD ')) {
        cur.head = line.slice(5)
      } else if (line.startsWith('branch ')) {
        cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
      } else if (line === 'bare') {
        cur.bare = true
      } else if (line === 'detached') {
        cur.branch = null
      } else if (line.startsWith('locked')) {
        cur.locked = true
        const reason = line.slice('locked'.length).trim()
        if (reason) cur.lockReason = reason
      } else if (line.startsWith('prunable')) {
        cur.prunable = true
      }
    }
    flush()
    return out
  },

  /** Crea un worktree en `dir` con checkout de la rama indicada. */
  async worktreeAdd(repoPath: string, opts: WorktreeAddOptions): Promise<void> {
    await execGit(repoPath, ['worktree', 'add', opts.dir, opts.branch])
  },

  /** Elimina un worktree (con --force si está sucio y el usuario confirma). */
  async worktreeRemove(repoPath: string, dir: string, force = false): Promise<void> {
    const args = ['worktree', 'remove']
    if (force) args.push('--force')
    args.push(dir)
    await execGit(repoPath, args)
  },

  async worktreeLock(repoPath: string, dir: string): Promise<void> {
    await execGit(repoPath, ['worktree', 'lock', dir])
  },

  async worktreeUnlock(repoPath: string, dir: string): Promise<void> {
    await execGit(repoPath, ['worktree', 'unlock', dir])
  },

  /** Poda registros de worktrees cuyo directorio ya no existe. */
  async worktreePrune(repoPath: string): Promise<void> {
    await execGit(repoPath, ['worktree', 'prune'])
  },

  // ---------- Submodules ----------

  /** Lista los submódulos combinando `.gitmodules` (nombre/ruta/url) con
   *  `git submodule status` (SHA y estado por ruta). */
  async submodules(repoPath: string): Promise<Submodule[]> {
    if (!existsSync(join(repoPath, '.gitmodules'))) return []
    let cfg = ''
    try {
      cfg = await execGit(repoPath, ['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\.'])
    } catch {
      return [] // .gitmodules existe pero no tiene entradas
    }
    const entries = new Map<string, { path?: string; url?: string }>()
    for (const line of cfg.split('\n')) {
      if (!line.trim()) continue
      const sp = line.indexOf(' ')
      if (sp < 0) continue
      const m = line.slice(0, sp).match(/^submodule\.(.+)\.(path|url)$/)
      if (!m) continue
      const entry = entries.get(m[1]) ?? {}
      entry[m[2] as 'path' | 'url'] = line.slice(sp + 1).trim()
      entries.set(m[1], entry)
    }

    // `git submodule status`: «<flag><sha> <ruta> (<describe>)» donde flag es
    // '-' sin inicializar, '+' checkout distinto al referenciado, 'U' conflictos.
    const states = new Map<string, { sha: string; status: Submodule['status'] }>()
    try {
      const raw = await execGit(repoPath, ['submodule', 'status'])
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        const flag = line[0]
        const rest = line.slice(1)
        const sp = rest.indexOf(' ')
        if (sp < 0) continue
        const sha = rest.slice(0, sp)
        let p = rest.slice(sp + 1)
        const paren = p.lastIndexOf(' (')
        if (paren > 0 && p.endsWith(')')) p = p.slice(0, paren)
        const status: Submodule['status'] =
          flag === '-' ? 'uninitialized' : flag === '+' ? 'modified' : flag === 'U' ? 'conflict' : 'ok'
        states.set(p.replace(/\\/g, '/'), { sha, status })
      }
    } catch {
      /* sin submódulos registrados en el índice */
    }

    const out: Submodule[] = []
    for (const [name, e] of entries) {
      if (!e.path) continue
      const st = states.get(e.path)
      out.push({
        name,
        path: e.path,
        url: e.url ?? '',
        sha: st?.sha ?? null,
        status: st?.status ?? 'uninitialized'
      })
    }
    return out
  },

  /** Añade un submódulo: clona, escribe .gitmodules y stagea la referencia. */
  async submoduleAdd(repoPath: string, url: string, dir?: string): Promise<void> {
    const args = ['submodule', 'add', url]
    if (dir) args.push(dir)
    await execGit(repoPath, args)
  },

  /** Registra los submódulos en la config local (sin clonar contenidos). */
  async submoduleInit(repoPath: string, dir?: string): Promise<void> {
    const args = ['submodule', 'init']
    if (dir) args.push('--', dir)
    await execGit(repoPath, args)
  },

  /** Actualiza el contenido del submódulo (al commit referenciado, o al último
   *  del remoto con `remote`). Sin `dir` actúa sobre todos. */
  async submoduleUpdate(
    repoPath: string,
    dir?: string,
    opts: SubmoduleUpdateOptions = {}
  ): Promise<void> {
    const args = ['submodule', 'update']
    if (opts.init) args.push('--init')
    if (opts.remote) args.push('--remote')
    if (opts.recursive) args.push('--recursive')
    if (dir) args.push('--', dir)
    await execGit(repoPath, args)
  },

  /** Sincroniza las URLs de .gitmodules hacia la config local del repo. */
  async submoduleSync(repoPath: string, dir?: string): Promise<void> {
    const args = ['submodule', 'sync', '--recursive']
    if (dir) args.push('--', dir)
    await execGit(repoPath, args)
  },

  /** Cambia la URL del submódulo (.gitmodules) y sincroniza la config local. */
  async submoduleSetUrl(repoPath: string, dir: string, url: string): Promise<void> {
    await execGit(repoPath, ['submodule', 'set-url', dir, url])
  },

  // ---------- Firmas GPG/SSH, hooks y plantillas ----------

  /** Lee varias claves de config de una vez (lookup normal: local > global,
   *  o un ámbito concreto con opts.scope). Las claves ausentes vuelven como
   *  cadena vacía. */
  async getConfig(
    repoPath: string,
    keys: string[],
    opts: { scope?: 'global' | 'local' } = {}
  ): Promise<Record<string, string>> {
    const g = git(repoPath)
    const scope = opts.scope ? [`--${opts.scope}`] : []
    const out: Record<string, string> = {}
    await Promise.all(
      keys.map(async (key) => {
        try {
          out[key] = (await g.raw(['config', ...scope, '--get', key])).trim()
        } catch {
          out[key] = ''
        }
      })
    )
    return out
  },

  /** Escribe (o borra, con valor vacío) una clave de config local o global. */
  async setConfig(
    repoPath: string,
    key: string,
    value: string,
    opts: { global?: boolean } = {}
  ): Promise<void> {
    const scope = opts.global ? ['--global'] : []
    if (value === '') {
      await execGit(repoPath, ['config', ...scope, '--unset', key]).catch(() => {
        /* la clave no existía */
      })
    } else {
      await execGit(repoPath, ['config', ...scope, key, value])
    }
  },

  // ---------- Preferencias ----------

  /** Cambia el ejecutable git que usan todas las operaciones ('' = el del PATH).
   *  Valida que el binario responde a --version antes de aceptarlo. */
  async setGitBinary(path: string): Promise<string> {
    const bin = path.trim()
    if (bin) {
      const version = await new Promise<string>((resolve, reject) => {
        const p = spawn(bin, ['--version'])
        let out = ''
        p.stdout.on('data', (d) => (out += d.toString()))
        p.on('error', () => reject(new Error(`No se pudo ejecutar «${bin}»`)))
        p.on('close', (code) =>
          code === 0 && out.includes('git version')
            ? resolve(out.trim())
            : reject(new Error(`«${bin}» no parece ser un ejecutable git válido`))
        )
      })
      gitBinary = bin
      return version
    }
    gitBinary = ''
    return this.gitVersion()
  },

  /** Versión del ejecutable git en uso (`git --version`). */
  async gitVersion(): Promise<string> {
    return new Promise((resolve) => {
      const p = spawn(gitBinary || 'git', ['--version'])
      let out = ''
      p.stdout.on('data', (d) => (out += d.toString()))
      p.on('error', () => resolve(''))
      p.on('close', () => resolve(out.trim()))
    })
  },

  /** Claves GPG secretas disponibles (`gpg --list-secret-keys --with-colons`).
   *  Devuelve [] si gpg no está instalado. */
  async listGpgKeys(): Promise<GpgKey[]> {
    const raw = await new Promise<string>((resolve) => {
      const p = spawn('gpg', ['--list-secret-keys', '--with-colons'])
      let out = ''
      p.stdout.on('data', (d) => (out += d.toString()))
      p.on('error', () => resolve('')) // gpg no instalado
      p.on('close', () => resolve(out))
    })
    const keys: GpgKey[] = []
    let cur: GpgKey | null = null
    for (const line of raw.split('\n')) {
      const f = line.split(':')
      if (f[0] === 'sec') {
        cur = { id: f[4] ?? '', uid: '' }
        keys.push(cur)
      } else if (f[0] === 'uid' && cur && !cur.uid) {
        cur.uid = f[9] ?? ''
      }
    }
    return keys.filter((k) => k.id)
  },

  /** Claves públicas SSH en ~/.ssh (candidatas a user.signingkey). */
  async listSshKeys(): Promise<string[]> {
    try {
      const dir = join(homedir(), '.ssh')
      return readdirSync(dir)
        .filter((f) => f.endsWith('.pub'))
        .map((f) => join(dir, f).replace(/\\/g, '/'))
    } catch {
      return []
    }
  },

  /** Estado de la firma de un commit (%G? %GS %GK). Para SSH, git necesita
   *  gpg.ssh.allowedSignersFile configurado para poder verificar. */
  async commitSignature(repoPath: string, sha: string): Promise<SignatureInfo> {
    const raw = await git(repoPath).raw([
      'log',
      '-1',
      `--format=%G?${US}%GS${US}%GK`,
      sha
    ])
    const [code, signer, key] = raw.trim().split(US)
    return { code: code || 'N', signer: signer ?? '', key: key ?? '' }
  },

  /** Hooks activos del repo: core.hooksPath si existe, o <git-dir>/hooks.
   *  Ignora los ejemplos *.sample. */
  async hooksInfo(repoPath: string): Promise<HooksInfo> {
    let dir = ''
    try {
      dir = (await git(repoPath).raw(['config', '--get', 'core.hooksPath'])).trim()
    } catch {
      /* sin hooksPath configurado */
    }
    if (dir && !isAbsolute(dir)) dir = join(repoPath, dir)
    if (!dir) {
      const gitDir = await resolveGitDir(repoPath)
      if (!gitDir) return { dir: '', hooks: [] }
      dir = join(gitDir, 'hooks')
    }
    let hooks: string[] = []
    try {
      hooks = readdirSync(dir).filter((f) => !f.endsWith('.sample'))
    } catch {
      /* carpeta inexistente */
    }
    return { dir: dir.replace(/\\/g, '/'), hooks }
  },

  /** Contenido de la plantilla de commit (commit.template), '' si no hay. */
  async commitTemplate(repoPath: string): Promise<string> {
    let file = ''
    try {
      file = (await git(repoPath).raw(['config', '--get', 'commit.template'])).trim()
    } catch {
      return ''
    }
    if (!file) return ''
    if (file.startsWith('~')) file = join(homedir(), file.slice(1))
    if (!isAbsolute(file)) file = join(repoPath, file)
    try {
      return readFileSync(file, 'utf-8')
    } catch {
      return ''
    }
  },

  // ---------- Gitflow (comandos Git estándar, sin extensión git-flow) ----------

  /** Lee la config gitflow.* y propone defaults según las ramas existentes. */
  async gitflowConfig(repoPath: string): Promise<GitflowConfig> {
    const g = git(repoPath)
    const read = async (key: string): Promise<string> => {
      try {
        return (await g.raw(['config', '--get', key])).trim()
      } catch {
        return ''
      }
    }
    const [master, develop, feature, release, hotfix, tag] = await Promise.all([
      read('gitflow.branch.master'),
      read('gitflow.branch.develop'),
      read('gitflow.prefix.feature'),
      read('gitflow.prefix.release'),
      read('gitflow.prefix.hotfix'),
      read('gitflow.prefix.versiontag')
    ])
    let defMaster = 'main'
    try {
      const locals = await g.branchLocal()
      if (!locals.all.includes('main') && locals.all.includes('master')) defMaster = 'master'
    } catch {
      /* repo sin commits */
    }
    return {
      initialized: !!(master && develop),
      master: master || defMaster,
      develop: develop || 'develop',
      featurePrefix: feature || 'feature/',
      releasePrefix: release || 'release/',
      hotfixPrefix: hotfix || 'hotfix/',
      tagPrefix: tag
    }
  },

  /** Inicializa Gitflow: crea develop si falta y persiste la config. */
  async gitflowInit(repoPath: string, cfg: GitflowConfig): Promise<void> {
    const g = git(repoPath)
    const locals = await g.branchLocal()
    if (!locals.all.includes(cfg.master)) {
      throw new Error(`La rama base «${cfg.master}» no existe en el repositorio.`)
    }
    if (!locals.all.includes(cfg.develop)) {
      await g.branch([cfg.develop, cfg.master])
    }
    await g.addConfig('gitflow.branch.master', cfg.master)
    await g.addConfig('gitflow.branch.develop', cfg.develop)
    await g.addConfig('gitflow.prefix.feature', cfg.featurePrefix)
    await g.addConfig('gitflow.prefix.release', cfg.releasePrefix)
    await g.addConfig('gitflow.prefix.hotfix', cfg.hotfixPrefix)
    await g.addConfig('gitflow.prefix.versiontag', cfg.tagPrefix ?? '')
    await g.checkout(cfg.develop)
  },

  /** Crea la rama feature/release/hotfix desde su base y hace checkout. */
  async gitflowStart(repoPath: string, type: GitflowType, name: string): Promise<void> {
    const cfg = await this.gitflowConfig(repoPath)
    if (!cfg.initialized) throw new Error('Gitflow no está inicializado en este repositorio.')
    const prefix =
      type === 'feature' ? cfg.featurePrefix : type === 'release' ? cfg.releasePrefix : cfg.hotfixPrefix
    const base = type === 'hotfix' ? cfg.master : cfg.develop
    await git(repoPath).checkout(['-b', `${prefix}${name}`, base])
  },

  /**
   * Finaliza una rama Gitflow:
   * - feature: merge --no-ff en develop y elimina la rama.
   * - release/hotfix: merge --no-ff en master, tag opcional, merge en develop
   *   y elimina la rama.
   */
  async gitflowFinish(
    repoPath: string,
    type: GitflowType,
    name: string,
    opts: GitflowFinishOptions = {}
  ): Promise<void> {
    const cfg = await this.gitflowConfig(repoPath)
    if (!cfg.initialized) throw new Error('Gitflow no está inicializado en este repositorio.')
    const prefix =
      type === 'feature' ? cfg.featurePrefix : type === 'release' ? cfg.releasePrefix : cfg.hotfixPrefix
    const branch = `${prefix}${name}`
    const g = git(repoPath)

    if (type === 'feature') {
      await g.checkout(cfg.develop)
      await g.merge(['--no-ff', branch])
    } else {
      await g.checkout(cfg.master)
      await g.merge(['--no-ff', branch])
      if (opts.tag !== false) {
        const tagName = opts.tagName || `${cfg.tagPrefix}${name}`
        await g.tag(['-a', tagName, '-m', opts.message || `${type} ${name}`])
      }
      await g.checkout(cfg.develop)
      await g.merge(['--no-ff', branch])
    }
    if (!opts.keepBranch) {
      await g.branch(['-d', branch])
    }
  },

  // ---------- Git Bisect ----------

  /** Estado de la sesión de bisect (lee BISECT_LOG del git-dir real). */
  async bisectState(repoPath: string): Promise<BisectState> {
    const g = git(repoPath)
    const dir = await resolveGitDir(repoPath)
    if (!dir) return { active: false }
    const logFile = join(dir, 'BISECT_LOG')
    if (!existsSync(logFile)) return { active: false }
    let current: string | undefined
    try {
      current = (await g.revparse(['HEAD'])).trim()
    } catch {
      current = undefined
    }
    let log = ''
    try {
      log = readFileSync(logFile, 'utf-8')
    } catch {
      /* sin log */
    }
    return { active: true, current, log }
  },

  /** Inicia bisect con un commit malo y uno bueno. Devuelve el mensaje de git. */
  async bisectStart(repoPath: string, opts: { bad: string; good: string }): Promise<string> {
    return git(repoPath).raw(['bisect', 'start', opts.bad, opts.good])
  },

  /** Marca el commit (HEAD o `ref`) como bueno/malo. Devuelve el mensaje de git,
   *  que incluye «<sha> is the first bad commit» cuando la búsqueda termina. */
  async bisectMark(repoPath: string, verdict: 'good' | 'bad', ref?: string): Promise<string> {
    const args = ['bisect', verdict]
    if (ref) args.push(ref)
    return git(repoPath).raw(args)
  },

  /** Termina la sesión de bisect y vuelve a la rama original. */
  async bisectReset(repoPath: string): Promise<void> {
    await git(repoPath).raw(['bisect', 'reset'])
  },

  // ---------- Operaciones en curso y conflictos ----------

  /** Detecta merge/rebase/cherry-pick/revert en curso leyendo el git-dir. */
  async operationState(repoPath: string): Promise<OperationState> {
    const dir = await resolveGitDir(repoPath)
    if (!dir) return { kind: null }
    if (existsSync(join(dir, 'rebase-merge')) || existsSync(join(dir, 'rebase-apply'))) {
      let step: number | undefined
      let total: number | undefined
      try {
        const rm = join(dir, 'rebase-merge')
        if (existsSync(rm)) {
          const count = (f: string): number =>
            readFileSync(join(rm, f), 'utf-8')
              .split('\n')
              .filter((l) => l.trim() && !l.startsWith('#')).length
          step = count('done')
          total = step + count('git-rebase-todo')
        } else {
          const ra = join(dir, 'rebase-apply')
          step = parseInt(readFileSync(join(ra, 'next'), 'utf-8').trim(), 10)
          total = parseInt(readFileSync(join(ra, 'last'), 'utf-8').trim(), 10)
        }
      } catch {
        /* progreso no disponible */
      }
      return { kind: 'rebase', step, total }
    }
    if (existsSync(join(dir, 'MERGE_HEAD'))) return { kind: 'merge' }
    if (existsSync(join(dir, 'CHERRY_PICK_HEAD'))) return { kind: 'cherry-pick' }
    if (existsSync(join(dir, 'REVERT_HEAD'))) return { kind: 'revert' }
    return { kind: null }
  },

  /** Versiones base/ours/theirs (índice :1/:2/:3) + working tree con marcadores. */
  async conflictVersions(repoPath: string, file: string): Promise<ConflictVersions> {
    const g = git(repoPath)
    const show = async (stage: 1 | 2 | 3): Promise<string | null> => {
      try {
        return await g.show([`:${stage}:${file}`])
      } catch {
        return null // el lado no existe (conflicto de add/delete)
      }
    }
    const [base, ours, theirs] = await Promise.all([show(1), show(2), show(3)])
    let working = ''
    try {
      working = readFileSync(join(repoPath, file), 'utf-8')
    } catch {
      /* borrado en el working tree */
    }
    return { base, ours, theirs, working }
  },

  /** Resuelve un archivo conservando un lado completo (checkout --ours/--theirs + add).
   *  Si ese lado no existe (conflicto add/delete), la resolución es eliminarlo. */
  async keepSide(repoPath: string, file: string, side: 'ours' | 'theirs'): Promise<void> {
    const g = git(repoPath)
    try {
      await g.checkout([side === 'ours' ? '--ours' : '--theirs', '--', file])
      await g.add([file])
    } catch {
      await g.raw(['rm', '-f', '--', file])
    }
  },

  /** Marca archivos como resueltos (git add). */
  async markResolved(repoPath: string, files: string[]): Promise<void> {
    await git(repoPath).add(files)
  },

  /** Resuelve un conflicto add/delete eliminando el archivo. */
  async resolveDelete(repoPath: string, file: string): Promise<void> {
    await git(repoPath).raw(['rm', '-f', '--', file])
  },

  /** Continúa la operación en curso (sin abrir editor de mensaje). */
  async continueOperation(repoPath: string): Promise<void> {
    const st = await this.operationState(repoPath)
    // GIT_EDITOR=true evita que git abra un editor para el mensaje (git lo
    // ejecuta vía su sh interno, así que también funciona en Windows).
    const env = { ...process.env, GIT_EDITOR: 'true' }
    switch (st.kind) {
      case 'merge':
        await execGit(repoPath, ['commit', '--no-edit'], { env })
        return
      case 'rebase':
        await execGit(repoPath, ['rebase', '--continue'], { env })
        return
      case 'cherry-pick':
        await execGit(repoPath, ['cherry-pick', '--continue'], { env })
        return
      case 'revert':
        await execGit(repoPath, ['revert', '--continue'], { env })
        return
      default:
        throw new Error('No hay ninguna operación en curso.')
    }
  },

  /** Aborta la operación en curso y vuelve al estado anterior. */
  async abortOperation(repoPath: string): Promise<void> {
    const st = await this.operationState(repoPath)
    switch (st.kind) {
      case 'merge':
        await execGit(repoPath, ['merge', '--abort'])
        return
      case 'rebase':
        await execGit(repoPath, ['rebase', '--abort'])
        return
      case 'cherry-pick':
        await execGit(repoPath, ['cherry-pick', '--abort'])
        return
      case 'revert':
        await execGit(repoPath, ['revert', '--abort'])
        return
      default:
        throw new Error('No hay ninguna operación en curso.')
    }
  },

  // ---------- Rebase interactivo ----------

  /** Commits de `base..head`, del más antiguo al más nuevo (todo list del rebase). */
  async commitsSince(repoPath: string, base: string, head = 'HEAD'): Promise<Commit[]> {
    const raw = await git(repoPath).raw([
      'log',
      '--reverse',
      `--pretty=format:${LOG_FORMAT}${RS}`,
      `${base}..${head}`
    ])
    return parseLog(raw)
  },

  /** Rebase interactivo sin editor: GIT_SEQUENCE_EDITOR escribe el plan en el
   *  todo-list y GIT_EDITOR responde los mensajes (reword/squash) desde una
   *  cola JSON. Devuelve completed=false si quedó detenido por conflictos. */
  async interactiveRebase(
    repoPath: string,
    base: string,
    plan: RebasePlanItem[],
    opts: { autostash?: boolean; head?: string } = {}
  ): Promise<RebaseResult> {
    const effective = plan.filter((p) => p.action !== 'drop')
    if (effective.length === 0) {
      throw new Error('El plan eliminaría todos los commits; usa reset en su lugar.')
    }
    if (effective[0].action === 'squash' || effective[0].action === 'fixup') {
      throw new Error('El primer commit no puede ser squash/fixup: no tiene padre donde combinarse.')
    }

    // Todo-list en el formato de git (drop explícito para mayor seguridad).
    const todo = plan.map((p) => `${p.action} ${p.hash}`).join('\n') + '\n'

    // Cola de mensajes en el orden en que git abrirá el "editor":
    // un prompt por reword y uno al final de cada cadena squash/fixup con squash.
    const queue: (string | null)[] = []
    for (let i = 0; i < effective.length; i++) {
      const it = effective[i]
      if (it.action === 'reword') {
        queue.push(it.message ?? null)
      } else if (it.action === 'squash' || it.action === 'fixup') {
        let hasSquash = false
        let msg: string | null = null
        while (i < effective.length && (effective[i].action === 'squash' || effective[i].action === 'fixup')) {
          if (effective[i].action === 'squash') {
            hasSquash = true
            if (effective[i].message) msg = effective[i].message!
          }
          i++
        }
        i--
        if (hasSquash) queue.push(msg)
      }
    }

    const tmp = mkdtempSync(join(tmpdir(), 'marea-rebase-'))
    try {
      const todoFile = join(tmp, 'todo.txt')
      const stateFile = join(tmp, 'state.json')
      const seqHelper = join(tmp, 'seq-editor.js')
      const msgHelper = join(tmp, 'msg-editor.js')
      writeFileSync(todoFile, todo, 'utf-8')
      writeFileSync(stateFile, JSON.stringify({ queue, index: 0 }), 'utf-8')
      // Sobrescribe el todo-list de git con nuestro plan.
      writeFileSync(
        seqHelper,
        "const fs=require('fs');fs.copyFileSync(process.argv[2],process.argv[3]);\n",
        'utf-8'
      )
      // Responde cada prompt de mensaje desde la cola (null = conservar el propuesto).
      writeFileSync(
        msgHelper,
        [
          "const fs=require('fs');",
          'const st=JSON.parse(fs.readFileSync(process.argv[2],"utf-8"));',
          'const msg=st.queue[st.index]??null;st.index++;',
          'fs.writeFileSync(process.argv[2],JSON.stringify(st));',
          'if(msg!=null)fs.writeFileSync(process.argv[3],msg.endsWith("\\n")?msg:msg+"\\n");'
        ].join('\n'),
        'utf-8'
      )

      // Los helpers corren con el propio ejecutable (Electron como Node).
      // git invoca los editores vía sh, así que se usan rutas con «/».
      const slash = (p: string): string => p.replace(/\\/g, '/')
      const node = slash(process.execPath)
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        GIT_SEQUENCE_EDITOR: `"${node}" "${slash(seqHelper)}" "${slash(todoFile)}"`,
        GIT_EDITOR: `"${node}" "${slash(msgHelper)}" "${slash(stateFile)}"`
      }

      const args = ['rebase', '-i']
      if (opts.autostash) args.push('--autostash')
      args.push(base)
      if (opts.head && opts.head !== 'HEAD') args.push(opts.head)

      try {
        const out = await execGit(repoPath, args, { env })
        return { completed: true, message: out.trim() }
      } catch (err) {
        // Si el rebase quedó en curso, es una parada esperada (conflictos):
        // el banner de operación permite continuar/abortar.
        const st = await this.operationState(repoPath)
        if (st.kind === 'rebase') {
          return { completed: false, message: err instanceof Error ? err.message : String(err) }
        }
        throw err
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
}

export type GitService = typeof gitService

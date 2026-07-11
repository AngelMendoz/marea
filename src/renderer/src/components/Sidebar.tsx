import {
  ChevronDown,
  CircleDot,
  GitBranch,
  Cloud,
  Lock,
  Tag as TagIcon,
  Archive,
  Server,
  Boxes,
  TreeDeciduous,
  Folder,
  FolderOpen,
  GitPullRequest,
  Plus
} from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import type { Branch, Remote, Submodule, Worktree } from '@shared/types'
import { branchWebUrl } from '@shared/remoteUrls'
import { bridge } from '../bridge'
import { useCenterView } from '../centerView'
import { useContextMenu } from '../contextMenu'
import { useDialog } from '../dialog'
import { useDrag, type DragItem } from '../drag'
import { suggestBranchName, useIssueLinks } from '../issueLinks'
import { filterIssues, useIssueList, type IssueFilter } from '../issueList'
import { branchOntoBranchMenu, commitOntoBranchMenu } from '../lib/dropMenus'
import { filterPRs, usePRList, type PRFilter } from '../prList'
import { usePRPanel } from '../prPanel'
import { useStore } from '../store'
import { useCreateIssuePanel } from './CreateIssue'
import { useRebasePanel } from './InteractiveRebase'

const PR_FILTERS: { id: PRFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'mine', label: 'Míos' },
  { id: 'assigned', label: 'Asignados a mí' }
]

const ISSUE_FILTERS: { id: IssueFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'mine', label: 'Míos' },
  { id: 'assigned', label: 'Asignados a mí' }
]

function IssuesSection(): JSX.Element {
  const { repo, run } = useStore()
  const openIssue = useCenterView((s) => s.openIssue)
  const openPanel = useCreateIssuePanel((s) => s.openPanel)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openPrompt } = useDialog()
  const { issues, path, loading, error, filter, label, user, setFilter, setLabel, load } =
    useIssueList()
  const links = useIssueLinks((s) => (repo ? s.links[repo.path] : undefined))
  const linkIssue = useIssueLinks((s) => s.link)
  const [open, setOpen] = useState(false)

  const stale = issues === null || path !== repo?.path
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next && stale && repo) load(repo.path)
  }
  useEffect(() => {
    if (open && stale && repo) load(repo.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo?.path])

  const visible = issues ? filterIssues(issues, filter, label, user) : null
  const allLabels = useMemo(() => {
    const names = new Set<string>()
    for (const i of issues ?? []) for (const l of i.labels) names.add(l.name)
    return [...names].sort()
  }, [issues])

  /** «Crear rama para este issue» desde el menú contextual de la lista. */
  const createBranchFor = (issueNumber: number, title: string): void => {
    if (!repo) return
    openPrompt({
      title: `Crear rama para el issue #${issueNumber}`,
      label: 'Nombre de la rama',
      defaultValue: suggestBranchName(issueNumber, title),
      confirmText: 'Crear y checkout',
      onConfirm: (name) => {
        const branch = name.trim()
        if (!branch) return
        run(`Rama «${branch}» creada`, async () => {
          await bridge.createBranch(repo.path, branch, { checkout: true })
          linkIssue(repo.path, issueNumber, branch)
        })
      }
    })
  }

  return (
    <div className="side-section">
      <div className={`side-head${open ? '' : ' collapsed'}`} onClick={toggle}>
        <ChevronDown className="chev" size={13} />
        <CircleDot size={13} />
        <span>Issues</span>
        <span className="count">{visible?.length ?? 0}</span>
      </div>
      {open && (
        <div>
          <div className="side-item" style={{ color: 'var(--accent)' }} onClick={openPanel}>
            <Plus size={14} color="var(--accent)" /> <span>Crear Issue</span>
          </div>
          <div className="side-filters">
            {ISSUE_FILTERS.map((f) => (
              <button
                key={f.id}
                className={`side-filter${filter === f.id ? ' on' : ''}`}
                title={f.id !== 'all' && !user ? 'Requiere sesión de GitHub' : undefined}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
            {allLabels.length > 0 && (
              <select
                className="side-filter-select"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                title="Filtrar por label"
              >
                <option value="">label: todas</option>
                {allLabels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </div>
          {loading && <div className="side-item" style={{ color: 'var(--text-muted)' }}>Cargando…</div>}
          {error && (
            <div className="side-item" style={{ color: 'var(--danger)' }} title={error}>
              Inicia sesión en GitHub
            </div>
          )}
          {visible?.map((issue) => {
            const linked = links?.[issue.number]
            return (
              <div
                key={issue.number}
                className="side-item"
                title={`#${issue.number} ${issue.title} (${issue.author})${linked ? `\nRama: ${linked}` : ''}`}
                onClick={() => openIssue(issue.number)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  openMenu(e.clientX, e.clientY, [
                    { label: 'Abrir detalle', onClick: () => openIssue(issue.number) },
                    {
                      label: linked
                        ? `Checkout de «${linked}»`
                        : 'Crear rama para este issue…',
                      onClick: () =>
                        linked && repo
                          ? run('Checkout', () => bridge.checkout(repo.path, linked))
                          : createBranchFor(issue.number, issue.title)
                    },
                    { label: 'Abrir en el navegador', onClick: () => bridge.openExternal(issue.url) },
                    { divider: true },
                    { label: 'Recargar lista', onClick: () => repo && load(repo.path) }
                  ])
                }}
              >
                <CircleDot
                  size={14}
                  color={issue.labels[0]?.color ?? 'var(--accent-green)'}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  #{issue.number} {issue.title}
                </span>
                {linked && <GitBranch size={12} color="var(--accent-green)" style={{ flexShrink: 0 }} />}
              </div>
            )
          })}
          {visible && visible.length === 0 && !loading && !error && (
            <div className="side-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              (sin issues abiertos)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PullRequestsSection(): JSX.Element {
  const { repo } = useStore()
  const openPanel = usePRPanel((s) => s.openPanel)
  const openPR = useCenterView((s) => s.openPR)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { prs, path, loading, error, filter, user, setFilter, load } = usePRList()
  const [open, setOpen] = useState(false)

  // Lista desactualizada si nunca se cargó o si pertenece a otro repo (pestaña).
  const stale = prs === null || path !== repo?.path
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next && stale && repo) load(repo.path)
  }
  useEffect(() => {
    if (open && stale && repo) load(repo.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo?.path])

  const visible = prs ? filterPRs(prs, filter, user) : null

  return (
    <div className="side-section">
      <div className={`side-head${open ? '' : ' collapsed'}`} onClick={toggle}>
        <ChevronDown className="chev" size={13} />
        <GitPullRequest size={13} />
        <span>Pull Requests</span>
        <span className="count">{visible?.length ?? 0}</span>
      </div>
      {open && (
        <div>
          <div
            className="side-item"
            style={{ color: 'var(--accent)' }}
            onClick={() => openPanel({ head: repo?.currentBranch })}
          >
            <Plus size={14} color="var(--accent)" /> <span>Crear Pull Request</span>
          </div>
          <div className="side-filters">
            {PR_FILTERS.map((f) => (
              <button
                key={f.id}
                className={`side-filter${filter === f.id ? ' on' : ''}`}
                title={f.id !== 'all' && !user ? 'Requiere sesión de GitHub' : undefined}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {loading && <div className="side-item" style={{ color: 'var(--text-muted)' }}>Cargando…</div>}
          {error && (
            <div className="side-item" style={{ color: 'var(--danger)' }} title={error}>
              Inicia sesión en GitHub
            </div>
          )}
          {visible?.map((pr) => (
            <div
              key={pr.number}
              className="side-item"
              title={`#${pr.number} ${pr.title} (${pr.author})`}
              onClick={() => openPR(pr.number)}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(e.clientX, e.clientY, [
                  { label: 'Revisar PR', onClick: () => openPR(pr.number) },
                  { label: 'Abrir en GitHub', onClick: () => bridge.openExternal(pr.url) },
                  { divider: true },
                  { label: 'Recargar lista', onClick: () => repo && load(repo.path) }
                ])
              }}
            >
              <GitPullRequest size={14} color={pr.draft ? 'var(--text-muted)' : 'var(--accent-green)'} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                #{pr.number} {pr.title}
              </span>
            </div>
          ))}
          {visible && visible.length === 0 && !loading && !error && (
            <div className="side-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              (sin PRs abiertos)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Crea un worktree para `branch`: pide la carpeta contenedora y usa
 *  `<carpeta>/<repo>-<rama>` como destino (git exige que no exista). */
async function createWorktreeFor(
  repoPath: string,
  repoName: string,
  branch: string,
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>
): Promise<void> {
  const folder = await bridge.pickFolder(`Carpeta donde crear el worktree de «${branch}»`)
  if (!folder) return
  const dir = `${folder.replace(/\\/g, '/')}/${repoName}-${branch.replace(/[\\/]/g, '-')}`
  await run(`Worktree en ${dir}`, () => bridge.worktreeAdd(repoPath, { dir, branch }))
}

const normPath = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

function WorktreesSection(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const worktrees = useStore((s) => s.worktrees)
  const run = useStore((s) => s.run)
  const notify = useStore((s) => s.notify)
  const openRepo = useStore((s) => s.openRepo)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openConfirm } = useDialog()
  const [open, setOpen] = useState(false)
  const canDrop = useDrag((s) => s.item?.kind === 'branch' && !s.item.isRemote)
  const isOver = useDrag((s) => s.overKey === 'worktrees')
  const setOver = useDrag((s) => s.setOver)
  const dragEnd = useDrag((s) => s.end)

  /** Eliminar worktree; si git pide --force (cambios sin commitear),
   *  confirma con el usuario y reintenta forzado. */
  const doRemove = async (wt: Worktree, delBranch: boolean, force = false): Promise<void> => {
    if (!repo) return
    try {
      await bridge.worktreeRemove(repo.path, wt.path, force)
      if (delBranch && wt.branch) await bridge.deleteBranch(repo.path, wt.branch, true)
      notify('success', delBranch ? 'Worktree y rama eliminados ✓' : 'Worktree eliminado ✓')
      await useStore.getState().refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!force && /--force|contains modified|untracked/i.test(msg)) {
        openConfirm({
          title: 'Worktree con cambios',
          message: `«${wt.path}» tiene cambios sin commitear o archivos sin rastrear. ¿Eliminarlo de todas formas?`,
          danger: true,
          confirmText: 'Forzar eliminación',
          onConfirm: () => void doRemove(wt, delBranch, true)
        })
      } else {
        notify('error', `Eliminar worktree: ${msg}`)
      }
    }
  }

  const rowMenu = (e: React.MouseEvent, wt: Worktree): void => {
    e.preventDefault()
    if (!repo) return
    const isCurrent = normPath(repo.path) === normPath(wt.path)
    openMenu(e.clientX, e.clientY, [
      {
        label: 'Abrir este worktree',
        disabled: isCurrent,
        onClick: () => void openRepo(wt.path)
      },
      {
        label: 'Abrir worktree en una pestaña nueva',
        disabled: isCurrent,
        onClick: () => void openRepo(wt.path)
      },
      { divider: true },
      {
        label: wt.locked ? 'Desbloquear este worktree' : 'Bloquear este worktree',
        disabled: wt.main,
        onClick: () =>
          run(
            wt.locked ? 'Worktree desbloqueado' : 'Worktree bloqueado',
            () =>
              wt.locked
                ? bridge.worktreeUnlock(repo.path, wt.path)
                : bridge.worktreeLock(repo.path, wt.path)
          )
      },
      { divider: true },
      {
        label: 'Eliminar este worktree',
        danger: true,
        disabled: wt.main,
        onClick: () =>
          openConfirm({
            title: 'Eliminar worktree',
            message: `¿Eliminar el worktree «${wt.path}»?`,
            danger: true,
            confirmText: 'Eliminar',
            onConfirm: () => void doRemove(wt, false)
          })
      },
      {
        label: 'Eliminar worktree y borrar la rama',
        danger: true,
        disabled: wt.main || !wt.branch,
        onClick: () =>
          openConfirm({
            title: 'Eliminar worktree y rama',
            message: `¿Eliminar el worktree «${wt.path}» y borrar la rama «${wt.branch}»?`,
            danger: true,
            confirmText: 'Eliminar ambos',
            onConfirm: () => void doRemove(wt, true)
          })
      },
      { divider: true },
      {
        label: 'Podar worktrees (prune)',
        onClick: () => run('Worktrees podados', () => bridge.worktreePrune(repo.path))
      }
    ])
  }

  return (
    <div
      className={`side-section${isOver && canDrop ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        if (canDrop) {
          e.preventDefault()
          setOver('worktrees')
        }
      }}
      onDragLeave={() => useDrag.getState().overKey === 'worktrees' && setOver(null)}
      onDrop={(e) => {
        e.preventDefault()
        const item = useDrag.getState().item
        dragEnd()
        if (!item || !repo || item.kind !== 'branch' || item.isRemote) return
        openMenu(e.clientX, e.clientY, [
          {
            label: `Crear worktree desde «${item.label}»…`,
            onClick: () => void createWorktreeFor(repo.path, repo.name, item.ref, run)
          }
        ])
      }}
    >
      <div className={`side-head${open ? '' : ' collapsed'}`} onClick={() => setOpen(!open)}>
        <ChevronDown className="chev" size={13} />
        <TreeDeciduous size={13} />
        <span>Worktrees</span>
        <span className="count">{worktrees.length}</span>
      </div>
      {open && (
        <div>
          {worktrees.map((wt) => {
            const isCurrent = repo && normPath(repo.path) === normPath(wt.path)
            const name = wt.branch ?? `${wt.head.slice(0, 7)} (detached)`
            return (
              <div
                key={wt.path}
                className={`side-item${isCurrent ? ' current' : ''}`}
                title={`${wt.path}${wt.lockReason ? `\nBloqueado: ${wt.lockReason}` : ''}`}
                onDoubleClick={() => !isCurrent && void openRepo(wt.path)}
                onContextMenu={(e) => rowMenu(e, wt)}
              >
                <TreeDeciduous
                  size={14}
                  color={isCurrent ? 'var(--accent-green)' : undefined}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                  {wt.main && <span style={{ color: 'var(--text-muted)' }}> (principal)</span>}
                  {wt.prunable && <span style={{ color: 'var(--warn)' }}> (podable)</span>}
                </span>
                {wt.locked && <Lock size={12} color="var(--warn)" style={{ flexShrink: 0 }} />}
              </div>
            )
          })}
          {worktrees.length === 0 && (
            <div className="side-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              (ninguno)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SUBMODULE_STATUS: Record<Submodule['status'], { label: string; color?: string }> = {
  ok: { label: '' },
  uninitialized: { label: 'sin inicializar', color: 'var(--text-muted)' },
  modified: { label: 'commit distinto', color: 'var(--warn)' },
  conflict: { label: 'conflictos', color: 'var(--danger)' }
}

function SubmodulesSection(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const submodules = useStore((s) => s.submodules)
  const run = useStore((s) => s.run)
  const openRepo = useStore((s) => s.openRepo)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openPrompt } = useDialog()
  const [open, setOpen] = useState(false)

  const uninitCount = submodules.filter((s) => s.status === 'uninitialized').length

  /** Añadir submódulo en dos pasos: URL y luego ruta destino (con sugerencia).
   *  El segundo prompt se reabre tras el close() del primero. */
  const addSubmodule = (): void => {
    if (!repo) return
    openPrompt({
      title: 'Añadir submódulo',
      label: 'URL del repositorio (HTTPS o SSH)',
      placeholder: 'https://github.com/usuario/repo.git',
      confirmText: 'Continuar',
      onConfirm: (url) => {
        const cleanUrl = url.trim()
        const suggested = cleanUrl.replace(/\.git$/, '').split(/[\\/]/).pop() ?? 'submodulo'
        setTimeout(() =>
          openPrompt({
            title: 'Añadir submódulo',
            label: 'Ruta dentro del repositorio',
            defaultValue: suggested,
            confirmText: 'Añadir',
            onConfirm: (dir) => {
              const target = dir.trim() || suggested
              void run(`Submódulo «${target}» añadido`, () =>
                bridge.submoduleAdd(repo.path, cleanUrl, target)
              )
            }
          })
        )
      }
    })
  }

  const rowMenu = (e: React.MouseEvent, sm: Submodule): void => {
    e.preventDefault()
    if (!repo) return
    const absPath = `${repo.path.replace(/\\/g, '/')}/${sm.path}`
    openMenu(e.clientX, e.clientY, [
      {
        label: 'Abrir submódulo en una pestaña',
        disabled: sm.status === 'uninitialized',
        onClick: () => void openRepo(absPath)
      },
      { divider: true },
      ...(sm.status === 'uninitialized'
        ? [
            {
              label: 'Inicializar (clonar contenido)',
              onClick: () =>
                run(`Submódulo «${sm.path}» inicializado`, () =>
                  bridge.submoduleUpdate(repo.path, sm.path, { init: true })
                )
            }
          ]
        : []),
      {
        label: 'Actualizar al commit referenciado',
        onClick: () =>
          run(`Submódulo «${sm.path}» actualizado`, () =>
            bridge.submoduleUpdate(repo.path, sm.path, { init: true })
          )
      },
      {
        label: 'Actualizar al último del remoto',
        onClick: () =>
          run(`Submódulo «${sm.path}» al último del remoto`, () =>
            bridge.submoduleUpdate(repo.path, sm.path, { init: true, remote: true })
          )
      },
      { divider: true },
      {
        label: 'Sincronizar URL (.gitmodules → config)',
        onClick: () => run('URL sincronizada', () => bridge.submoduleSync(repo.path, sm.path))
      },
      {
        label: 'Cambiar URL…',
        onClick: () =>
          openPrompt({
            title: `URL del submódulo «${sm.path}»`,
            defaultValue: sm.url,
            confirmText: 'Guardar',
            onConfirm: (u) =>
              run('URL del submódulo actualizada', () =>
                bridge.submoduleSetUrl(repo.path, sm.path, u.trim())
              )
          })
      }
    ])
  }

  return (
    <div className="side-section">
      <div className={`side-head${open ? '' : ' collapsed'}`} onClick={() => setOpen(!open)}>
        <ChevronDown className="chev" size={13} />
        <Boxes size={13} />
        <span>Submódulos</span>
        <span className="count">{submodules.length}</span>
      </div>
      {open && (
        <div>
          <div className="side-item" style={{ color: 'var(--accent)' }} onClick={addSubmodule}>
            <Plus size={14} color="var(--accent)" /> <span>Añadir submódulo</span>
          </div>
          {uninitCount > 0 && repo && (
            <div
              className="side-item"
              style={{ color: 'var(--accent)' }}
              onClick={() =>
                run('Submódulos clonados', () =>
                  bridge.submoduleUpdate(repo.path, undefined, { init: true, recursive: true })
                )
              }
            >
              <Boxes size={14} color="var(--accent)" />
              <span>Clonar submódulos ({uninitCount})</span>
            </div>
          )}
          {submodules.map((sm) => {
            const st = SUBMODULE_STATUS[sm.status]
            return (
              <div
                key={sm.path}
                className="side-item"
                title={`${sm.path}\n${sm.url}${sm.sha ? `\n@ ${sm.sha.slice(0, 7)}` : ''}${st.label ? `\n(${st.label})` : ''}`}
                onDoubleClick={() => sm.status !== 'uninitialized' && repo && void openRepo(`${repo.path.replace(/\\/g, '/')}/${sm.path}`)}
                onContextMenu={(e) => rowMenu(e, sm)}
              >
                <Boxes size={14} color={st.color} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: st.color }}>
                  {sm.path}
                  {st.label && <span style={{ color: 'var(--text-muted)' }}> ({st.label})</span>}
                </span>
                {sm.sha && (
                  <span className="track" style={{ flexShrink: 0 }}>{sm.sha.slice(0, 7)}</span>
                )}
              </div>
            )
          })}
          {submodules.length === 0 && (
            <div className="side-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              (ninguno)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Gestión de remotos: añadir, renombrar, editar URLs, remoto por
 *  defecto, fetch de un remoto concreto y eliminar. */
function RemotesSection(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const refs = useStore((s) => s.refs)
  const run = useStore((s) => s.run)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openPrompt, openConfirm } = useDialog()
  const [open, setOpen] = useState(false)

  const remotes = refs?.remotes ?? []
  const defaultRemote = refs?.defaultRemote ?? ''

  const addRemote = (): void => {
    if (!repo) return
    openPrompt({
      title: 'Añadir remoto',
      label: 'Nombre del remoto',
      placeholder: remotes.length === 0 ? 'origin' : 'upstream',
      confirmText: 'Continuar',
      onConfirm: (name) => {
        const clean = name.trim()
        if (!clean) return
        setTimeout(() =>
          openPrompt({
            title: `URL del remoto «${clean}»`,
            label: 'URL (HTTPS o SSH)',
            placeholder: 'https://github.com/usuario/repo.git',
            confirmText: 'Añadir',
            onConfirm: (url) =>
              void run(`Remoto «${clean}» añadido`, () => bridge.addRemote(repo.path, clean, url.trim()))
          })
        )
      }
    })
  }

  const rowMenu = (e: React.MouseEvent, r: Remote): void => {
    e.preventDefault()
    if (!repo) return
    openMenu(e.clientX, e.clientY, [
      {
        label: `Fetch de ${r.name} (con prune)`,
        onClick: () => run(`Fetch de ${r.name}`, () => bridge.fetchRemote(repo.path, r.name, { prune: true }))
      },
      { divider: true },
      {
        label: 'Cambiar remoto por defecto',
        disabled: r.name === defaultRemote,
        onClick: () => run(`«${r.name}» es ahora el remoto por defecto`, () => bridge.setDefaultRemote(repo.path, r.name))
      },
      {
        label: 'Renombrar…',
        onClick: () =>
          openPrompt({
            title: `Renombrar remoto «${r.name}»`,
            label: 'Nombre nuevo',
            defaultValue: r.name,
            confirmText: 'Renombrar',
            onConfirm: (name) =>
              run('Remoto renombrado', () => bridge.renameRemote(repo.path, r.name, name.trim()))
          })
      },
      {
        label: 'Editar URL…',
        onClick: () =>
          openPrompt({
            title: `URL de «${r.name}»`,
            label: 'URL (fetch y push)',
            defaultValue: r.fetchUrl,
            confirmText: 'Guardar',
            onConfirm: (url) =>
              run('URL del remoto actualizada', () => bridge.setRemoteUrl(repo.path, r.name, url.trim()))
          })
      },
      {
        label: 'Editar URL de push…',
        onClick: () =>
          openPrompt({
            title: `URL de push de «${r.name}»`,
            label: 'URL solo para push',
            defaultValue: r.pushUrl,
            confirmText: 'Guardar',
            onConfirm: (url) =>
              run('URL de push actualizada', () =>
                bridge.setRemoteUrl(repo.path, r.name, url.trim(), { push: true })
              )
          })
      },
      { divider: true },
      {
        label: 'Eliminar remoto',
        danger: true,
        onClick: () =>
          openConfirm({
            title: 'Eliminar remoto',
            message: `¿Eliminar el remoto «${r.name}»? Sus ramas remotas desaparecerán del grafo (el remoto real no se toca).`,
            danger: true,
            confirmText: 'Eliminar',
            onConfirm: () => run('Remoto eliminado', () => bridge.removeRemote(repo.path, r.name))
          })
      }
    ])
  }

  return (
    <div className="side-section">
      <div className={`side-head${open ? '' : ' collapsed'}`} onClick={() => setOpen(!open)}>
        <ChevronDown className="chev" size={13} />
        <Server size={13} />
        <span>Remotes</span>
        <span className="count">{remotes.length}</span>
      </div>
      {open && (
        <div>
          <div className="side-item" style={{ color: 'var(--accent)' }} onClick={addRemote}>
            <Plus size={14} color="var(--accent)" /> <span>Añadir remoto</span>
          </div>
          {remotes.map((r) => (
            <div
              key={r.name}
              className="side-item"
              title={`fetch: ${r.fetchUrl}\npush: ${r.pushUrl}`}
              onContextMenu={(e) => rowMenu(e, r)}
            >
              <Server size={14} color={r.name === defaultRemote ? 'var(--accent)' : undefined} />
              <span>
                {r.name}
                {r.name === defaultRemote && <span style={{ color: 'var(--text-muted)' }}> (por defecto)</span>}
              </span>
            </div>
          ))}
          {remotes.length === 0 && (
            <div className="side-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              (sin remotos)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  icon,
  count,
  children,
  defaultOpen = true
}: {
  title: string
  icon: JSX.Element
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="side-section">
      <div className={`side-head${open ? '' : ' collapsed'}`} onClick={() => setOpen(!open)}>
        <ChevronDown className="chev" size={13} />
        {icon}
        <span>{title}</span>
        {count != null && <span className="count">{count}</span>}
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}

// -------- Árbol de ramas (agrupa por "/") --------
interface TreeNode {
  name: string
  branches: Branch[]
  folders: TreeNode[]
}

function buildTree(branches: Branch[]): TreeNode {
  const root: TreeNode = { name: '', branches: [], folders: [] }
  for (const b of branches) {
    const parts = b.name.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      let child = node.folders.find((f) => f.name === parts[i])
      if (!child) {
        child = { name: parts[i], branches: [], folders: [] }
        node.folders.push(child)
      }
      node = child
    }
    node.branches.push(b)
  }
  return root
}

const BranchRow = memo(function BranchRow({ b, depth }: { b: Branch; depth: number }): JSX.Element {
  // Suscripciones mínimas: con cientos de ramas, cada fila debe re-renderizarse
  // solo cuando cambia su propio estado (drag sobre ella), no en cada toast.
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openPrompt, openConfirm } = useDialog()
  const key = (b.isRemote ? 'r:' : 'l:') + b.name
  const canDrop = useDrag((s) => !!s.item && s.item.ref !== b.name)
  const isOver = useDrag((s) => s.overKey === key)
  const dragStart = useDrag((s) => s.start)
  const dragEnd = useDrag((s) => s.end)
  const setOver = useDrag((s) => s.setOver)
  const displayName = b.name.split('/').pop() || b.name

  const contextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (!repo) return
    const current = useStore.getState().branches?.current ?? ''
    // Remoto/rama para «Abrir en el proveedor»: la propia rama si es remota,
    // o el upstream si es local.
    const refSpec = b.isRemote ? b.name : (b.upstream ?? '')
    const remoteName = refSpec.split('/')[0] ?? ''
    const remoteBranch = refSpec.split('/').slice(1).join('/')
    const remoteUrl = refSpec
      ? (useStore.getState().refs?.remotes.find((r) => r.name === remoteName)?.fetchUrl ?? '')
      : ''
    const providerUrl = remoteUrl && remoteBranch ? branchWebUrl(remoteUrl, remoteBranch) : null
    openMenu(e.clientX, e.clientY, [
      {
        label: b.isRemote ? `Checkout «${remoteBranch}» (crea rama local)` : `Checkout «${displayName}»`,
        disabled: b.current,
        onClick: () =>
          run('Checkout', () => bridge.checkout(repo.path, b.isRemote ? remoteBranch : b.name))
      },
      { divider: true },
      {
        label: `Merge «${b.name}» en ${current}`,
        disabled: b.current,
        onClick: () => run('Merge', () => bridge.merge(repo.path, b.name))
      },
      {
        label: `Rebase ${current} sobre «${b.name}»`,
        disabled: b.current,
        onClick: () => run('Rebase', () => bridge.rebase(repo.path, b.name))
      },
      {
        label: `Rebase interactivo de ${current} sobre «${b.name}»…`,
        disabled: b.current,
        onClick: () =>
          useRebasePanel.getState().openPanel({
            base: b.name,
            baseLabel: b.name,
            head: current,
            headLabel: current
          })
      },
      { divider: true },
      {
        label: `Comparar «${displayName}» con ${current}`,
        disabled: b.current,
        onClick: () =>
          useCenterView.getState().openCompare({ a: b.name, b: current, aLabel: b.name, bLabel: current })
      },
      {
        label: `Comparar «${displayName}» con el working tree`,
        onClick: () =>
          useCenterView.getState().openCompare({ a: b.name, b: '', aLabel: b.name, bLabel: 'Working tree' })
      },
      { divider: true },
      {
        label: 'Crear worktree…',
        disabled: b.isRemote,
        onClick: () => void createWorktreeFor(repo.path, repo.name, b.name, run)
      },
      { divider: true },
      {
        label: 'Copiar nombre',
        onClick: () => void navigator.clipboard.writeText(b.name)
      },
      ...(b.isRemote
        ? // ---- Acciones de rama remota ----
          [
            {
              label: 'Actualizar esta rama (fetch)',
              onClick: () =>
                run(`Fetch de ${b.name}`, () => bridge.fetchRemoteBranch(repo.path, remoteName, remoteBranch))
            },
            {
              label: 'Abrir en el proveedor',
              disabled: !providerUrl,
              onClick: () => providerUrl && bridge.openExternal(providerUrl)
            },
            { divider: true } as const,
            {
              label: `Eliminar «${remoteBranch}» del remoto ${remoteName}`,
              danger: true,
              onClick: () =>
                openConfirm({
                  title: 'Eliminar rama remota',
                  message: `Se eliminará «${remoteBranch}» en el remoto ${remoteName} (afecta a todo el equipo). ¿Continuar?`,
                  danger: true,
                  confirmText: 'Eliminar del remoto',
                  onConfirm: () =>
                    run('Rama remota eliminada', () =>
                      bridge.deleteRemoteBranch(repo.path, remoteName, remoteBranch)
                    )
                })
            }
          ]
        : // ---- Acciones de rama local ----
          [
            {
              label: providerUrl ? 'Abrir en el proveedor' : 'Abrir en el proveedor (sin upstream)',
              disabled: !providerUrl,
              onClick: () => providerUrl && bridge.openExternal(providerUrl)
            },
            {
              label: 'Configurar upstream…',
              onClick: () =>
                openPrompt({
                  title: `Upstream de «${b.name}»`,
                  label: 'Rama remota (vacío = quitar upstream)',
                  defaultValue:
                    b.upstream ?? `${useStore.getState().refs?.defaultRemote || 'origin'}/${b.name}`,
                  confirmText: 'Configurar',
                  onConfirm: (val) =>
                    run(
                      val.trim() ? 'Upstream configurado' : 'Upstream quitado',
                      () => bridge.setUpstream(repo.path, b.name, val.trim())
                    )
                })
            },
            {
              label: 'Renombrar…',
              onClick: () =>
                openPrompt({
                  title: 'Renombrar rama',
                  defaultValue: b.name,
                  confirmText: 'Renombrar',
                  onConfirm: (name) => run('Renombrar rama', () => bridge.renameBranch(repo.path, b.name, name))
                })
            },
            {
              label: 'Eliminar',
              danger: true,
              disabled: b.current,
              onClick: () =>
                openConfirm({
                  title: 'Eliminar rama',
                  message: `¿Eliminar la rama «${b.name}»?`,
                  danger: true,
                  confirmText: 'Eliminar',
                  onConfirm: () => run('Eliminar rama', () => bridge.deleteBranch(repo.path, b.name, true))
                })
            }
          ])
    ])
  }

  return (
    <div
      className={`side-item branch-row${b.current ? ' current' : ''}${isOver && canDrop ? ' drag-over' : ''}`}
      style={{ paddingLeft: 26 + depth * 14 }}
      draggable
      onDragStart={(e) => {
        dragStart({ kind: 'branch', label: b.name, ref: b.name, isRemote: b.isRemote, hash: b.tip })
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => dragEnd()}
      onDragOver={(e) => {
        if (canDrop) {
          e.preventDefault()
          setOver(key)
        }
      }}
      onDragLeave={() => useDrag.getState().overKey === key && setOver(null)}
      onDrop={(e) => {
        e.preventDefault()
        const item = useDrag.getState().item
        dragEnd()
        if (!item || !repo || item.ref === b.name) return
        const target: DragItem = { kind: 'branch', label: b.name, ref: b.name, isRemote: b.isRemote, hash: b.tip }
        if (item.kind === 'branch') {
          openMenu(e.clientX, e.clientY, branchOntoBranchMenu(repo.path, item, target, run))
        } else if (item.kind === 'commit' && item.hash) {
          openMenu(e.clientX, e.clientY, commitOntoBranchMenu(repo.path, item.hash, item.label, target, run))
        }
      }}
      onDoubleClick={() => repo && !b.current && run('Checkout', () => bridge.checkout(repo.path, b.name))}
      onContextMenu={contextMenu}
      title={b.name}
    >
      {b.isRemote ? (
        <Cloud size={14} />
      ) : (
        <GitBranch size={14} color={b.current ? 'var(--accent-green)' : undefined} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
      {(b.ahead > 0 || b.behind > 0) && (
        <span className="track">
          {b.ahead > 0 && <span>↑{b.ahead}</span>}
          {b.behind > 0 && <span>↓{b.behind}</span>}
        </span>
      )}
    </div>
  )
})

function FolderNode({ node, depth }: { node: TreeNode; depth: number }): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <div
        className="side-item folder-row"
        style={{ paddingLeft: 26 + depth * 14 }}
        onClick={() => setOpen(!open)}
      >
        {open ? <FolderOpen size={14} /> : <Folder size={14} />}
        <span>{node.name}</span>
      </div>
      {open && (
        <>
          {node.folders.map((f) => (
            <FolderNode key={f.name} node={f} depth={depth + 1} />
          ))}
          {node.branches.map((b) => (
            <BranchRow key={b.name} b={b} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  )
}

export function Sidebar(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const branches = useStore((s) => s.branches)
  const refs = useStore((s) => s.refs)
  const run = useStore((s) => s.run)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openPrompt, openConfirm } = useDialog()

  // Árbol memoizado: mantiene la identidad de los nodos entre re-renders para
  // que las filas memoizadas no se reconstruyan sin necesidad.
  const localTree = useMemo(() => buildTree(branches?.local ?? []), [branches])

  if (!repo || !branches) return <div className="sidebar" />

  return (
    <div className="sidebar">
      <Section title="Local" icon={<GitBranch size={13} />} count={branches.local.length}>
        {localTree.folders.map((f) => (
          <FolderNode key={f.name} node={f} depth={0} />
        ))}
        {localTree.branches.map((b) => (
          <BranchRow key={b.name} b={b} depth={0} />
        ))}
      </Section>

      <Section title="Remotos" icon={<Cloud size={13} />} count={branches.remote.length}>
        {branches.remote.map((b) => (
          <BranchRow key={b.name} b={b} depth={0} />
        ))}
      </Section>

      <Section title="Tags" icon={<TagIcon size={13} />} count={refs?.tags.length ?? 0}>
        {refs?.tags.map((t) => (
          <div
            key={t.name}
            className="side-item"
            onDoubleClick={() => run('Checkout tag', () => bridge.checkout(repo.path, t.name))}
            onContextMenu={(e) => {
              e.preventDefault()
              const remote = refs?.defaultRemote || refs?.remotes[0]?.name || ''
              const otherTags = (refs?.tags ?? []).filter((o) => o.name !== t.name)
              openMenu(e.clientX, e.clientY, [
                { label: 'Checkout', onClick: () => run('Checkout tag', () => bridge.checkout(repo.path, t.name)) },
                { divider: true },
                {
                  label: 'Comparar con HEAD',
                  onClick: () =>
                    useCenterView
                      .getState()
                      .openCompare({ a: t.name, b: 'HEAD', aLabel: t.name, bLabel: 'HEAD' })
                },
                {
                  label: 'Comparar con otro tag…',
                  disabled: otherTags.length === 0,
                  onClick: () =>
                    openPrompt({
                      title: `Comparar «${t.name}» con…`,
                      label: 'Otro tag (o cualquier referencia)',
                      defaultValue: otherTags[0]?.name ?? '',
                      confirmText: 'Comparar',
                      onConfirm: (other) =>
                        other.trim() &&
                        useCenterView
                          .getState()
                          .openCompare({ a: t.name, b: other.trim(), aLabel: t.name, bLabel: other.trim() })
                    })
                },
                {
                  label: 'Ver commits contenidos en el tag',
                  onClick: () =>
                    useCenterView.getState().openHistory({ title: `Historial de ${t.name}`, ref: t.name })
                },
                { divider: true },
                {
                  label: remote ? `Push tag a ${remote}` : 'Push tag (sin remotos)',
                  disabled: !remote,
                  onClick: () => run(`Tag «${t.name}» publicado`, () => bridge.pushTag(repo.path, t.name, remote))
                },
                {
                  label: 'Renombrar…',
                  onClick: () =>
                    openPrompt({
                      title: `Renombrar tag «${t.name}»`,
                      label: 'Nombre nuevo (se recrea y se borra el viejo)',
                      defaultValue: t.name,
                      confirmText: 'Renombrar',
                      onConfirm: (name) => {
                        const newName = name.trim()
                        if (!newName || newName === t.name) return
                        // Renombra en local y, hecho eso, ofrece actualizar el remoto.
                        void run('Tag renombrado', () =>
                          bridge.renameTag(repo.path, t.name, newName)
                        ).then(() => {
                          if (!remote) return
                          openConfirm({
                            title: 'Actualizar el remoto',
                            message: `Renombrado en local. ¿Actualizar también ${remote}? Se publicará «${newName}» y se eliminará «${t.name}» del remoto (afecta a todo el equipo).`,
                            confirmText: 'Actualizar remoto',
                            onConfirm: () =>
                              run('Remoto actualizado', async () => {
                                await bridge.pushTag(repo.path, newName, remote)
                                try {
                                  await bridge.deleteRemoteTag(repo.path, remote, t.name)
                                } catch (err) {
                                  // El tag viejo podía no estar publicado: no es un fallo.
                                  const msg = err instanceof Error ? err.message : String(err)
                                  if (!/does not exist|unable to delete|remote ref/i.test(msg)) throw err
                                }
                              })
                          })
                        })
                      }
                    })
                },
                { divider: true },
                {
                  label: 'Eliminar tag (local)',
                  danger: true,
                  onClick: () => run('Eliminar tag', () => bridge.deleteTag(repo.path, t.name))
                },
                {
                  label: remote ? `Eliminar tag (local y ${remote})` : 'Eliminar tag (local y remoto)',
                  danger: true,
                  disabled: !remote,
                  onClick: () =>
                    openConfirm({
                      title: 'Eliminar tag local y remoto',
                      message: `Se eliminará «${t.name}» de este repositorio y del remoto ${remote} (afecta a todo el equipo). ¿Continuar?`,
                      danger: true,
                      confirmText: 'Eliminar ambos',
                      onConfirm: () =>
                        run('Tag eliminado (local y remoto)', async () => {
                          await bridge.deleteTag(repo.path, t.name)
                          await bridge.deleteRemoteTag(repo.path, remote, t.name)
                        })
                    })
                }
              ])
            }}
          >
            <TagIcon size={14} color="var(--warn)" />
            <span>{t.name}</span>
          </div>
        ))}
      </Section>

      <Section title="Stashes" icon={<Archive size={13} />} count={refs?.stashes.length ?? 0}>
        {refs?.stashes.map((s) => (
          <div
            key={s.index}
            className="side-item"
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(e.clientX, e.clientY, [
                { label: 'Aplicar', onClick: () => run('Stash apply', () => bridge.stashApply(repo.path, s.index)) },
                { label: 'Pop', onClick: () => run('Stash pop', () => bridge.stashPop(repo.path, s.index)) },
                { divider: true },
                {
                  // Diff del stash = sus cambios respecto al commit del que salió.
                  label: 'Ver diff del stash',
                  onClick: () =>
                    useCenterView.getState().openCompare({
                      a: `stash@{${s.index}}^`,
                      b: `stash@{${s.index}}`,
                      aLabel: `padre de stash@{${s.index}}`,
                      bLabel: s.message || `stash@{${s.index}}`
                    })
                },
                {
                  label: 'Comparar con HEAD',
                  onClick: () =>
                    useCenterView.getState().openCompare({
                      a: 'HEAD',
                      b: `stash@{${s.index}}`,
                      aLabel: 'HEAD',
                      bLabel: `stash@{${s.index}}`
                    })
                },
                {
                  label: 'Comparar con el working tree',
                  onClick: () =>
                    useCenterView.getState().openCompare({
                      a: `stash@{${s.index}}`,
                      b: '',
                      aLabel: `stash@{${s.index}}`,
                      bLabel: 'Working tree'
                    })
                },
                { divider: true },
                {
                  label: 'Editar mensaje…',
                  onClick: () =>
                    openPrompt({
                      title: 'Editar mensaje del stash',
                      label: 'Mensaje nuevo (el contenido no cambia)',
                      defaultValue: s.message,
                      confirmText: 'Guardar',
                      onConfirm: (msg) => {
                        const clean = msg.trim()
                        if (!clean || clean === s.message) return
                        openConfirm({
                          title: 'Editar mensaje del stash',
                          message:
                            'El stash se volverá a guardar con el mensaje nuevo y se descartará la entrada anterior (mismo contenido, mismo commit). ¿Continuar?',
                          confirmText: 'Guardar mensaje',
                          onConfirm: () =>
                            run('Mensaje del stash actualizado', () =>
                              bridge.stashRename(repo.path, s.index, clean)
                            )
                        })
                      }
                    })
                },
                { divider: true },
                { label: 'Eliminar', danger: true, onClick: () => run('Stash drop', () => bridge.stashDrop(repo.path, s.index)) }
              ])
            }}
            title={s.message}
          >
            <Archive size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.message}</span>
          </div>
        ))}
      </Section>

      <PullRequestsSection />

      <IssuesSection />

      <RemotesSection />

      <SubmodulesSection />

      <WorktreesSection />
    </div>
  )
}

import {
  AlertTriangle,
  CircleDot,
  Clock,
  ExternalLink,
  Eye,
  FolderGit2,
  GitPullRequest,
  Loader2,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Activity as ActivityIcon,
  Trash2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { aggregateActivity, type ActivityData, type ActivityItem } from '@shared/activity'
import { bridge } from '../bridge'
import { useCenterView } from '../centerView'
import { useContextMenu } from '../contextMenu'
import { useDialog } from '../dialog'
import { useStore } from '../store'
import { activeWorkspace, useWorkspaces } from '../workspaces'

interface ActivityPanelState {
  open: boolean
  openPanel: () => void
  close: () => void
}

export const useActivityPanel = create<ActivityPanelState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  close: () => set({ open: false })
}))

type Tab = 'all' | 'pr' | 'issue' | 'wip' | 'snoozed'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pr', label: 'Pull Requests' },
  { id: 'issue', label: 'Issues' },
  { id: 'wip', label: 'WIPs' },
  { id: 'all', label: 'Todo' },
  { id: 'snoozed', label: 'Pospuestos' }
]

/** Prioridad y estado de lectura por elemento, persistidos localmente. */
interface ItemMeta {
  pinned?: boolean
  snoozedUntil?: number
  read?: boolean
}

interface SavedView {
  name: string
  tab: Tab
  author: string
  assignee: string
  label: string
}

const META_KEY = 'marea-activity-meta'
const VIEWS_KEY = 'marea-activity-views'

function loadMeta(): Record<string, ItemMeta> {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) || '{}') as Record<string, ItemMeta>
    // Los snooze vencidos se limpian al cargar.
    const now = Date.now()
    for (const k of Object.keys(raw)) {
      if (raw[k].snoozedUntil && raw[k].snoozedUntil! <= now) delete raw[k].snoozedUntil
      if (!raw[k].pinned && !raw[k].snoozedUntil && !raw[k].read) delete raw[k]
    }
    return raw
  } catch {
    return {}
  }
}

function loadViews(): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]') as SavedView[]
  } catch {
    return []
  }
}

const HOUR = 3600_000

export function Activity(): JSX.Element | null {
  const open = useActivityPanel((s) => s.open)
  const close = useActivityPanel((s) => s.close)
  const tabs = useStore((s) => s.tabs)
  const openRepo = useStore((s) => s.openRepo)
  const notify = useStore((s) => s.notify)
  const wsData = useWorkspaces((s) => s.data)
  const loadWs = useWorkspaces((s) => s.load)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openPrompt } = useDialog()

  const [data, setData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('pr')
  const [author, setAuthor] = useState('')
  const [assignee, setAssignee] = useState('')
  const [label, setLabel] = useState('')
  const [meta, setMeta] = useState<Record<string, ItemMeta>>({})
  const [views, setViews] = useState<SavedView[]>([])
  const [viewName, setViewName] = useState('')

  const ws = activeWorkspace(wsData)
  // Fuente de repos: el Workspace activo; si no hay, las pestañas abiertas
  // (solo para mostrar en la cabecera; `load` la resuelve por su cuenta).
  const repos = useMemo(
    () => (ws && ws.repos.length > 0 ? ws.repos : tabs.map((t) => t.path)),
    [ws, tabs]
  )

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      // Espera a que los workspaces estén cargados antes de decidir la fuente:
      // si no, la primera apertura agregaría solo las pestañas abiertas.
      if (!useWorkspaces.getState().data) await loadWs()
      const active = activeWorkspace(useWorkspaces.getState().data)
      const source =
        active && active.repos.length > 0
          ? active.repos
          : useStore.getState().tabs.map((t) => t.path)
      const result = await aggregateActivity(source, {
        listPullRequests: (p) => bridge.listPullRequests(p),
        listIssues: (p) => bridge.listIssues(p),
        wipCount: async (p) => {
          const st = await bridge.status(p)
          return st.staged.length + st.unstaged.length + st.conflicted.length
        }
      })
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [loadWs])

  useEffect(() => {
    if (open) {
      setMeta(loadMeta())
      setViews(loadViews())
      void load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const patchMeta = (key: string, patch: Partial<ItemMeta>): void => {
    setMeta((m) => {
      const next = { ...m, [key]: { ...m[key], ...patch } }
      if (!next[key].pinned && !next[key].snoozedUntil && !next[key].read) delete next[key]
      try {
        localStorage.setItem(META_KEY, JSON.stringify(next))
      } catch {
        /* sin almacenamiento */
      }
      return next
    })
  }

  const now = Date.now()
  const isSnoozed = (it: ActivityItem): boolean => (meta[it.key]?.snoozedUntil ?? 0) > now

  const items = data?.items ?? []
  const authors = [...new Set(items.map((i) => i.author).filter(Boolean))].sort() as string[]
  const assignees = [...new Set(items.flatMap((i) => i.assignees))].sort()
  const labels = [...new Set(items.flatMap((i) => i.labels.map((l) => l.name)))].sort()

  const visible = items
    .filter((it) => (tab === 'snoozed' ? isSnoozed(it) : !isSnoozed(it)))
    .filter((it) => tab === 'all' || tab === 'snoozed' || it.kind === tab)
    .filter((it) => !author || it.author === author)
    .filter((it) => !assignee || it.assignees.includes(assignee))
    .filter((it) => !label || it.labels.some((l) => l.name === label))
    .sort((a, b) => {
      const pa = meta[a.key]?.pinned ? 0 : 1
      const pb = meta[b.key]?.pinned ? 0 : 1
      if (pa !== pb) return pa - pb
      if (a.repoName !== b.repoName) return a.repoName.localeCompare(b.repoName)
      return (b.number ?? 0) - (a.number ?? 0)
    })

  const countFor = (t: Tab): number =>
    items.filter((it) => (t === 'snoozed' ? isSnoozed(it) : !isSnoozed(it)))
      .filter((it) => t === 'all' || t === 'snoozed' || it.kind === t).length

  const openItem = async (it: ActivityItem): Promise<void> => {
    close()
    await openRepo(it.repoPath)
    if (it.kind === 'pr' && it.number) useCenterView.getState().openPR(it.number)
    else if (it.kind === 'issue' && it.number) useCenterView.getState().openIssue(it.number)
    else useStore.getState().setSelection({ kind: 'wip' })
  }

  const snoozeMenu = (e: React.MouseEvent, it: ActivityItem): void => {
    e.stopPropagation()
    const opts = isSnoozed(it)
      ? [{ label: 'Quitar snooze', onClick: () => patchMeta(it.key, { snoozedUntil: undefined }) }]
      : [
          { label: 'Posponer 1 hora', onClick: () => patchMeta(it.key, { snoozedUntil: now + HOUR }) },
          { label: 'Posponer 4 horas', onClick: () => patchMeta(it.key, { snoozedUntil: now + 4 * HOUR }) },
          { label: 'Posponer hasta mañana', onClick: () => patchMeta(it.key, { snoozedUntil: now + 24 * HOUR }) }
        ]
    openMenu(e.clientX, e.clientY, opts)
  }

  const saveView = (): void =>
    openPrompt({
      title: 'Guardar vista',
      label: 'Nombre de la vista (pestaña + filtros actuales)',
      placeholder: 'Mis PRs urgentes',
      confirmText: 'Guardar',
      onConfirm: (name) => {
        const view: SavedView = { name: name.trim(), tab, author, assignee, label }
        setViews((v) => {
          const next = [...v.filter((x) => x.name !== view.name), view]
          try {
            localStorage.setItem(VIEWS_KEY, JSON.stringify(next))
          } catch {
            /* sin almacenamiento */
          }
          return next
        })
        setViewName(name.trim())
        notify('success', `Vista «${name.trim()}» guardada ✓`)
      }
    })

  const applyView = (name: string): void => {
    setViewName(name)
    const v = views.find((x) => x.name === name)
    if (!v) return
    setTab(v.tab)
    setAuthor(v.author)
    setAssignee(v.assignee)
    setLabel(v.label)
  }

  const deleteView = (): void => {
    if (!viewName) return
    setViews((v) => {
      const next = v.filter((x) => x.name !== viewName)
      try {
        localStorage.setItem(VIEWS_KEY, JSON.stringify(next))
      } catch {
        /* sin almacenamiento */
      }
      return next
    })
    setViewName('')
  }

  const kindIcon = (it: ActivityItem): JSX.Element =>
    it.kind === 'pr' ? (
      <GitPullRequest size={14} color={it.draft ? 'var(--text-muted)' : 'var(--accent-green)'} />
    ) : it.kind === 'issue' ? (
      <CircleDot size={14} color={it.labels[0]?.color ?? 'var(--accent)'} />
    ) : (
      <Pencil size={14} color="var(--warn)" />
    )

  return (
    <div className="pr-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="pr-panel act-panel">
        <div className="pr-head">
          <ActivityIcon size={16} color="var(--accent)" />
          <h3>Actividad</h3>
          <span className="pr-repo">
            {ws && ws.repos.length > 0
              ? `workspace «${ws.name}» · ${repos.length} repos`
              : `${repos.length} pestañas abiertas`}
          </span>
          <button className="icon-btn" title="Recargar" onClick={() => void load()}>
            <RefreshCw size={14} />
          </button>
          <button className="icon-btn" onClick={close} title="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="act-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`act-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              <span className="count">{countFor(t.id)}</span>
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <select
            className="act-select"
            value={viewName}
            onChange={(e) => applyView(e.target.value)}
            title="Vistas guardadas"
          >
            <option value="">vista: (ninguna)</option>
            {views.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
          <button className="icon-btn" title="Guardar vista actual" onClick={saveView}>
            <Plus size={15} />
          </button>
          {viewName && (
            <button className="icon-btn" title="Eliminar la vista seleccionada" onClick={deleteView}>
              <Trash2 size={14} />
            </button>
          )}
        </div>

        <div className="act-filters">
          <select className="act-select" value={author} onChange={(e) => setAuthor(e.target.value)}>
            <option value="">creador: todos</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select className="act-select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">asignado: todos</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select className="act-select" value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="">label: todas</option>
            {labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {loading && (
            <span className="act-loading">
              <Loader2 size={13} className="ws-spin" /> agregando repos…
            </span>
          )}
        </div>

        {data && data.errors.length > 0 && (
          <div className="act-errors">
            {data.errors.map((e) => (
              <span key={e.repoPath} title={e.error}>
                <AlertTriangle size={12} /> {e.repoPath.split(/[\\/]/).pop()}: {e.error}
              </span>
            ))}
          </div>
        )}

        <div className="act-list">
          {visible.map((it) => {
            const m = meta[it.key]
            return (
              <div
                key={it.key}
                className={`act-row${m?.read ? ' read' : ''}${m?.pinned ? ' pinned' : ''}`}
                onClick={() => void openItem(it)}
                title={`${it.repoPath}${it.url ? `\n${it.url}` : ''}`}
              >
                {kindIcon(it)}
                <span className="act-chip">{it.repoName}</span>
                <span className="act-title">
                  {it.number ? `#${it.number} ` : ''}
                  {it.title}
                  {it.draft && <span className="act-draft"> (draft)</span>}
                </span>
                {it.labels.slice(0, 3).map((l) => (
                  <span key={l.name} className="act-label" style={{ borderColor: l.color, color: l.color }}>
                    {l.name}
                  </span>
                ))}
                {it.author && <span className="act-author">{it.author}</span>}
                <span className="act-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    title={m?.pinned ? 'Quitar pin' : 'Fijar arriba'}
                    onClick={() => patchMeta(it.key, { pinned: !m?.pinned })}
                  >
                    <Pin size={13} color={m?.pinned ? 'var(--accent)' : undefined} />
                  </button>
                  <button
                    className="icon-btn"
                    title={isSnoozed(it) ? 'Pospuesto (clic para opciones)' : 'Posponer (snooze)'}
                    onClick={(e) => snoozeMenu(e, it)}
                  >
                    <Clock size={13} color={isSnoozed(it) ? 'var(--warn)' : undefined} />
                  </button>
                  <button
                    className="icon-btn"
                    title={m?.read ? 'Marcar como no leído' : 'Marcar como leído'}
                    onClick={() => patchMeta(it.key, { read: !m?.read })}
                  >
                    <Eye size={13} color={m?.read ? 'var(--accent-green)' : undefined} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Abrir el repositorio"
                    onClick={() => {
                      close()
                      void openRepo(it.repoPath)
                    }}
                  >
                    <FolderGit2 size={13} />
                  </button>
                  {it.url && (
                    <button className="icon-btn" title="Abrir en el navegador" onClick={() => bridge.openExternal(it.url!)}>
                      <ExternalLink size={13} />
                    </button>
                  )}
                </span>
              </div>
            )
          })}
          {visible.length === 0 && !loading && (
            <div className="pr-empty" style={{ padding: 16 }}>
              {repos.length === 0
                ? 'No hay repos: abre pestañas o define un workspace.'
                : 'Nada que mostrar con la pestaña y filtros actuales.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

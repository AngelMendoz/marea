import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { bridge } from '../bridge'
import { useDialog } from '../dialog'
import { useStore } from '../store'
import { activeWorkspace, useWorkspaces, withLimit } from '../workspaces'

interface WorkspacesPanelState {
  open: boolean
  openPanel: () => void
  close: () => void
}

export const useWorkspacesPanel = create<WorkspacesPanelState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  close: () => set({ open: false })
}))

/** Estado por repo durante una acción en lote (fetch/pull/abrir). */
type BatchState = { state: 'run' | 'ok' | 'error'; error?: string }

const repoName = (path: string): string => path.split(/[\\/]/).pop() || path

export function WorkspacesPanel(): JSX.Element | null {
  const open = useWorkspacesPanel((s) => s.open)
  const close = useWorkspacesPanel((s) => s.close)
  const { data, load, save, remove, rename, setActive } = useWorkspaces()
  const notify = useStore((s) => s.notify)
  const openRepo = useStore((s) => s.openRepo)
  const tabs = useStore((s) => s.tabs)
  const { openPrompt, openConfirm } = useDialog()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<Record<string, BatchState>>({})
  const [missing, setMissing] = useState<Record<string, boolean>>({})
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const ws = activeWorkspace(data ?? null)

  useEffect(() => {
    if (open) {
      setSelected(new Set())
      setBatch({})
      void load()
    }
  }, [open, load])

  // Marca las rutas que ya no existen o dejaron de ser repos.
  useEffect(() => {
    if (!open || !ws) return
    let cancelled = false
    void (async () => {
      const result: Record<string, boolean> = {}
      await withLimit(ws.repos, 4, async (p) => {
        result[p] = !(await bridge.isRepo(p).catch(() => false))
      })
      if (!cancelled) setMissing(result)
    })()
    return () => {
      cancelled = true
    }
  }, [open, ws?.name, ws?.repos.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const createWorkspace = (): void =>
    openPrompt({
      title: 'Nuevo workspace',
      label: 'Nombre del workspace',
      placeholder: 'Mi equipo',
      confirmText: 'Crear',
      onConfirm: (name) => {
        void save({ name: name.trim(), repos: [], createdAt: Date.now() }).then(() =>
          setActive(name.trim())
        )
      }
    })

  const renameCurrent = (): void => {
    if (!ws) return
    openPrompt({
      title: 'Renombrar workspace',
      defaultValue: ws.name,
      confirmText: 'Renombrar',
      onConfirm: (name) => void rename(ws.name, name)
    })
  }

  const deleteCurrent = (): void => {
    if (!ws) return
    openConfirm({
      title: 'Eliminar workspace',
      message: `¿Eliminar el workspace «${ws.name}»? Los repositorios no se tocan, solo el grupo.`,
      danger: true,
      confirmText: 'Eliminar',
      onConfirm: () => void remove(ws.name)
    })
  }

  const addRepo = async (): Promise<void> => {
    if (!ws) return
    const path = await bridge.pickRepo()
    if (!path) return
    const p = path.replace(/\\/g, '/')
    if (ws.repos.includes(p)) return
    await save({ ...ws, repos: [...ws.repos, p] })
  }

  const addOpenTabs = async (): Promise<void> => {
    if (!ws) return
    const paths = tabs.map((t) => t.path.replace(/\\/g, '/'))
    const merged = [...new Set([...ws.repos, ...paths])]
    if (merged.length === ws.repos.length) {
      notify('info', 'Las pestañas abiertas ya están en el workspace')
      return
    }
    await save({ ...ws, repos: merged })
  }

  const removeRepos = (paths: string[]): void => {
    if (!ws || paths.length === 0) return
    void save({ ...ws, repos: ws.repos.filter((r) => !paths.includes(r)) }).then(() =>
      setSelected(new Set())
    )
  }

  const toggle = (path: string): void => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const allSelected = !!ws && ws.repos.length > 0 && ws.repos.every((r) => selected.has(r))
  const toggleAll = (): void => {
    if (!ws) return
    setSelected(allSelected ? new Set() : new Set(ws.repos))
  }

  /** Acción en lote con concurrencia limitada y estado por repo. */
  const runBatch = async (
    label: string,
    paths: string[],
    fn: (p: string) => Promise<unknown>
  ): Promise<void> => {
    if (paths.length === 0 || busy) return
    setBusy(true)
    setBatch(Object.fromEntries(paths.map((p) => [p, { state: 'run' } as BatchState])))
    let failed = 0
    await withLimit(paths, 3, async (p) => {
      try {
        await fn(p)
        setBatch((b) => ({ ...b, [p]: { state: 'ok' } }))
      } catch (e) {
        failed++
        setBatch((b) => ({
          ...b,
          [p]: { state: 'error', error: e instanceof Error ? e.message : String(e) }
        }))
      }
    })
    setBusy(false)
    notify(failed ? 'error' : 'success', `${label}: ${paths.length - failed}/${paths.length} repos`)
  }

  const sel = ws ? ws.repos.filter((r) => selected.has(r)) : []

  /** Abre repos en pestañas, en orden (openRepo cambia la pestaña activa). */
  const openMany = async (paths: string[]): Promise<void> => {
    if (busy) return
    setBusy(true)
    for (const p of paths) {
      if (!missing[p]) await openRepo(p)
    }
    setBusy(false)
    close()
  }

  const reorder = (from: number, to: number): void => {
    if (!ws || from === to) return
    const repos = [...ws.repos]
    const [moved] = repos.splice(from, 1)
    repos.splice(to, 0, moved)
    void save({ ...ws, repos })
  }

  return (
    <div className="pr-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="pr-panel ws-panel">
        <div className="pr-head">
          <LayoutGrid size={16} color="var(--accent)" />
          <h3>Workspaces</h3>
          <button className="icon-btn" onClick={close} title="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="ws-layout">
          <div className="ws-list">
            <div className="ws-list-head">
              <span>Workspaces</span>
              <button className="icon-btn" title="Nuevo workspace" onClick={createWorkspace}>
                <Plus size={15} />
              </button>
            </div>
            {(data?.workspaces ?? []).map((w) => (
              <div
                key={w.name}
                className={`ws-item${w.name === data?.active ? ' active' : ''}`}
                onClick={() => void setActive(w.name)}
                title={`${w.repos.length} repositorio(s)`}
              >
                <LayoutGrid size={14} />
                <span className="ws-item-name">{w.name}</span>
                <span className="count">{w.repos.length}</span>
              </div>
            ))}
            {(data?.workspaces.length ?? 0) === 0 && (
              <div className="pr-empty" style={{ padding: '8px 10px' }}>
                Crea un workspace para agrupar repos.
              </div>
            )}
          </div>

          <div className="ws-main">
            {!ws ? (
              <div className="pr-empty" style={{ padding: 20 }}>
                Selecciona o crea un workspace.
              </div>
            ) : (
              <>
                <div className="ws-toolbar">
                  <span className="ws-name">{ws.name}</span>
                  <button className="icon-btn" title="Renombrar workspace" onClick={renameCurrent}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon-btn" title="Eliminar workspace" onClick={deleteCurrent}>
                    <Trash2 size={14} />
                  </button>
                  <div style={{ flex: 1 }} />
                  <button className="hunk-btn" onClick={() => void addRepo()}>
                    <FolderPlus size={13} /> Añadir repo
                  </button>
                  <button className="hunk-btn" disabled={tabs.length === 0} onClick={() => void addOpenTabs()}>
                    <Plus size={13} /> Añadir pestañas abiertas
                  </button>
                  <button
                    className="hunk-btn accent"
                    disabled={ws.repos.length === 0 || busy}
                    onClick={() => void openMany(ws.repos)}
                  >
                    <FolderOpen size={13} /> Abrir todos
                  </button>
                </div>

                <div className="ws-batch">
                  <label className="ws-check-all" title="Seleccionar todos">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    <span>
                      {sel.length > 0 ? `${sel.length} seleccionado(s)` : 'Seleccionar todos'}
                    </span>
                  </label>
                  <button
                    className="hunk-btn"
                    disabled={sel.length === 0 || busy}
                    title="git fetch --all --prune en los seleccionados"
                    onClick={() => void runBatch('Fetch', sel, (p) => bridge.fetch(p, { prune: true }))}
                  >
                    <RefreshCw size={13} /> Fetch
                  </button>
                  <button
                    className="hunk-btn"
                    disabled={sel.length === 0 || busy}
                    title="git pull en los seleccionados"
                    onClick={() => void runBatch('Pull', sel, (p) => bridge.pull(p))}
                  >
                    <ArrowDownToLine size={13} /> Pull
                  </button>
                  <button
                    className="hunk-btn"
                    disabled={sel.length === 0 || busy}
                    title="Abrir los seleccionados en pestañas"
                    onClick={() => void openMany(sel)}
                  >
                    <FolderOpen size={13} /> Abrir
                  </button>
                  <button
                    className="hunk-btn danger"
                    disabled={sel.length === 0 || busy}
                    title="Quitar del workspace (no borra nada del disco)"
                    onClick={() => removeRepos(sel)}
                  >
                    <Trash2 size={13} /> Quitar
                  </button>
                </div>

                <div className="ws-table">
                  {ws.repos.map((p, i) => {
                    const st = batch[p]
                    return (
                      <div
                        key={p}
                        className={`ws-row${dragIdx === i ? ' dragging' : ''}`}
                        draggable
                        onDragStart={() => setDragIdx(i)}
                        onDragEnd={() => setDragIdx(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragIdx !== null) reorder(dragIdx, i)
                          setDragIdx(null)
                        }}
                        onDoubleClick={() => !missing[p] && void openMany([p])}
                        title={p}
                      >
                        <GripVertical size={13} className="ws-grip" />
                        <input type="checkbox" checked={selected.has(p)} onChange={() => toggle(p)} />
                        <FolderGit2 size={14} color={missing[p] ? 'var(--danger)' : 'var(--accent)'} />
                        <span className="ws-repo-name">{repoName(p)}</span>
                        <span className="ws-repo-path">{p}</span>
                        {missing[p] && (
                          <span className="ws-missing" title="La ruta no existe o no es un repo git">
                            <AlertTriangle size={12} /> no existe
                          </span>
                        )}
                        {st?.state === 'run' && <Loader2 size={13} className="ws-spin" />}
                        {st?.state === 'ok' && <Check size={13} color="var(--accent-green)" />}
                        {st?.state === 'error' && (
                          <span className="ws-missing" title={st.error}>
                            <AlertTriangle size={12} /> error
                          </span>
                        )}
                        <button
                          className="icon-btn"
                          title="Quitar del workspace"
                          onClick={() => removeRepos([p])}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )
                  })}
                  {ws.repos.length === 0 && (
                    <div className="pr-empty" style={{ padding: 14 }}>
                      Añade repositorios con «Añadir repo» o «Añadir pestañas abiertas».
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

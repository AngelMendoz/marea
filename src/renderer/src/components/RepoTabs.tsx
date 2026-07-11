import { FolderGit2, LayoutGrid, Plus, Activity, X } from 'lucide-react'
import { bridge } from '../bridge'
import { useContextMenu } from '../contextMenu'
import { useDialog } from '../dialog'
import { useStore } from '../store'
import { useActivityPanel } from './Activity'
import { useWorkspacesPanel } from './Workspaces'

export function RepoTabs(): JSX.Element | null {
  const { tabs, repo, aliases, switchTab, closeTab, openRepo, setAlias } = useStore()
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openPrompt } = useDialog()

  if (tabs.length === 0) return null

  const addRepo = async (): Promise<void> => {
    const path = await bridge.pickRepo()
    if (path) openRepo(path)
  }

  return (
    <div className="repo-tabs">
      <button
        className="tab-add"
        title="Actividad (PRs, issues y WIPs de todos los repos)"
        onClick={() => useActivityPanel.getState().openPanel()}
      >
        <Activity size={14} />
      </button>
      <button
        className="tab-add"
        title="Workspaces"
        onClick={() => useWorkspacesPanel.getState().openPanel()}
      >
        <LayoutGrid size={14} />
      </button>
      {tabs.map((t) => {
        const active = repo?.path === t.path
        const name = aliases[t.path] || t.name
        return (
          <div
            key={t.path}
            className={`repo-tab${active ? ' active' : ''}`}
            onClick={() => switchTab(t.path)}
            title={t.path}
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(e.clientX, e.clientY, [
                {
                  label: 'Asignar alias…',
                  onClick: () =>
                    openPrompt({
                      title: 'Alias del repositorio',
                      label: t.path,
                      defaultValue: aliases[t.path] || t.name,
                      confirmText: 'Guardar',
                      onConfirm: (v) => setAlias(t.path, v)
                    })
                },
                { label: 'Copiar ruta', onClick: () => navigator.clipboard?.writeText(t.path) },
                { divider: true },
                { label: 'Cerrar', danger: true, onClick: () => closeTab(t.path) }
              ])
            }}
          >
            <FolderGit2 size={13} color={active ? 'var(--accent)' : 'var(--text-dim)'} />
            <span className="tab-name">{name}</span>
            <button
              className="tab-close"
              title="Cerrar"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.path)
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
      <button className="tab-add" title="Abrir otro repositorio" onClick={addRepo}>
        <Plus size={15} />
      </button>
    </div>
  )
}

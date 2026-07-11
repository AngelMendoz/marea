import { Waves, FolderOpen, GitFork, FolderPlus, FolderGit2, LayoutGrid, Activity, X } from 'lucide-react'
import { useEffect } from 'react'
import { bridge } from '../bridge'
import { useDialog } from '../dialog'
import { useStore } from '../store'
import { useActivityPanel } from './Activity'
import { useWorkspacesPanel } from './Workspaces'

export function WelcomeView(): JSX.Element {
  const { recents, loadRecents, openRepo, notify } = useStore()
  const { openPrompt } = useDialog()

  useEffect(() => {
    loadRecents()
  }, [loadRecents])

  const open = async (): Promise<void> => {
    const path = await bridge.pickRepo()
    if (path) openRepo(path)
  }

  const init = async (): Promise<void> => {
    const dir = await bridge.pickFolder('Inicializar repositorio en…')
    if (!dir) return
    await bridge.initRepo(dir)
    openRepo(dir)
  }

  const clone = (): void => {
    openPrompt({
      title: 'Clonar repositorio',
      label: 'URL del repositorio',
      placeholder: 'https://github.com/usuario/repo.git',
      confirmText: 'Elegir destino…',
      onConfirm: async (url) => {
        const dir = await bridge.pickFolder('Carpeta destino')
        if (!dir) return
        try {
          const target = await bridge.clone({ url, dir })
          notify('success', 'Repositorio clonado')
          openRepo(target)
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Error al clonar')
        }
      }
    })
  }

  return (
    <div className="welcome">
      <div className="hero">
        <Waves className="logo" strokeWidth={2.2} />
        <h1>Marea</h1>
        <div className="tagline">Navega tu historial de Git</div>
      </div>

      <div className="actions">
        <button className="action-card" onClick={open}>
          <FolderOpen />
          Abrir repositorio
        </button>
        <button className="action-card" onClick={clone}>
          <GitFork />
          Clonar
        </button>
        <button className="action-card" onClick={init}>
          <FolderPlus />
          Inicializar
        </button>
        <button className="action-card" onClick={() => useWorkspacesPanel.getState().openPanel()}>
          <LayoutGrid />
          Workspaces
        </button>
        <button className="action-card" onClick={() => useActivityPanel.getState().openPanel()}>
          <Activity />
          Actividad
        </button>
      </div>

      {recents.length > 0 && (
        <div className="recents">
          <div className="r-head">Recientes</div>
          {recents.map((r) => (
            <div key={r.path} className="recent-item" onClick={() => openRepo(r.path)}>
              <FolderGit2 />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div className="r-name">{r.name}</div>
                <div className="r-path" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.path}
                </div>
              </div>
              <button
                className="icon-btn"
                title="Quitar de recientes"
                onClick={(e) => {
                  e.stopPropagation()
                  bridge.recentRemove(r.path).then(loadRecents)
                }}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { GitBranch, ArrowUp, ArrowDown, Database, FolderGit2, Home, ZoomIn, ZoomOut } from 'lucide-react'
import { bridge } from '../bridge'
import { useContextMenu } from '../contextMenu'
import { useDialog } from '../dialog'
import { useSettings, ZOOM_LEVELS } from '../settings'
import { useStore } from '../store'

/** Indicador Git LFS: visible cuando el repo rastrea archivos con
 *  LFS; su menú permite lfs pull y ver los archivos gestionados. */
function LfsIndicator(): JSX.Element | null {
  const repo = useStore((s) => s.repo)
  const lfs = useStore((s) => s.lfs)
  const run = useStore((s) => s.run)
  const notify = useStore((s) => s.notify)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openConfirm } = useDialog()
  if (!repo || !lfs?.used) return null

  const onClick = (e: React.MouseEvent): void => {
    if (!lfs.installed) {
      openConfirm({
        title: 'Git LFS no está instalado',
        message:
          'Este repositorio rastrea archivos con Git LFS, pero git-lfs no está instalado: los binarios aparecerán como punteros de texto. ¿Abrir la página de descarga (git-lfs.com)?',
        confirmText: 'Abrir página',
        onConfirm: () => bridge.openExternal('https://git-lfs.com')
      })
      return
    }
    openMenu(e.clientX, e.clientY, [
      {
        label: 'LFS pull (descargar binarios)',
        onClick: () => run('LFS pull', () => bridge.lfsPull(repo.path))
      },
      {
        label: 'Ver archivos LFS…',
        onClick: () =>
          void bridge
            .lfsFiles(repo.path)
            .then((files) =>
              notify(
                'info',
                files.length === 0
                  ? 'LFS: sin archivos gestionados en esta rama'
                  : `LFS (${files.length}): ${files
                      .slice(0, 6)
                      .map((f) => f.path)
                      .join(', ')}${files.length > 6 ? '…' : ''}`
              )
            )
            .catch((err) => notify('error', err instanceof Error ? err.message : 'Error de LFS'))
      },
      { divider: true },
      {
        label: `Patrones: ${lfs.patterns.slice(0, 4).join('  ')}${lfs.patterns.length > 4 ? ' …' : ''}`,
        disabled: true
      }
    ])
  }

  return (
    <span
      className="item lfs-chip"
      style={{ cursor: 'pointer', color: lfs.installed ? undefined : 'var(--warn)' }}
      title={
        lfs.installed
          ? `${lfs.version}\nPatrones LFS: ${lfs.patterns.join(', ')}`
          : 'Git LFS no está instalado (clic para instrucciones)'
      }
      onClick={onClick}
    >
      <Database size={12} /> LFS
    </span>
  )
}

/** Selector de zoom de la barra inferior. */
function ZoomControl(): JSX.Element {
  const zoom = useSettings((s) => s.zoom)
  const setZoom = useSettings((s) => s.setZoom)
  const zoomIn = useSettings((s) => s.zoomIn)
  const zoomOut = useSettings((s) => s.zoomOut)
  return (
    <span className="item zoom-ctl" title="Zoom de la interfaz">
      <button className="zoom-btn" title="Alejar (Ctrl+-)" onClick={zoomOut}>
        <ZoomOut size={12} />
      </button>
      <select value={String(zoom)} onChange={(e) => setZoom(parseFloat(e.target.value))}>
        {ZOOM_LEVELS.map((z) => (
          <option key={z} value={String(z)}>
            {Math.round(z * 100)}%
          </option>
        ))}
        {!ZOOM_LEVELS.includes(zoom) && <option value={String(zoom)}>{Math.round(zoom * 100)}%</option>}
      </select>
      <button className="zoom-btn" title="Acercar (Ctrl+=)" onClick={zoomIn}>
        <ZoomIn size={12} />
      </button>
    </span>
  )
}

export function StatusBar(): JSX.Element {
  const { repo, status, closeRepo } = useStore()
  if (!repo) {
    return (
      <div className="statusbar">
        <span className="item">{bridge.isElectron ? 'Marea — listo' : 'Marea — vista previa (datos de ejemplo)'}</span>
        <span className="spacer" />
        <ZoomControl />
      </div>
    )
  }
  return (
    <div className="statusbar">
      <span className="item" onClick={closeRepo} style={{ cursor: 'pointer' }} title="Volver al inicio">
        <Home size={13} /> Inicio
      </span>
      <span className="item">
        <GitBranch size={13} /> {status?.current ?? repo.currentBranch}
      </span>
      {status?.tracking && (
        <span className="item">
          <ArrowUp size={12} /> {status.ahead}
          <ArrowDown size={12} /> {status.behind}
        </span>
      )}
      <span className="spacer" />
      <LfsIndicator />
      <span className="item" title={repo.path}>
        <FolderGit2 size={13} /> {repo.path}
      </span>
      <ZoomControl />
    </div>
  )
}

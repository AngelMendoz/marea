import { useCallback, useEffect, useRef } from 'react'
import { bridge } from './bridge'
import { useCenterView } from './centerView'
import { CommitDetail } from './components/CommitDetail'
import { CompareView } from './components/CompareView'
import { ConflictEditor } from './components/ConflictEditor'
import { ContextMenu } from './components/ContextMenu'
import { HistoryView } from './components/HistoryView'
import { CreateIssue } from './components/CreateIssue'
import { CreatePR } from './components/CreatePR'
import { Dialogs } from './components/Dialogs'
import { DiffPane } from './components/DiffPane'
import { GitflowPanel } from './components/GitflowPanel'
import { GraphView } from './components/GraphView'
import { InteractiveRebase } from './components/InteractiveRebase'
import { IssueView } from './components/IssueView'
import { Activity } from './components/Activity'
import { OperationBanner } from './components/OperationBanner'
import { PullRequestView } from './components/PullRequestView'
import { RepoSettings } from './components/RepoSettings'
import { RepoTabs } from './components/RepoTabs'
import { Settings } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { StagingPanel } from './components/StagingPanel'
import { StatusBar } from './components/StatusBar'
import { TerminalPanel } from './components/TerminalPanel'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { Toolbar } from './components/Toolbar'
import { WelcomeView } from './components/WelcomeView'
import { WorkspacesPanel } from './components/Workspaces'
import { applyStartupSettings, useSettings } from './settings'
import { useShortcuts } from './shortcuts'
import { useStore } from './store'

/** Borde arrastrable del sidebar: redimensiona y persiste el ancho. */
function SidebarResizer(): JSX.Element {
  const setSidebarWidth = useSettings((s) => s.setSidebarWidth)
  const dragging = useRef(false)

  const onMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault()
      dragging.current = true
      document.body.style.cursor = 'col-resize'
      const onMove = (ev: MouseEvent): void => {
        if (dragging.current) setSidebarWidth(ev.clientX)
      }
      const onUp = (): void => {
        dragging.current = false
        document.body.style.cursor = ''
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [setSidebarWidth]
  )

  return (
    <div
      className="sidebar-resizer"
      title="Arrastra para redimensionar (doble clic: ancho por defecto)"
      onMouseDown={onMouseDown}
      onDoubleClick={() => setSidebarWidth(0)}
    />
  )
}

export default function App(): JSX.Element {
  // Suscripciones selectivas: el árbol completo no se re-renderiza con cada
  // toast o cambio de estado global (fluidez en repos grandes).
  const repo = useStore((s) => s.repo)
  const selection = useStore((s) => s.selection)
  const selectedFile = useStore((s) => s.selectedFile)
  const busy = useStore((s) => s.busy)
  const openRepo = useStore((s) => s.openRepo)
  const restoreSession = useStore((s) => s.restoreSession)
  const refresh = useStore((s) => s.refresh)
  const centerView = useCenterView((s) => s.view)
  const showSidebar = useSettings((s) => s.showSidebar)
  const showRightPanel = useSettings((s) => s.showRightPanel)
  const sidebarWidth = useSettings((s) => s.sidebarWidth)
  const autoFetchMinutes = useSettings((s) => s.autoFetchMinutes)

  // Atajos de teclado configurables.
  useShortcuts()

  // Al arrancar: preferencias persistidas (zoom, git elegido) y restauración
  // de las pestañas de la sesión anterior. En la vista previa de navegador,
  // si no hay sesión, abre el repo de ejemplo.
  useEffect(() => {
    applyStartupSettings()
    restoreSession().then((restored) => {
      if (!restored && !bridge.isElectron) {
        openRepo('C:/Users/sofia/Proyectos/marea')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Detección de cambios en vivo: el proceso main avisa y refrescamos.
  useEffect(() => {
    return bridge.onRepoChanged(() => refresh())
  }, [refresh])

  // Auto-fetch periódico del repo activo. Silencioso: sin toasts.
  useEffect(() => {
    if (!repo || autoFetchMinutes <= 0) return
    const id = setInterval(() => {
      if (useStore.getState().busy) return
      void bridge
        .fetch(repo.path, { prune: true })
        .then(() => refresh())
        .catch(() => undefined)
    }, autoFetchMinutes * 60_000)
    return () => clearInterval(id)
  }, [repo, autoFetchMinutes, refresh])

  return (
    <div className="app-shell">
      <TitleBar />
      <RepoTabs />
      <Toolbar />
      {busy && <div className="busy-bar" />}
      <OperationBanner />
      <div
        className="app-body"
        style={sidebarWidth > 0 ? ({ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties) : undefined}
      >
        {!repo ? (
          <WelcomeView />
        ) : (
          <>
            {showSidebar && (
              <>
                <Sidebar />
                <SidebarResizer />
              </>
            )}
            {centerView?.kind === 'pr' ? (
              <PullRequestView number={centerView.number} />
            ) : centerView?.kind === 'issue' ? (
              <IssueView number={centerView.number} />
            ) : centerView?.kind === 'compare' ? (
              <CompareView spec={centerView.spec} />
            ) : centerView?.kind === 'history' ? (
              <HistoryView spec={centerView.spec} />
            ) : selectedFile?.conflicted ? (
              <ConflictEditor />
            ) : selectedFile ? (
              <DiffPane />
            ) : (
              <GraphView />
            )}
            {showRightPanel &&
              (selection?.kind === 'commit' ? <CommitDetail hash={selection.hash} /> : <StagingPanel />)}
          </>
        )}
      </div>
      <TerminalPanel />
      <StatusBar />
      <Toasts />
      <Dialogs />
      <CreatePR />
      <CreateIssue />
      <GitflowPanel />
      <RepoSettings />
      <Settings />
      <WorkspacesPanel />
      <Activity />
      <InteractiveRebase />
      <ContextMenu />
    </div>
  )
}

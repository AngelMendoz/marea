import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  GitBranchPlus,
  Moon,
  RefreshCw,
  Archive,
  PackageOpen,
  Sun,
  FolderGit2,
  Settings,
  TerminalSquare,
  Workflow
} from 'lucide-react'
import { useContextMenu } from '../contextMenu'
import { useDialog } from '../dialog'
import {
  doFetch,
  doPull,
  doPush,
  doStashPop,
  primaryPush,
  promptNewBranch,
  promptStash,
  publishArgs
} from '../lib/gitActions'
import { useSettings } from '../settings'
import { useStore } from '../store'
import { useTerminalPanel } from '../terminal'
import { useGitflowPanel } from './GitflowPanel'
import { MergeTargetButton } from './MergeTargetButton'

export function Toolbar(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const status = useStore((s) => s.status)
  const refs = useStore((s) => s.refs)
  const theme = useStore((s) => s.theme)
  const busy = useStore((s) => s.busy)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const pullMode = useSettings((s) => s.pullMode)
  const { openConfirm } = useDialog()
  const openMenu = useContextMenu((s) => s.openMenu)
  const openGitflow = useGitflowPanel((s) => s.openPanel)
  const terminalOpen = useTerminalPanel((s) => s.open)
  const toggleTerminal = useTerminalPanel((s) => s.toggle)

  if (!repo) {
    return (
      <div className="toolbar">
        <div className="brand" style={{ paddingLeft: 4, fontWeight: 600 }}>
          Marea
        </div>
      </div>
    )
  }

  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0
  const currentBranch = status?.current || repo.currentBranch
  const hasUpstream = !!status?.tracking
  const remotes = refs?.remotes ?? []
  const defaultRemote = refs?.defaultRemote || remotes[0]?.name || 'origin'

  // Submenú del split-button de Pull: variantes + predeterminado.
  const pullMenu = (e: React.MouseEvent): void => {
    e.stopPropagation()
    const setPullMode = useSettings.getState().setPullMode
    openMenu(e.clientX, e.clientY, [
      { label: 'Pull (merge)', onClick: () => doPull('merge') },
      { label: 'Pull con rebase', onClick: () => doPull('rebase') },
      { label: 'Pull (solo fast-forward)', onClick: () => doPull('ff-only') },
      { divider: true },
      {
        label: `${pullMode === 'merge' ? '✓ ' : ''}Predeterminado: merge`,
        onClick: () => setPullMode('merge')
      },
      {
        label: `${pullMode === 'rebase' ? '✓ ' : ''}Predeterminado: rebase`,
        onClick: () => setPullMode('rebase')
      },
      {
        label: `${pullMode === 'ff-only' ? '✓ ' : ''}Predeterminado: solo fast-forward`,
        onClick: () => setPullMode('ff-only')
      }
    ])
  }

  const pushMenu = (e: React.MouseEvent): void => {
    e.stopPropagation()
    openMenu(e.clientX, e.clientY, [
      {
        label: hasUpstream ? 'Push' : `Publicar en ${defaultRemote}/${currentBranch}`,
        onClick: primaryPush
      },
      {
        label: 'Push --force-with-lease',
        danger: true,
        onClick: () =>
          openConfirm({
            title: 'Force push',
            message:
              'Se sobrescribirá el historial remoto (con --force-with-lease, que aborta si alguien más empujó). ¿Continuar?',
            danger: true,
            confirmText: 'Force push',
            onConfirm: () => doPush(hasUpstream ? { force: true } : publishArgs({ force: true }))
          })
      },
      { label: 'Push de tags', onClick: () => doPush({ tags: true }) },
      ...(remotes.length > 1
        ? [
            { divider: true } as const,
            ...remotes.map((r) => ({
              label: `Publicar en ${r.name}/${currentBranch}`,
              onClick: () => doPush(publishArgs({ remote: r.name }))
            }))
          ]
        : [])
    ])
  }

  return (
    <div className="toolbar">
      <div className="repo-pill">
        <FolderGit2 size={15} color="var(--accent)" />
        <span>{repo.name}</span>
        <span className="branch">· {currentBranch}</span>
      </div>

      <MergeTargetButton />

      <div className="tool-divider" />

      <button className="tool-btn" title="Fetch (con prune)" disabled={busy} onClick={doFetch}>
        <RefreshCw />
        <span className="tb-label">Fetch</span>
      </button>
      {/* Split-button de Pull */}
      <div className="split-btn">
        <button
          className="tool-btn"
          title={
            pullMode === 'rebase'
              ? 'Pull con rebase (predeterminado actual)'
              : pullMode === 'ff-only'
                ? 'Pull solo fast-forward (predeterminado actual)'
                : 'Pull (merge)'
          }
          disabled={busy}
          onClick={() => doPull()}
        >
          <ArrowDownToLine />
          <span className="tb-label">
            Pull{pullMode === 'rebase' ? ' ⤴' : pullMode === 'ff-only' ? ' »' : ''} {behind > 0 ? `(${behind})` : ''}
          </span>
        </button>
        <button className="split-caret" disabled={busy} title="Opciones de pull" onClick={pullMenu}>
          <ChevronDown size={13} />
        </button>
      </div>

      {/* Split-button de Push */}
      <div className="split-btn">
        <button
          className="tool-btn"
          title={hasUpstream ? 'Push' : `Publicar rama en ${defaultRemote}`}
          disabled={busy}
          onClick={primaryPush}
        >
          <ArrowUpFromLine />
          <span className="tb-label">{hasUpstream ? `Push${ahead > 0 ? ` (${ahead})` : ''}` : 'Publicar'}</span>
        </button>
        <button className="split-caret" disabled={busy} title="Opciones de push" onClick={pushMenu}>
          <ChevronDown size={13} />
        </button>
      </div>

      <div className="tool-divider" />

      <button className="tool-btn primary" title="Nueva rama" onClick={promptNewBranch}>
        <GitBranchPlus />
        <span className="tb-label">Rama</span>
      </button>
      <button className="tool-btn" title="Gitflow (features, releases, hotfixes)" onClick={openGitflow}>
        <Workflow />
        <span className="tb-label">Gitflow</span>
      </button>
      <button className="tool-btn" title="Guardar en stash" disabled={busy} onClick={promptStash}>
        <Archive />
        <span className="tb-label">Stash</span>
      </button>
      <button
        className="tool-btn"
        title="Aplicar y quitar el último stash"
        disabled={busy || !refs?.stashes.length}
        onClick={doStashPop}
      >
        <PackageOpen />
        <span className="tb-label">Pop</span>
      </button>

      <div className="tool-divider" />

      <button
        className={`tool-btn${terminalOpen ? ' active' : ''}`}
        title="Terminal en la carpeta del repositorio"
        onClick={toggleTerminal}
      >
        <TerminalSquare />
        <span className="tb-label">Terminal</span>
      </button>

      <div className="spacer" style={{ flex: 1 }} />

      <button className="tool-btn" title="Cambiar tema" onClick={toggleTheme}>
        {theme === 'dark' ? <Sun /> : <Moon />}
        <span className="tb-label">Tema</span>
      </button>
      <button
        className="tool-btn"
        title="Preferencias (zoom, paneles, atajos, git, integraciones)"
        onClick={() => useSettings.getState().openPanel()}
      >
        <Settings />
        <span className="tb-label">Ajustes</span>
      </button>
    </div>
  )
}

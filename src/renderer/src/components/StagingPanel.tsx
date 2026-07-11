import {
  Minus,
  Plus,
  Undo2,
  Check,
  ListTree,
  List as ListIcon,
  Folder,
  FolderOpen
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FileChange } from '@shared/types'
import { bridge } from '../bridge'
import { useCenterView } from '../centerView'
import { useContextMenu } from '../contextMenu'
import { useIssueLinks } from '../issueLinks'
import { fileContextItems } from '../lib/fileActions'
import { useStore } from '../store'

const TYPE_LETTER: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflicted: '!',
  copied: 'C',
  unknown: '?'
}

type ViewMode = 'tree' | 'path'

interface FileTreeNode {
  name: string
  children: Map<string, FileTreeNode>
  file?: FileChange
}

function buildFileTree(files: FileChange[]): FileTreeNode {
  const root: FileTreeNode = { name: '', children: new Map() }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    parts.forEach((p, i) => {
      let child = node.children.get(p)
      if (!child) {
        child = { name: p, children: new Map() }
        node.children.set(p, child)
      }
      if (i === parts.length - 1) child.file = f
      node = child
    })
  }
  return root
}

export function StagingPanel(): JSX.Element {
  const { repo, status, selectedFile, setSelectedFile, busy, run, notify } = useStore()
  const openMenu = useContextMenu((s) => s.openMenu)
  const issueFor = useIssueLinks((s) => s.issueFor)
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)
  const [view, setView] = useState<ViewMode>('tree')
  // Hooks del repo (para ofrecer --no-verify) y plantilla de commit.
  const [hookCount, setHookCount] = useState(0)
  const [noVerify, setNoVerify] = useState(false)
  const templateApplied = useRef<string | null>(null)

  const repoPath = repo?.path
  useEffect(() => {
    if (!repoPath) return
    let cancelled = false
    setNoVerify(false)
    bridge
      .hooksInfo(repoPath)
      .then((h) => !cancelled && setHookCount(h.hooks.length))
      .catch(() => !cancelled && setHookCount(0))
    // La plantilla precarga el mensaje una vez por repo y solo si está vacío.
    if (templateApplied.current !== repoPath) {
      bridge
        .commitTemplate(repoPath)
        .then((tpl) => {
          if (cancelled || !tpl.trim()) return
          templateApplied.current = repoPath
          setSummary((s) => {
            if (s.trim()) return s
            const [first, ...rest] = tpl.replace(/\r\n/g, '\n').split('\n')
            setDescription((d) => (d.trim() ? d : rest.join('\n').trim()))
            return first.trim()
          })
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [repoPath])

  if (!repo || !status) return <div className="detail-pane" />

  const conflicted = status.conflicted
  const unstaged = status.unstaged
  const staged = status.staged
  const totalStaged = staged.length
  const totalChanges = conflicted.length + unstaged.length + totalStaged
  const branch = status.current || repo.currentBranch
  // Rama creada desde un issue: ofrece añadir «#n» al mensaje.
  const linkedIssue = issueFor(repo.path, branch)

  const commitMessage = (): string =>
    description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim()

  const resetForm = (): void => {
    setSummary('')
    setDescription('')
    setAmend(false)
  }

  const doCommit = (): void => {
    if (!summary.trim()) {
      notify('error', 'Escribe un resumen del commit')
      return
    }
    run('Commit', async () => {
      await bridge.commit(repo.path, commitMessage(), { amend, noVerify })
      resetForm()
      setNoVerify(false)
    })
  }

  const stageAndCommit = (): void => {
    if (!summary.trim()) {
      notify('error', 'Escribe un resumen del commit')
      return
    }
    run('Preparar y confirmar', async () => {
      await bridge.stageAll(repo.path)
      await bridge.commit(repo.path, commitMessage(), { amend, noVerify })
      resetForm()
      setNoVerify(false)
    })
  }

  const fileActions = (f: FileChange): JSX.Element =>
    f.staged ? (
      <button className="icon-btn" title="Quitar de preparado" onClick={() => run('Unstage', () => bridge.unstage(repo.path, [f.path]))}>
        <Minus size={14} />
      </button>
    ) : (
      <>
        <button className="icon-btn" title="Descartar" onClick={() => run('Descartar', () => bridge.discard(repo.path, [f.path]))}>
          <Undo2 size={14} />
        </button>
        <button className="icon-btn" title="Preparar" onClick={() => run('Stage', () => bridge.stage(repo.path, [f.path]))}>
          <Plus size={14} />
        </button>
      </>
    )

  const isActive = (f: FileChange): boolean =>
    !!selectedFile &&
    !selectedFile.commit &&
    selectedFile.path === f.path &&
    !!selectedFile.staged === f.staged

  const conflictMenu = (e: React.MouseEvent, f: FileChange): void => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, [
      {
        label: 'Abrir editor de conflictos',
        onClick: () => setSelectedFile({ path: f.path, conflicted: true })
      },
      { divider: true },
      {
        label: 'Conservar versión actual (ours)',
        onClick: () => run('Conservar ours', () => bridge.keepSide(repo.path, f.path, 'ours'))
      },
      {
        label: 'Conservar versión entrante (theirs)',
        onClick: () => run('Conservar theirs', () => bridge.keepSide(repo.path, f.path, 'theirs'))
      }
    ])
  }

  /** Menú de archivo normal: History/Blame + acciones de sistema. */
  const fileMenu = (e: React.MouseEvent, f: FileChange): void => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, [
      { label: 'Ver cambios', onClick: () => setSelectedFile({ path: f.path, staged: f.staged }) },
      { divider: true },
      {
        label: 'Historial del archivo',
        onClick: () => setSelectedFile({ path: f.path, staged: f.staged, mode: 'history' })
      },
      {
        label: 'Blame',
        onClick: () => setSelectedFile({ path: f.path, staged: f.staged, mode: 'blame' })
      },
      { divider: true },
      ...fileContextItems(repo.path, f.path)
    ])
  }

  const FileRow = ({ f, depth = 0 }: { f: FileChange; depth?: number }): JSX.Element => (
    <div
      className={`file-row${isActive(f) ? ' active' : ''}${f.type === 'conflicted' ? ' conflict' : ''}`}
      style={depth ? { paddingLeft: 14 + depth * 14 } : undefined}
      onClick={() =>
        f.type === 'conflicted'
          ? setSelectedFile({ path: f.path, conflicted: true })
          : setSelectedFile({ path: f.path, staged: f.staged })
      }
      onContextMenu={f.type === 'conflicted' ? (e) => conflictMenu(e, f) : (e) => fileMenu(e, f)}
    >
      <span className={`ftype ${f.type}`}>{TYPE_LETTER[f.type] ?? '?'}</span>
      <span className="path" title={f.path}>
        {view === 'tree' ? f.path.split('/').pop() : f.path}
      </span>
      <span className="file-actions" onClick={(e) => e.stopPropagation()}>
        {f.type !== 'conflicted' && fileActions(f)}
      </span>
    </div>
  )

  const TreeNode = ({
    node,
    depth,
    prefix = ''
  }: {
    node: FileTreeNode
    depth: number
    prefix?: string
  }): JSX.Element => {
    const [open, setOpen] = useState(true)
    if (node.file && node.children.size === 0) {
      return <FileRow f={node.file} depth={depth} />
    }
    const folderPath = prefix ? `${prefix}/${node.name}` : node.name
    return (
      <div>
        {node.name !== '' && (
          <div
            className="file-folder"
            style={{ paddingLeft: 14 + depth * 14 }}
            onClick={() => setOpen(!open)}
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(e.clientX, e.clientY, [
                {
                  label: 'Historial de esta carpeta',
                  onClick: () =>
                    useCenterView
                      .getState()
                      .openHistory({ title: `Historial de ${folderPath}/`, file: folderPath })
                }
              ])
            }}
          >
            {open ? <FolderOpen size={13} /> : <Folder size={13} />}
            <span>{node.name}</span>
          </div>
        )}
        {open &&
          [...node.children.values()]
            .sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.name.localeCompare(b.name))
            .map((c) => (
              <TreeNode
                key={c.name}
                node={c}
                depth={node.name === '' ? depth : depth + 1}
                prefix={node.name === '' ? prefix : folderPath}
              />
            ))}
      </div>
    )
  }

  const renderFiles = (files: FileChange[]): JSX.Element =>
    view === 'path' ? (
      <>
        {files.map((f) => (
          <FileRow key={`${f.staged}-${f.path}`} f={f} />
        ))}
      </>
    ) : (
      <TreeNode node={buildFileTree(files)} depth={0} />
    )

  return (
    <div className="detail-pane">
      <div className="changes-head">
        <span>
          {totalChanges} cambio{totalChanges !== 1 ? 's' : ''} en{' '}
          <span className="branch-pill">{branch}</span>
        </span>
        <div className="seg">
          <button className={view === 'path' ? 'active' : ''} onClick={() => setView('path')}>
            <ListIcon size={13} /> Path
          </button>
          <button className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>
            <ListTree size={13} /> Tree
          </button>
        </div>
      </div>

      <div className="file-list" style={{ flex: 1, maxHeight: 'none' }}>
        {conflicted.length > 0 && (
          <div className="stage-group">
            <div className="group-head conflict-head">En conflicto ({conflicted.length})</div>
            {renderFiles(conflicted)}
          </div>
        )}

        <div className="stage-group">
          <div className="group-head">
            Sin preparar ({unstaged.length})
            {unstaged.length > 0 && (
              <button disabled={busy} onClick={() => run('Stage all', () => bridge.stageAll(repo.path))}>
                Preparar todo
              </button>
            )}
          </div>
          {renderFiles(unstaged)}
        </div>

        <div className="stage-group">
          <div className="group-head">
            Preparado ({totalStaged})
            {totalStaged > 0 && (
              <button disabled={busy} onClick={() => run('Unstage all', () => bridge.unstageAll(repo.path))}>
                Quitar todo
              </button>
            )}
          </div>
          {renderFiles(staged)}
        </div>
      </div>

      <div className="commit-box">
        <input
          className="summary"
          placeholder="Resumen del commit"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <textarea
          placeholder="Descripción (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {linkedIssue != null && !summary.includes(`#${linkedIssue}`) && (
          <button
            className="issue-hint"
            title={`La rama «${branch}» está vinculada al issue #${linkedIssue}; con «Fixes #n» GitHub lo cierra al mergear`}
            onClick={() => setSummary((s) => (s.trim() ? `${s.trim()} (#${linkedIssue})` : `Fixes #${linkedIssue}: `))}
          >
            + Añadir #{linkedIssue} al mensaje
          </button>
        )}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 0', color: 'var(--text-dim)', fontSize: 12 }}
        >
          <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
          Enmendar último commit (amend)
        </label>
        {hookCount > 0 && (
          <label
            title="No ejecuta los hooks pre-commit ni commit-msg en este commit (--no-verify)"
            style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 0', color: 'var(--text-dim)', fontSize: 12 }}
          >
            <input type="checkbox" checked={noVerify} onChange={(e) => setNoVerify(e.target.checked)} />
            Saltar hooks en este commit ({hookCount})
          </label>
        )}

        {totalStaged > 0 ? (
          <button className="btn primary" disabled={busy} onClick={doCommit}>
            <Check size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
            Confirmar {totalStaged} cambio{totalStaged !== 1 ? 's' : ''}
          </button>
        ) : (
          <button className="btn primary" disabled={busy || (unstaged.length === 0 && !amend)} onClick={stageAndCommit}>
            <Check size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
            Preparar y confirmar {unstaged.length > 0 ? `${unstaged.length} cambio${unstaged.length !== 1 ? 's' : ''}` : ''}
          </button>
        )}
      </div>
    </div>
  )
}

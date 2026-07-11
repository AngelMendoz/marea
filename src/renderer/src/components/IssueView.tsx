import {
  CircleDot,
  ExternalLink,
  GitBranch,
  MessageSquarePlus,
  RotateCw,
  X
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Issue, IssueComment } from '@shared/types'
import { bridge } from '../bridge'
import { useCenterView } from '../centerView'
import { useDialog } from '../dialog'
import { suggestBranchName, useIssueLinks } from '../issueLinks'
import { useIssueList } from '../issueList'
import { relativeTime } from '../lib/time'
import { useStore } from '../store'

export function IssueView({ number }: { number: number }): JSX.Element {
  const repo = useStore((s) => s.repo)
  const notify = useStore((s) => s.notify)
  const run = useStore((s) => s.run)
  const close = useCenterView((s) => s.close)
  const { openPrompt } = useDialog()
  const linkedBranch = useIssueLinks((s) => (repo ? (s.links[repo.path]?.[number] ?? null) : null))
  const link = useIssueLinks((s) => s.link)

  const [issue, setIssue] = useState<Issue | null>(null)
  const [comments, setComments] = useState<IssueComment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!repo) return
    setLoading(true)
    setError(null)
    try {
      const [i, c] = await Promise.all([
        bridge.getIssue(repo.path, number),
        bridge.issueComments(repo.path, number)
      ])
      setIssue(i)
      setComments(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el issue')
    } finally {
      setLoading(false)
    }
  }, [repo, number])

  useEffect(() => {
    setIssue(null)
    load()
  }, [load])

  if (!repo) return <div className="prv" />

  const comment = async (): Promise<void> => {
    if (!text.trim()) {
      notify('error', 'Escribe un comentario')
      return
    }
    setBusy(true)
    try {
      await bridge.commentIssue(repo.path, number, text.trim())
      setText('')
      notify('success', 'Comentario publicado ✓')
      await load()
    } catch (e) {
      notify('error', `Comentar: ${e instanceof Error ? e.message : 'error'}`)
    } finally {
      setBusy(false)
    }
  }

  /** «Create a branch for this issue»: nombre prellenado n-titulo, editable,
   *  crea la rama con checkout y guarda el vínculo issue ↔ rama. */
  const createBranch = (): void => {
    if (!issue) return
    openPrompt({
      title: `Crear rama para el issue #${number}`,
      label: 'Nombre de la rama',
      defaultValue: suggestBranchName(number, issue.title),
      confirmText: 'Crear y checkout',
      onConfirm: (name) => {
        const branch = name.trim()
        if (!branch) return
        run(`Rama «${branch}» creada`, async () => {
          await bridge.createBranch(repo.path, branch, { checkout: true })
          link(repo.path, number, branch)
        })
      }
    })
  }

  if (loading && !issue) {
    return (
      <div className="prv">
        <div className="empty">Cargando issue #{number}…</div>
      </div>
    )
  }

  if (error || !issue) {
    return (
      <div className="prv">
        <div className="prv-head">
          <CircleDot size={16} color="var(--accent-green)" />
          <h3>Issue #{number}</h3>
          <button className="icon-btn" onClick={close} title="Cerrar" style={{ marginLeft: 'auto' }}>
            <X size={16} />
          </button>
        </div>
        <div className="empty">{error ?? 'No se pudo cargar el issue'}</div>
      </div>
    )
  }

  const open = issue.state === 'open'

  return (
    <div className="prv">
      <div className="prv-head">
        <CircleDot size={16} color={open ? 'var(--accent-green)' : 'var(--danger)'} />
        <h3 title={issue.title}>
          <span className="prv-number">#{issue.number}</span> {issue.title}
        </h3>
        <span className={`prv-badge ${open ? 'open' : 'closed'}`}>{open ? 'Abierto' : 'Cerrado'}</span>
        <div className="prv-head-actions">
          <button className="icon-btn" title="Recargar" onClick={load} disabled={busy}>
            <RotateCw size={15} />
          </button>
          <button className="icon-btn" title="Abrir en el navegador" onClick={() => bridge.openExternal(issue.url)}>
            <ExternalLink size={15} />
          </button>
          <button className="icon-btn" title="Cerrar vista" onClick={close}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="prv-sub">
        <strong>{issue.author}</strong> abrió este issue
        <span className="prv-when"> · {relativeTime(issue.createdAt)}</span>
        {issue.labels.map((l) => (
          <span key={l.name} className="issue-label" style={{ borderColor: l.color, color: l.color }}>
            <span className="chip-dot" style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
        {issue.assignees.length > 0 && (
          <span className="prv-stats">asignado a {issue.assignees.join(', ')}</span>
        )}
      </div>

      <div className="prv-conv">
        <div className="prv-comments">
          <div className="prv-comment prv-desc">
            <div className="prv-comment-head">
              <strong>{issue.author}</strong>
              <span className="prv-when">{relativeTime(issue.createdAt)}</span>
            </div>
            <div className="prv-comment-body">
              {issue.body.trim() || <em style={{ color: 'var(--text-muted)' }}>Sin descripción.</em>}
            </div>
          </div>
          {comments.map((c) => (
            <div key={c.id} className="prv-comment">
              <div className="prv-comment-head">
                <strong>{c.author}</strong>
                <span className="prv-when">{relativeTime(c.createdAt)}</span>
              </div>
              <div className="prv-comment-body">{c.body}</div>
            </div>
          ))}
        </div>

        <div className="prv-compose">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe un comentario…"
          />
          <div className="prv-actions">
            <button className="btn" disabled={busy || !text.trim()} onClick={comment}>
              <MessageSquarePlus size={14} /> Comentar
            </button>
            <span style={{ flex: 1 }} />
            {linkedBranch ? (
              <button
                className="btn"
                title={`Checkout de «${linkedBranch}»`}
                onClick={() => run('Checkout', () => bridge.checkout(repo.path, linkedBranch))}
              >
                <GitBranch size={14} color="var(--accent-green)" /> {linkedBranch}
              </button>
            ) : (
              <button className="btn primary inline" disabled={busy} onClick={createBranch}>
                <GitBranch size={14} /> Crear rama para este issue
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

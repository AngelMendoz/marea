import {
  Check,
  CheckCircle2,
  ExternalLink,
  FileDiff,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  MessageSquarePlus,
  RotateCw,
  X,
  XCircle
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PRComment, PRFile, PRMergeMethod, PullRequestDetail } from '@shared/types'
import { bridge } from '../bridge'
import { useCenterView } from '../centerView'
import { useContextMenu } from '../contextMenu'
import { useDialog } from '../dialog'
import { parseDiff, type DiffLine } from '../lib/parseDiff'
import { relativeTime } from '../lib/time'
import { usePRList } from '../prList'
import { useStore } from '../store'

const TYPE_LETTER: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  unknown: '?'
}

function stateBadge(pr: PullRequestDetail): { label: string; cls: string } {
  if (pr.merged) return { label: 'Merged', cls: 'merged' }
  if (pr.state === 'closed') return { label: 'Cerrado', cls: 'closed' }
  if (pr.draft) return { label: 'Borrador', cls: 'draft' }
  return { label: 'Abierto', cls: 'open' }
}

/** Objetivo de un comentario en línea: archivo + línea + lado del diff. */
interface InlineTarget {
  path: string
  line: number
  side: 'LEFT' | 'RIGHT'
  /** Índice de la línea dentro del diff parseado (para anclar el formulario). */
  index: number
}

function CommentCard({ c }: { c: PRComment }): JSX.Element {
  const head =
    c.kind === 'review' && c.state === 'APPROVED' ? (
      <span className="prv-review ok">
        <CheckCircle2 size={14} /> aprobó estos cambios
      </span>
    ) : c.kind === 'review' && c.state === 'CHANGES_REQUESTED' ? (
      <span className="prv-review bad">
        <XCircle size={14} /> solicitó cambios
      </span>
    ) : c.kind === 'inline' ? (
      <span className="prv-review inline-ref" title={c.path}>
        <MessageSquare size={13} /> {c.path?.split('/').pop()}
        {c.line != null ? `:${c.line}` : ''}
      </span>
    ) : null

  return (
    <div className="prv-comment">
      <div className="prv-comment-head">
        <strong>{c.author}</strong>
        {head}
        <span className="prv-when">{relativeTime(c.createdAt)}</span>
      </div>
      {c.body.trim() && <div className="prv-comment-body">{c.body}</div>}
    </div>
  )
}

function FileDiffView({
  file,
  comments,
  onInlineComment
}: {
  file: PRFile
  comments: PRComment[]
  onInlineComment: (target: InlineTarget, body: string) => Promise<void>
}): JSX.Element {
  const [target, setTarget] = useState<InlineTarget | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const lines = useMemo(() => (file.patch ? parseDiff(file.patch) : []), [file.patch])
  const inline = useMemo(
    () => comments.filter((c) => c.kind === 'inline' && c.path === file.path),
    [comments, file.path]
  )

  if (!file.patch) {
    return <div className="empty">Sin diff disponible para este archivo</div>
  }

  const openForm = (l: DiffLine, index: number): void => {
    const side: 'LEFT' | 'RIGHT' = l.kind === 'del' ? 'LEFT' : 'RIGHT'
    const line = side === 'LEFT' ? l.oldNo : l.newNo
    if (line == null) return
    setTarget({ path: file.path, line, side, index })
    setText('')
  }

  const submit = async (): Promise<void> => {
    if (!target || !text.trim()) return
    setSending(true)
    try {
      await onInlineComment(target, text.trim())
      setTarget(null)
      setText('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="diff prv-diff">
      {lines.map((l, i) => {
        if (l.kind === 'meta') return null
        const cls = l.kind === 'add' ? 'add' : l.kind === 'del' ? 'del' : l.kind === 'hunk' ? 'hunk' : ''
        const commentable = l.kind !== 'hunk'
        // El lado del comentario decide contra qué numeración se compara
        // (LEFT = línea del archivo viejo, RIGHT = del nuevo).
        const lineComments = inline.filter((c) => {
          if (c.line == null) return false
          if (c.side === 'LEFT') return l.kind !== 'add' && c.line === l.oldNo
          return l.kind !== 'del' && c.line === l.newNo
        })
        return (
          <div key={i}>
            <div className={`diff-line ${cls}`}>
              <span className="gutter">{l.kind === 'hunk' ? '' : (l.oldNo ?? '')}</span>
              <span className="gutter">{l.kind === 'hunk' ? '' : (l.newNo ?? '')}</span>
              {commentable ? (
                <button
                  className="prv-line-add"
                  title="Comentar esta línea"
                  onClick={() => openForm(l, i)}
                >
                  +
                </button>
              ) : (
                <span className="prv-line-add spacer" />
              )}
              <span className="content">
                {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : l.kind === 'hunk' ? '' : ' '}
                {l.text}
              </span>
            </div>
            {lineComments.map((c) => (
              <div key={c.id} className="prv-inline-thread">
                <CommentCard c={c} />
              </div>
            ))}
            {target?.index === i && (
              <div className="prv-inline-form">
                <textarea
                  autoFocus
                  value={text}
                  placeholder={`Comentario en ${file.path.split('/').pop()}:${target.line}`}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="prv-inline-actions">
                  <button className="btn" onClick={() => setTarget(null)}>
                    Cancelar
                  </button>
                  <button className="btn primary inline" disabled={!text.trim() || sending} onClick={submit}>
                    {sending ? 'Enviando…' : 'Comentar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function PullRequestView({ number }: { number: number }): JSX.Element {
  const repo = useStore((s) => s.repo)
  const notify = useStore((s) => s.notify)
  const run = useStore((s) => s.run)
  const close = useCenterView((s) => s.close)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openConfirm } = useDialog()

  const [detail, setDetail] = useState<PullRequestDetail | null>(null)
  const [files, setFiles] = useState<PRFile[]>([])
  const [comments, setComments] = useState<PRComment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'conv' | 'files'>('conv')
  const [activePath, setActivePath] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!repo) return
    setLoading(true)
    setError(null)
    try {
      const [d, f, c] = await Promise.all([
        bridge.getPullRequest(repo.path, number),
        bridge.prFiles(repo.path, number),
        bridge.prComments(repo.path, number)
      ])
      setDetail(d)
      setFiles(f)
      setComments(c)
      setActivePath((prev) => prev ?? f[0]?.path ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el PR')
    } finally {
      setLoading(false)
    }
  }, [repo, number])

  useEffect(() => {
    setDetail(null)
    setActivePath(null)
    setTab('conv')
    load()
  }, [load])

  if (!repo) return <div className="prv" />

  /** Acción sobre el PR con toast + recarga del detalle y de la lista lateral. */
  const act = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
      notify('success', `${label} ✓`)
      await load()
      usePRList.getState().load(repo.path)
    } catch (e) {
      notify('error', `${label}: ${e instanceof Error ? e.message : 'error'}`)
    } finally {
      setBusy(false)
    }
  }

  const comment = (): void => {
    if (!text.trim()) {
      notify('error', 'Escribe un comentario')
      return
    }
    act('Comentario publicado', async () => {
      await bridge.commentPullRequest(repo.path, number, text.trim())
      setText('')
    })
  }

  const review = (event: 'APPROVE' | 'REQUEST_CHANGES'): void => {
    if (event === 'REQUEST_CHANGES' && !text.trim()) {
      notify('error', 'Explica qué cambios se necesitan (GitHub exige un comentario)')
      return
    }
    act(event === 'APPROVE' ? 'PR aprobado' : 'Cambios solicitados', async () => {
      await bridge.reviewPullRequest(repo.path, number, event, text.trim() || undefined)
      setText('')
    })
  }

  const mergeMenu = (e: React.MouseEvent): void => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const doMerge = (method: PRMergeMethod, label: string): void => {
      openConfirm({
        title: 'Merge pull request',
        message: `¿${label} de «${detail?.head}» en «${detail?.base}»?`,
        confirmText: 'Merge',
        onConfirm: () =>
          run(`Merge del PR #${number}`, async () => {
            await bridge.mergePullRequest(repo.path, number, method)
            await load()
            usePRList.getState().load(repo.path)
          })
      })
    }
    openMenu(rect.left, rect.bottom + 4, [
      { label: 'Crear un merge commit', onClick: () => doMerge('merge', 'Merge commit') },
      { label: 'Squash y merge', onClick: () => doMerge('squash', 'Squash merge') },
      { label: 'Rebase y merge', onClick: () => doMerge('rebase', 'Rebase merge') }
    ])
  }

  const closePR = (): void => {
    openConfirm({
      title: 'Cerrar pull request',
      message: `¿Cerrar el PR #${number} sin hacer merge?`,
      danger: true,
      confirmText: 'Cerrar PR',
      onConfirm: () =>
        act('PR cerrado', () => bridge.closePullRequest(repo.path, number))
    })
  }

  const inlineComment = async (target: InlineTarget, body: string): Promise<void> => {
    if (!detail) return
    await act('Comentario en línea publicado', () =>
      bridge.inlineCommentPullRequest(
        repo.path,
        number,
        { path: target.path, line: target.line, side: target.side, body },
        detail.headSha
      )
    )
  }

  if (loading && !detail) {
    return (
      <div className="prv">
        <div className="empty">Cargando PR #{number}…</div>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="prv">
        <div className="prv-head">
          <GitPullRequest size={16} color="var(--accent)" />
          <h3>PR #{number}</h3>
          <button className="icon-btn" onClick={close} title="Cerrar" style={{ marginLeft: 'auto' }}>
            <X size={16} />
          </button>
        </div>
        <div className="empty">{error ?? 'No se pudo cargar el PR'}</div>
      </div>
    )
  }

  const badge = stateBadge(detail)
  const canMerge = !detail.merged && detail.state === 'open' && !detail.draft
  const activeFile = files.find((f) => f.path === activePath) ?? null

  return (
    <div className="prv">
      <div className="prv-head">
        <GitPullRequest
          size={16}
          color={detail.merged ? 'var(--accent)' : detail.state === 'open' ? 'var(--accent-green)' : 'var(--danger)'}
        />
        <h3 title={detail.title}>
          <span className="prv-number">#{detail.number}</span> {detail.title}
        </h3>
        <span className={`prv-badge ${badge.cls}`}>{badge.label}</span>
        <div className="prv-head-actions">
          <button className="icon-btn" title="Recargar" onClick={load} disabled={busy}>
            <RotateCw size={15} />
          </button>
          <button className="icon-btn" title="Abrir en GitHub" onClick={() => bridge.openExternal(detail.url)}>
            <ExternalLink size={15} />
          </button>
          <button className="icon-btn" title="Cerrar vista" onClick={close}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="prv-sub">
        <strong>{detail.author}</strong> quiere fusionar{' '}
        {/* En PRs de forks el title muestra la etiqueta completa owner:rama. */}
        <code title={detail.headLabel || detail.head}>{detail.head}</code> → <code>{detail.base}</code>
        <span className="prv-when"> · {relativeTime(detail.createdAt)}</span>
        <span className="prv-stats">
          <span className="add">+{detail.additions}</span> <span className="del">−{detail.deletions}</span> ·{' '}
          {detail.changedFiles} archivos
        </span>
      </div>

      <div className="pr-tabs prv-tabs">
        <button className={`pr-tab${tab === 'conv' ? ' active' : ''}`} onClick={() => setTab('conv')}>
          <MessageSquare size={13} /> Conversación ({comments.length})
        </button>
        <button className={`pr-tab${tab === 'files' ? ' active' : ''}`} onClick={() => setTab('files')}>
          <FileDiff size={13} /> Archivos ({files.length})
        </button>
      </div>

      {tab === 'conv' ? (
        <div className="prv-conv">
          <div className="prv-comments">
            <div className="prv-comment prv-desc">
              <div className="prv-comment-head">
                <strong>{detail.author}</strong>
                <span className="prv-when">{relativeTime(detail.createdAt)}</span>
              </div>
              <div className="prv-comment-body">
                {detail.body.trim() || <em style={{ color: 'var(--text-muted)' }}>Sin descripción.</em>}
              </div>
            </div>
            {comments.map((c) => (
              <CommentCard key={`${c.kind}-${c.id}`} c={c} />
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
              <button className="btn approve" disabled={busy || detail.state !== 'open'} onClick={() => review('APPROVE')}>
                <Check size={14} /> Aprobar
              </button>
              <button
                className="btn danger"
                disabled={busy || detail.state !== 'open'}
                onClick={() => review('REQUEST_CHANGES')}
              >
                <XCircle size={14} /> Solicitar cambios
              </button>
              <span style={{ flex: 1 }} />
              <button
                className="btn danger"
                disabled={busy || detail.merged || detail.state !== 'open'}
                onClick={closePR}
              >
                Cerrar PR
              </button>
              <button
                className="btn primary inline"
                disabled={busy || !canMerge || detail.mergeable === false}
                title={
                  detail.draft
                    ? 'Los borradores no se pueden mergear'
                    : detail.mergeable === false
                      ? 'Hay conflictos con la rama base'
                      : 'Merge pull request'
                }
                onClick={mergeMenu}
              >
                <GitMerge size={14} /> Merge ▾
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="prv-files">
          <div className="prv-file-list">
            {files.map((f) => (
              <div
                key={f.path}
                className={`prv-file${f.path === activePath ? ' active' : ''}`}
                onClick={() => setActivePath(f.path)}
                title={f.previousPath ? `${f.previousPath} → ${f.path}` : f.path}
              >
                <span className={`ftype ${f.type}`}>{TYPE_LETTER[f.type] ?? '?'}</span>
                <span className="prv-file-name">{f.path}</span>
                <span className="prv-file-stats">
                  <span className="add">+{f.additions}</span> <span className="del">−{f.deletions}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="prv-file-diff">
            {activeFile ? (
              <FileDiffView file={activeFile} comments={comments} onInlineComment={inlineComment} />
            ) : (
              <div className="empty">Selecciona un archivo</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

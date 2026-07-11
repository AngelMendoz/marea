import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CommitFile, SignatureInfo } from '@shared/types'
import { bridge } from '../bridge'
import { useContextMenu } from '../contextMenu'
import { authorColor } from '../lib/avatar'
import { fileContextItems } from '../lib/fileActions'
import { fullDate, initials } from '../lib/time'
import { findCommit, useStore } from '../store'

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

/** Texto y severidad por código %G? de git. */
const SIG_LABEL: Record<string, { text: string; kind: 'ok' | 'warn' | 'bad' }> = {
  G: { text: 'Firma verificada', kind: 'ok' },
  U: { text: 'Firma buena (confianza desconocida)', kind: 'ok' },
  X: { text: 'Firma buena pero expirada', kind: 'warn' },
  Y: { text: 'Firmada con clave expirada', kind: 'warn' },
  E: { text: 'Firma no verificable', kind: 'warn' },
  R: { text: 'Firmada con clave revocada', kind: 'bad' },
  B: { text: 'Firma inválida', kind: 'bad' }
}

/** Insignia de firma del commit: verificada / advertencia / inválida. */
function SignatureBadge({ sig }: { sig: SignatureInfo }): JSX.Element | null {
  const label = SIG_LABEL[sig.code]
  if (!label) return null // 'N' = sin firma: no se muestra nada
  const Icon = label.kind === 'ok' ? ShieldCheck : label.kind === 'warn' ? ShieldAlert : ShieldX
  const detail = [sig.signer && `Firmante: ${sig.signer}`, sig.key && `Clave: ${sig.key}`]
    .filter(Boolean)
    .join('\n')
  return (
    <span className={`sig-badge ${label.kind}`} title={detail || label.text}>
      <Icon size={13} />
      {label.text}
    </span>
  )
}

export function CommitDetail({ hash }: { hash: string }): JSX.Element {
  const { repo, log, selectedFile, setSelectedFile } = useStore()
  const openMenu = useContextMenu((s) => s.openMenu)
  const commit = findCommit(log, hash)
  const [files, setFiles] = useState<CommitFile[]>([])
  const [sig, setSig] = useState<SignatureInfo | null>(null)

  useEffect(() => {
    if (!repo) return
    setSig(null)
    bridge.commitFiles(repo.path, hash).then(setFiles)
    bridge
      .commitSignature(repo.path, hash)
      .then(setSig)
      .catch(() => setSig(null))
  }, [repo, hash])

  if (!commit) return <div className="detail-pane" />

  return (
    <div className="detail-pane">
      <div className="detail-head">
        <div className="msg">{commit.subject}</div>
        <div className="detail-meta">
          <span
            className="avatar"
            style={{ background: authorColor(commit.authorEmail || commit.authorName), color: '#fff' }}
          >
            {initials(commit.authorName)}
          </span>
          <span>{commit.authorName}</span>
          <span>·</span>
          <span>{fullDate(commit.date)}</span>
        </div>
        <div className="detail-meta" style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11.5 }}>
          <span>commit {commit.hash.slice(0, 12)}</span>
          {commit.parents.length > 1 && <span>· merge de {commit.parents.length} padres</span>}
        </div>
        {sig && SIG_LABEL[sig.code] && (
          <div className="detail-meta" style={{ marginTop: 6 }}>
            <SignatureBadge sig={sig} />
          </div>
        )}
      </div>

      <div className="file-list" style={{ flex: 1, maxHeight: 'none' }}>
        <div
          className="group-head"
          style={{ display: 'flex', padding: '6px 14px', background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}
        >
          {files.length} archivo{files.length !== 1 ? 's' : ''} cambiado{files.length !== 1 ? 's' : ''}
        </div>
        {files.map((f) => {
          const active = selectedFile?.commit === hash && selectedFile.path === f.path
          return (
            <div
              key={f.path}
              className={`file-row${active ? ' active' : ''}`}
              onClick={() => setSelectedFile({ path: f.path, commit: hash })}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(e.clientX, e.clientY, [
                  { label: 'Ver cambios', onClick: () => setSelectedFile({ path: f.path, commit: hash }) },
                  { divider: true },
                  {
                    label: 'Historial del archivo desde esta revisión',
                    onClick: () => setSelectedFile({ path: f.path, commit: hash, mode: 'history' })
                  },
                  {
                    label: 'Blame en esta revisión',
                    onClick: () => setSelectedFile({ path: f.path, commit: hash, mode: 'blame' })
                  },
                  { divider: true },
                  ...(repo ? fileContextItems(repo.path, f.path) : [])
                ])
              }}
            >
              <span className={`ftype ${f.type}`}>{TYPE_LETTER[f.type] ?? '?'}</span>
              <span className="path" title={f.path}>
                {f.path}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

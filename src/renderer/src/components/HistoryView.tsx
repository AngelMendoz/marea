import { FileClock, Locate, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FileHistoryEntry } from '@shared/types'
import { bridge } from '../bridge'
import { useCenterView, type HistorySpec } from '../centerView'
import { useContextMenu } from '../contextMenu'
import { relativeTime } from '../lib/time'
import { useStore } from '../store'

/** Historial filtrado por carpeta, tag o rama. Al elegir un commit
 *  se selecciona en el panel derecho (detalle con sus archivos). */
export function HistoryView({ spec }: { spec: HistorySpec }): JSX.Element {
  const repo = useStore((s) => s.repo)
  const selHash = useStore((s) => (s.selection?.kind === 'commit' ? s.selection.hash : null))
  const setSelection = useStore((s) => s.setSelection)
  const jumpToCommit = useStore((s) => s.jumpToCommit)
  const run = useStore((s) => s.run)
  const close = useCenterView((s) => s.close)
  const openCompare = useCenterView((s) => s.openCompare)
  const openMenu = useContextMenu((s) => s.openMenu)
  const [entries, setEntries] = useState<FileHistoryEntry[] | null>(null)
  const [error, setError] = useState('')

  const path = repo?.path

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setEntries(null)
    setError('')
    bridge
      .fileHistory(path, { file: spec.file, ref: spec.ref, follow: spec.follow })
      .then((e) => !cancelled && setEntries(e))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [path, spec])

  const menu = (e: React.MouseEvent, entry: FileHistoryEntry): void => {
    e.preventDefault()
    if (!repo) return
    const c = entry.commit
    openMenu(e.clientX, e.clientY, [
      { label: 'Ver en el grafo', onClick: () => jumpToCommit(c.hash) },
      {
        label: 'Comparar con HEAD',
        onClick: () => openCompare({ a: c.hash, b: 'HEAD', aLabel: c.shortHash, bLabel: 'HEAD' })
      },
      { divider: true },
      { label: 'Checkout este commit', onClick: () => run('Checkout', () => bridge.checkout(repo.path, c.hash)) }
    ])
  }

  return (
    <div className="compare-view">
      <div className="compare-head">
        <FileClock size={15} color="var(--accent)" />
        <span className="cmp-ref" title={spec.file ?? spec.ref}>
          {spec.title}
        </span>
        <span className="hist-count">
          {entries ? `${entries.length} commit${entries.length !== 1 ? 's' : ''}` : ''}
        </span>
        <div className="dph-tools">
          <button className="mini icon" title="Cerrar historial" onClick={close}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="compare-body">
        {error && <div className="empty">Error al cargar el historial: {error}</div>}
        {!error && entries === null && <div className="empty">Cargando historial…</div>}
        {entries && entries.length === 0 && <div className="empty">Sin commits para este filtro.</div>}
        {entries?.map((entry) => {
          const c = entry.commit
          return (
            <div
              key={c.hash}
              className={`hist-row${selHash === c.hash ? ' selected' : ''}`}
              onClick={() => setSelection({ kind: 'commit', hash: c.hash })}
              onContextMenu={(e) => menu(e, entry)}
              title={spec.follow && entry.path && spec.file !== entry.path ? `Entonces: ${entry.path}` : undefined}
            >
              <span className="subject">{c.subject}</span>
              <span className="author">{c.authorName}</span>
              <span className="sha">{c.shortHash}</span>
              <span className="date">{relativeTime(c.date)}</span>
              <button
                className="mini icon"
                title="Ver en el grafo"
                onClick={(e) => {
                  e.stopPropagation()
                  jumpToCommit(c.hash)
                }}
              >
                <Locate size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { memo, useMemo } from 'react'
import { parseDiff, type DiffLine } from '../lib/parseDiff'
import { clipLine, LazyRows } from './LazyRows'

function renderLine(l: DiffLine): JSX.Element {
  const cls = l.kind === 'add' ? 'add' : l.kind === 'del' ? 'del' : l.kind === 'hunk' ? 'hunk' : ''
  return (
    <div className={`diff-line ${cls}`}>
      <span className="gutter">{l.kind === 'hunk' ? '' : (l.oldNo ?? '')}</span>
      <span className="gutter">{l.kind === 'hunk' ? '' : (l.newNo ?? '')}</span>
      <span className="content">
        {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : l.kind === 'hunk' ? '' : ' '}
        {clipLine(l.text)}
      </span>
    </div>
  )
}

/** Diff unificado. Memoizado: solo se re-renderiza si cambia el texto del diff
 *  (no con cada actualización del store), y pinta las líneas progresivamente. */
export const DiffViewer = memo(function DiffViewer({ diff }: { diff: string }): JSX.Element {
  const lines = useMemo(() => parseDiff(diff).filter((l) => l.kind !== 'meta'), [diff])

  if (!diff.trim()) {
    return <div className="empty">Sin cambios para mostrar</div>
  }

  return (
    <div className="diff">
      <LazyRows items={lines} renderRow={renderLine} />
    </div>
  )
})

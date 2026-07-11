import { useMemo } from 'react'
import { parseDiff } from '../lib/parseDiff'

export function DiffViewer({ diff }: { diff: string }): JSX.Element {
  const lines = useMemo(() => parseDiff(diff), [diff])

  if (!diff.trim()) {
    return <div className="empty">Sin cambios para mostrar</div>
  }

  return (
    <div className="diff">
      {lines.map((l, i) => {
        if (l.kind === 'meta') return null
        const cls =
          l.kind === 'add' ? 'add' : l.kind === 'del' ? 'del' : l.kind === 'hunk' ? 'hunk' : ''
        return (
          <div key={i} className={`diff-line ${cls}`}>
            <span className="gutter">{l.kind === 'hunk' ? '' : (l.oldNo ?? '')}</span>
            <span className="gutter">{l.kind === 'hunk' ? '' : (l.newNo ?? '')}</span>
            <span className="content">
              {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : l.kind === 'hunk' ? '' : ' '}
              {l.text}
            </span>
          </div>
        )
      })}
    </div>
  )
}

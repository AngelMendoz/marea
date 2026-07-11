import { useEffect, useMemo, useState } from 'react'
import type { BlameLine } from '@shared/types'
import { bridge } from '../bridge'
import { relativeTime } from '../lib/time'
import { useStore } from '../store'

const UNCOMMITTED = '0000000000000000000000000000000000000000'

/** Paleta compartida con el grafo para colorear commits del blame. */
const COLORS = ['#4aa3ff', '#5bc873', '#e2b93d', '#e2607b', '#9b7bd6', '#1fb6d6', '#e08b4e', '#6fce9e']

function colorFor(hash: string): string {
  let h = 0
  for (let i = 0; i < 12; i++) h = (h * 31 + hash.charCodeAt(i)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

/** Vista Blame: cada línea anotada con el commit/autor que la
 *  introdujo; clic en la anotación salta a ese commit en el grafo. */
export function BlameView({ file, commit }: { file: string; commit?: string }): JSX.Element {
  const repo = useStore((s) => s.repo)
  const jumpToCommit = useStore((s) => s.jumpToCommit)
  const [lines, setLines] = useState<BlameLine[] | null>(null)
  const [error, setError] = useState('')

  const path = repo?.path

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setLines(null)
    setError('')
    bridge
      .blame(path, file, commit)
      .then((l) => !cancelled && setLines(l))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [path, file, commit])

  // Inicio de cada bloque contiguo del mismo commit (la anotación se muestra
  // solo ahí, como en otros clientes, para no repetirla línea a línea).
  const blockStart = useMemo(() => {
    if (!lines) return new Set<number>()
    const starts = new Set<number>()
    for (let i = 0; i < lines.length; i++) {
      if (i === 0 || lines[i].hash !== lines[i - 1].hash) starts.add(i)
    }
    return starts
  }, [lines])

  if (error) return <div className="empty">No se pudo calcular el blame: {error}</div>
  if (lines === null) return <div className="empty">Calculando blame…</div>
  if (lines.length === 0) return <div className="empty">Archivo vacío o sin contenido rastreado.</div>

  return (
    <div className="diff blame">
      {lines.map((l, i) => {
        const uncommitted = l.hash === UNCOMMITTED
        const isStart = blockStart.has(i)
        return (
          <div
            key={i}
            className={`diff-line blame-line${isStart ? ' block-start' : ''}`}
            style={{ ['--blame-color' as string]: uncommitted ? 'var(--text-muted)' : colorFor(l.hash) }}
          >
            <span
              className={`blame-info${uncommitted ? ' uncommitted' : ''}`}
              title={
                uncommitted
                  ? 'Cambios sin commitear'
                  : `${l.summary}\n${l.author} · ${relativeTime(l.date)}\nClic para ver el commit en el grafo`
              }
              onClick={() => !uncommitted && jumpToCommit(l.hash)}
            >
              {isStart && (
                <>
                  <span className="ba">{uncommitted ? 'Sin commitear' : l.author}</span>
                  <span className="bh">{uncommitted ? '' : l.shortHash}</span>
                  <span className="bd">{uncommitted ? '' : relativeTime(l.date)}</span>
                </>
              )}
            </span>
            <span className="gutter">{l.lineNo}</span>
            <span className="content"> {l.text}</span>
          </div>
        )
      })}
    </div>
  )
}

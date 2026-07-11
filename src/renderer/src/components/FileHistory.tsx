import { useEffect, useMemo, useState } from 'react'
import type { FileHistoryEntry } from '@shared/types'
import { bridge } from '../bridge'
import { useContextMenu } from '../contextMenu'
import { useDialog } from '../dialog'
import { relativeTime } from '../lib/time'
import { useStore } from '../store'
import { DiffViewer } from './DiffViewer'

/** Historial de un archivo (botón History del diff): lista de
 *  commits que lo tocaron (siguiendo renombres) + diff/contenido de cada
 *  versión, con comparar, abrir y restaurar versiones antiguas. */
export function FileHistory({ file, commit }: { file: string; commit?: string }): JSX.Element {
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const jumpToCommit = useStore((s) => s.jumpToCommit)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openConfirm } = useDialog()
  const [entries, setEntries] = useState<FileHistoryEntry[] | null>(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(0)
  /** Segunda revisión elegida con Ctrl+clic (comparación entre versiones). */
  const [compareWith, setCompareWith] = useState<number | null>(null)
  /** Compara la revisión seleccionada contra el working tree. */
  const [vsWorking, setVsWorking] = useState(false)
  const [view, setView] = useState<'diff' | 'file'>('diff')
  const [content, setContent] = useState<string | null>(null)

  const path = repo?.path

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setEntries(null)
    setError('')
    setSel(0)
    setCompareWith(null)
    setVsWorking(false)
    bridge
      .fileHistory(path, { file, follow: true, ref: commit })
      .then((e) => !cancelled && setEntries(e))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [path, file, commit])

  const selected = entries?.[sel]
  const other = compareWith != null ? entries?.[compareWith] : undefined

  // Contenido del panel derecho: diff del commit, diff entre dos revisiones,
  // diff contra el working tree, o el archivo completo de esa versión.
  useEffect(() => {
    if (!path || !selected) return
    let cancelled = false
    setContent(null)
    const load =
      view === 'file'
        ? bridge.fileContent(path, { file: selected.path, commit: selected.commit.hash })
        : vsWorking
          ? bridge.diffRefs(path, { a: selected.commit.hash, file: selected.path })
          : other
            ? // Entre dos revisiones: la más antigua como base.
              bridge.diffRefs(path, {
                a: (other.commit.date <= selected.commit.date ? other : selected).commit.hash,
                b: (other.commit.date <= selected.commit.date ? selected : other).commit.hash,
                file: selected.path
              })
            : bridge.diff(path, { file: selected.path, commit: selected.commit.hash })
    load.then((c) => !cancelled && setContent(c)).catch(() => !cancelled && setContent(''))
    return () => {
      cancelled = true
    }
  }, [path, selected, other, view, vsWorking])

  const lines = useMemo(() => (view === 'file' ? (content ?? '').split('\n') : []), [view, content])

  const restore = (entry: FileHistoryEntry): void => {
    if (!path) return
    const renamed = entry.path !== file ? ` (se recreará como «${entry.path}»)` : ''
    openConfirm({
      title: 'Restaurar versión antigua',
      message: `El working tree recibirá la versión de «${entry.path}» del commit ${entry.commit.shortHash}${renamed}. Los cambios actuales del archivo se perderán.`,
      danger: true,
      confirmText: 'Restaurar',
      onConfirm: () =>
        run('Versión restaurada', () => bridge.restoreFileVersion(path, entry.path, entry.commit.hash))
    })
  }

  const menu = (e: React.MouseEvent, idx: number): void => {
    e.preventDefault()
    const entry = entries?.[idx]
    if (!entry) return
    openMenu(e.clientX, e.clientY, [
      {
        label: 'Comparar con el working tree',
        onClick: () => {
          setSel(idx)
          setCompareWith(null)
          setVsWorking(true)
          setView('diff')
        }
      },
      {
        label: 'Comparar con la revisión seleccionada',
        disabled: idx === sel,
        onClick: () => {
          setCompareWith(idx)
          setVsWorking(false)
          setView('diff')
        }
      },
      { divider: true },
      {
        label: 'Abrir esta versión (archivo completo)',
        onClick: () => {
          setSel(idx)
          setCompareWith(null)
          setVsWorking(false)
          setView('file')
        }
      },
      { label: 'Restaurar esta versión al working tree…', danger: true, onClick: () => restore(entry) },
      { divider: true },
      { label: 'Ver en el grafo', onClick: () => jumpToCommit(entry.commit.hash) }
    ])
  }

  if (error) return <div className="empty">Error al cargar el historial: {error}</div>
  if (entries === null) return <div className="empty">Cargando historial del archivo…</div>
  if (entries.length === 0) return <div className="empty">El archivo no tiene commits todavía.</div>

  return (
    <div className="fh-wrap">
      <div className="fh-list">
        {entries.map((entry, i) => {
          const c = entry.commit
          return (
            <div
              key={c.hash}
              className={`fh-row${i === sel ? ' selected' : ''}${i === compareWith ? ' compare' : ''}`}
              title={`${c.subject}\n${c.authorName} · ${relativeTime(c.date)}${
                entry.path !== file ? `\nEntonces: ${entry.path}` : ''
              }\nCtrl+clic: comparar con la revisión seleccionada`}
              onClick={(e) => {
                if ((e.ctrlKey || e.metaKey) && i !== sel) {
                  setCompareWith((prev) => (prev === i ? null : i))
                  setVsWorking(false)
                  setView('diff')
                  return
                }
                setSel(i)
                setCompareWith(null)
                setVsWorking(false)
              }}
              onContextMenu={(e) => menu(e, i)}
            >
              <span className="subject">{c.subject}</span>
              <span className="meta">
                {c.authorName} · {c.shortHash} · {relativeTime(c.date)}
                {entry.path !== file && <span className="renamed"> · {entry.path}</span>}
              </span>
            </div>
          )
        })}
      </div>

      <div className="fh-detail">
        <div className="fh-detail-head">
          <span className="fh-what">
            {vsWorking && view === 'diff'
              ? `${selected?.commit.shortHash} ↔ Working tree`
              : other && view === 'diff'
                ? `${other.commit.shortHash} ↔ ${selected?.commit.shortHash}`
                : `Versión de ${selected?.commit.shortHash}`}
          </span>
          <div className="seg small">
            <button className={view === 'diff' ? 'active' : ''} onClick={() => setView('diff')}>
              Diff
            </button>
            <button
              className={view === 'file' ? 'active' : ''}
              onClick={() => {
                setView('file')
                setCompareWith(null)
              }}
            >
              Archivo
            </button>
          </div>
        </div>
        {content === null ? (
          <div className="empty small">Cargando…</div>
        ) : view === 'file' ? (
          <div className="diff">
            {lines.map((l, i) => (
              <div key={i} className="diff-line">
                <span className="gutter">{i + 1}</span>
                <span className="content"> {l}</span>
              </div>
            ))}
          </div>
        ) : (
          <DiffViewer diff={content} />
        )}
      </div>
    </div>
  )
}

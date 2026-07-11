import {
  Columns2,
  AlignLeft,
  Rows3,
  X,
  FileText,
  FileCode2,
  History,
  Pencil,
  ChevronUp,
  ChevronDown,
  Users,
  WrapText,
  Check,
  Plus,
  Minus,
  Undo2
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { bridge } from '../bridge'
import { useDialog } from '../dialog'
import { buildLinePatch, parseDiff, splitHunks, toSplitRows, type Hunk } from '../lib/parseDiff'
import { useStore } from '../store'
import { BlameView } from './BlameView'
import { DiffViewer } from './DiffViewer'
import { FileHistory } from './FileHistory'

type Layout = 'hunk' | 'inline' | 'split'
type ViewMode = 'diff' | 'file' | 'history' | 'blame'
type Side = 'unstaged' | 'staged'

function SplitDiff({ diff }: { diff: string }): JSX.Element {
  const rows = useMemo(() => toSplitRows(parseDiff(diff)), [diff])
  if (!diff.trim()) return <div className="empty">Sin cambios para mostrar</div>
  return (
    <div className="diff split">
      {rows.map((r, i) =>
        r.hunk ? (
          <div key={i} className="split-row hunk">
            <div className="side full">{r.hunk}</div>
          </div>
        ) : (
          <div key={i} className="split-row">
            <div className={`side ${r.left ? r.left.kind : 'empty'}`}>
              <span className="gutter">{r.left?.no ?? ''}</span>
              <span className="content">{r.left?.text ?? ''}</span>
            </div>
            <div className={`side ${r.right ? r.right.kind : 'empty'}`}>
              <span className="gutter">{r.right?.no ?? ''}</span>
              <span className="content">{r.right?.text ?? ''}</span>
            </div>
          </div>
        )
      )}
    </div>
  )
}

/** Selección de líneas dentro de un hunk (stage/descarte por línea). */
interface LineSel {
  hunk: number
  lines: number[]
  anchor: number
}

function HunkView({
  diff,
  side,
  readOnly,
  onStage,
  onUnstage,
  onDiscard,
  onStageLines,
  onUnstageLines,
  onDiscardLines
}: {
  diff: string
  side: Side
  readOnly?: boolean
  onStage: (h: Hunk) => void
  onUnstage: (h: Hunk) => void
  onDiscard: (h: Hunk) => void
  onStageLines: (h: Hunk, lines: number[]) => void
  onUnstageLines: (h: Hunk, lines: number[]) => void
  onDiscardLines: (h: Hunk, lines: number[]) => void
}): JSX.Element {
  const hunks = useMemo(() => splitHunks(diff), [diff])
  const [sel, setSel] = useState<LineSel | null>(null)

  // La selección se descarta si el diff cambia (stage aplicado, edición, etc.).
  useEffect(() => setSel(null), [diff])

  const clickLine = (e: React.MouseEvent, hunkIdx: number, lineIdx: number, kind: string): void => {
    if (readOnly || (kind !== 'add' && kind !== 'del')) return
    setSel((prev) => {
      // Shift+clic: rango desde el ancla (solo líneas de cambio del mismo hunk).
      if (e.shiftKey && prev && prev.hunk === hunkIdx) {
        const [lo, hi] = prev.anchor < lineIdx ? [prev.anchor, lineIdx] : [lineIdx, prev.anchor]
        const lines: number[] = []
        hunks[hunkIdx].lines.forEach((l, j) => {
          if (j >= lo && j <= hi && (l.kind === 'add' || l.kind === 'del')) lines.push(j)
        })
        return { hunk: hunkIdx, lines, anchor: prev.anchor }
      }
      // Ctrl/Cmd+clic: alterna la línea dentro de la selección.
      if ((e.ctrlKey || e.metaKey) && prev && prev.hunk === hunkIdx) {
        const has = prev.lines.includes(lineIdx)
        const lines = has ? prev.lines.filter((x) => x !== lineIdx) : [...prev.lines, lineIdx]
        return lines.length ? { hunk: hunkIdx, lines, anchor: lineIdx } : null
      }
      // Clic simple: selecciona la línea (o deselecciona si era la única).
      if (prev && prev.hunk === hunkIdx && prev.lines.length === 1 && prev.lines[0] === lineIdx) {
        return null
      }
      return { hunk: hunkIdx, lines: [lineIdx], anchor: lineIdx }
    })
  }

  if (hunks.length === 0) return <div className="empty">Sin cambios para mostrar</div>
  return (
    <div className="diff hunkview">
      {hunks.map((h, i) => {
        const selHere = sel && sel.hunk === i && sel.lines.length > 0 ? sel : null
        return (
          <div key={i} className="hunk-block">
            <div className="hunk-bar">
              <span className="hunk-title">{h.header}</span>
              {readOnly ? null : selHere ? (
                side === 'unstaged' ? (
                  <>
                    <button
                      className="hunk-btn accent"
                      title="Prepara solo las líneas seleccionadas"
                      onClick={() => {
                        onStageLines(h, selHere.lines)
                        setSel(null)
                      }}
                    >
                      <Plus size={12} /> Preparar líneas ({selHere.lines.length})
                    </button>
                    <button
                      className="hunk-btn danger"
                      title="Descarta solo las líneas seleccionadas"
                      onClick={() => {
                        onDiscardLines(h, selHere.lines)
                        setSel(null)
                      }}
                    >
                      <Undo2 size={12} /> Descartar líneas
                    </button>
                    <button className="hunk-btn" title="Quitar selección" onClick={() => setSel(null)}>
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="hunk-btn"
                      title="Quita del índice solo las líneas seleccionadas"
                      onClick={() => {
                        onUnstageLines(h, selHere.lines)
                        setSel(null)
                      }}
                    >
                      <Minus size={12} /> Quitar líneas ({selHere.lines.length})
                    </button>
                    <button className="hunk-btn" title="Quitar selección" onClick={() => setSel(null)}>
                      <X size={12} />
                    </button>
                  </>
                )
              ) : side === 'unstaged' ? (
                <>
                  <button className="hunk-btn" onClick={() => onStage(h)}>
                    <Plus size={12} /> Preparar hunk
                  </button>
                  <button className="hunk-btn danger" onClick={() => onDiscard(h)}>
                    <Undo2 size={12} /> Descartar
                  </button>
                </>
              ) : (
                <button className="hunk-btn" onClick={() => onUnstage(h)}>
                  <Minus size={12} /> Quitar hunk
                </button>
              )}
            </div>
            {h.lines.map((l, j) => {
              const pickable = !readOnly && (l.kind === 'add' || l.kind === 'del')
              const picked = !!selHere && selHere.lines.includes(j)
              return (
                <div
                  key={j}
                  className={`diff-line ${l.kind === 'add' ? 'add' : l.kind === 'del' ? 'del' : ''}${
                    pickable ? ' pickable' : ''
                  }${picked ? ' picked' : ''}`}
                  title={pickable ? 'Clic: seleccionar línea · Shift+clic: rango · Ctrl+clic: alternar' : undefined}
                  onMouseDown={(e) => {
                    if (e.shiftKey) e.preventDefault() // evita selección de texto
                  }}
                  onClick={(e) => clickLine(e, i, j, l.kind)}
                >
                  <span className="gutter">{l.oldNo ?? ''}</span>
                  <span className="gutter">{l.newNo ?? ''}</span>
                  <span className="content">
                    {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}
                    {l.text}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** File View con resaltado: las líneas añadidas/modificadas según
 *  el diff se marcan en verde; donde hubo eliminaciones, un marcador rojo. */
function FileContent({ text, diff }: { text: string; diff: string }): JSX.Element {
  const lines = useMemo(() => text.split('\n'), [text])
  const marks = useMemo(() => {
    const added = new Set<number>()
    const delAbove = new Set<number>()
    let pendingDel = false
    for (const l of parseDiff(diff)) {
      if (l.kind === 'add') {
        added.add(l.newNo!)
        pendingDel = false
      } else if (l.kind === 'del') {
        pendingDel = true
      } else if (l.kind === 'ctx') {
        if (pendingDel && l.newNo != null) delAbove.add(l.newNo)
        pendingDel = false
      }
    }
    return { added, delAbove }
  }, [diff])

  if (!text) return <div className="empty">Archivo vacío o no disponible</div>
  return (
    <div className="diff">
      {lines.map((l, i) => (
        <div
          key={i}
          className={`diff-line${marks.added.has(i + 1) ? ' add' : ''}${
            marks.delAbove.has(i + 1) ? ' del-above' : ''
          }`}
        >
          <span className="gutter">{i + 1}</span>
          <span className="content"> {l}</span>
        </div>
      ))}
    </div>
  )
}

export function DiffPane(): JSX.Element | null {
  const { repo, selectedFile, status, setSelectedFile, run } = useStore()
  const { openConfirm } = useDialog()
  const [diff, setDiff] = useState('')
  const [fileText, setFileText] = useState('')
  const [layout, setLayout] = useState<Layout>('inline')
  const [viewMode, setViewMode] = useState<ViewMode>('diff')
  const [side, setSide] = useState<Side>('unstaged')
  const [wrap, setWrap] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const paneRef = useRef<HTMLDivElement>(null)

  const isWip = !!selectedFile && !selectedFile.commit
  const path = repo?.path

  useEffect(() => {
    setSide(selectedFile?.staged ? 'staged' : 'unstaged')
    setEditing(false)
    // History/Blame directos desde un menú contextual.
    setViewMode(selectedFile?.mode ?? 'diff')
  }, [selectedFile])

  useEffect(() => {
    if (!path || !selectedFile || editing) return
    if (viewMode === 'history' || viewMode === 'blame') return // cargan lo suyo
    const staged = isWip ? side === 'staged' : selectedFile.staged
    if (viewMode === 'file') {
      bridge.fileContent(path, { file: selectedFile.path, staged, commit: selectedFile.commit }).then(setFileText)
    }
    // El diff también alimenta el resaltado de la File View.
    bridge.diff(path, { file: selectedFile.path, staged, commit: selectedFile.commit }).then(setDiff)
  }, [path, selectedFile, status, side, viewMode, isWip, editing])

  if (!selectedFile) return null

  const name = selectedFile.path.split('/').pop()
  const dir = selectedFile.path.split('/').slice(0, -1).join('/')

  const startEdit = async (): Promise<void> => {
    if (!path) return
    const content = await bridge.fileContent(path, { file: selectedFile.path })
    setEditText(content)
    setEditing(true)
  }
  const saveEdit = (): void => {
    if (!path) return
    run('Guardar archivo', async () => {
      await bridge.writeFile(path, selectedFile.path, editText)
      setEditing(false)
    })
  }

  const stageHunk = (h: Hunk): Promise<void> => run('Preparar hunk', () => bridge.applyHunk(path!, h.patch, 'stage'))
  const unstageHunk = (h: Hunk): Promise<void> => run('Quitar hunk', () => bridge.applyHunk(path!, h.patch, 'unstage'))
  const discardHunk = (h: Hunk): void =>
    openConfirm({
      title: 'Descartar hunk',
      message: 'Se revertirá este bloque de cambios en el working tree. No se puede deshacer.',
      danger: true,
      confirmText: 'Descartar',
      onConfirm: () => run('Descartar hunk', () => bridge.applyHunk(path!, h.patch, 'discard'))
    })

  // Staging por línea: parche con solo las líneas elegidas + `git apply --recount`.
  const stageLines = (h: Hunk, lines: number[]): void => {
    const patch = buildLinePatch(h, new Set(lines), 'forward')
    if (!patch) return
    void run('Preparar líneas', () => bridge.applyHunk(path!, patch, 'stage', { recount: true }))
  }
  const unstageLines = (h: Hunk, lines: number[]): void => {
    const patch = buildLinePatch(h, new Set(lines), 'reverse')
    if (!patch) return
    void run('Quitar líneas', () => bridge.applyHunk(path!, patch, 'unstage', { recount: true }))
  }
  const discardLines = (h: Hunk, lines: number[]): void => {
    const patch = buildLinePatch(h, new Set(lines), 'reverse')
    if (!patch) return
    openConfirm({
      title: 'Descartar líneas',
      message: `Se revertirán ${lines.length} línea${lines.length !== 1 ? 's' : ''} en el working tree. No se puede deshacer.`,
      danger: true,
      confirmText: 'Descartar',
      onConfirm: () => run('Descartar líneas', () => bridge.applyHunk(path!, patch, 'discard', { recount: true }))
    })
  }

  const nav = (dir: number): void => {
    const scroller = paneRef.current?.querySelector('.diff') as HTMLElement | null
    if (!scroller) return
    const marks = [...scroller.querySelectorAll('.diff-line.hunk, .split-row.hunk, .hunk-block')] as HTMLElement[]
    const sTop = scroller.getBoundingClientRect().top
    const offsets = marks.map((m) => m.getBoundingClientRect().top - sTop + scroller.scrollTop)
    const cur = scroller.scrollTop
    if (dir > 0) {
      const next = offsets.find((o) => o > cur + 2)
      if (next != null) scroller.scrollTo({ top: next, behavior: 'smooth' })
    } else {
      const prev = [...offsets].reverse().find((o) => o < cur - 2)
      scroller.scrollTo({ top: prev ?? 0, behavior: 'smooth' })
    }
  }

  return (
    <div className={`diff-pane${wrap ? ' wrap' : ''}`} ref={paneRef}>
      <div className="diff-pane-head">
        <FileText size={14} color="var(--accent)" />
        <span className="fname" title={selectedFile.path}>
          {name}
        </span>
        {dir && <span className="fdir">{dir}</span>}

        <div className="dph-tools">
          {editing ? (
            <>
              <button className="mini accent" onClick={saveEdit}>
                <Check size={13} /> Guardar
              </button>
              <button className="mini" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              {isWip && (
                <button className="mini" title="Editar en el working tree" onClick={startEdit}>
                  <Pencil size={13} /> Editar
                </button>
              )}

              <span className="dph-div" />

              {isWip && (viewMode === 'diff' || viewMode === 'file') && (
                <div className="seg small">
                  <button className={side === 'unstaged' ? 'active' : ''} onClick={() => setSide('unstaged')}>
                    Sin preparar
                  </button>
                  <button className={side === 'staged' ? 'active' : ''} onClick={() => setSide('staged')}>
                    Preparado
                  </button>
                </div>
              )}

              <div className="seg small">
                <button className={viewMode === 'diff' ? 'active' : ''} onClick={() => setViewMode('diff')}>
                  <FileCode2 size={13} /> Diff
                </button>
                <button className={viewMode === 'file' ? 'active' : ''} onClick={() => setViewMode('file')}>
                  <FileText size={13} /> Archivo
                </button>
                <button
                  className={viewMode === 'history' ? 'active' : ''}
                  title="Commits que tocaron este archivo"
                  onClick={() => setViewMode('history')}
                >
                  <History size={13} /> History
                </button>
                <button
                  className={viewMode === 'blame' ? 'active' : ''}
                  title="Autor y commit de cada línea"
                  onClick={() => setViewMode('blame')}
                >
                  <Users size={13} /> Blame
                </button>
              </div>

              {viewMode === 'diff' && (
                <div className="seg small">
                  <button className={layout === 'hunk' ? 'active' : ''} title="Por bloques" onClick={() => setLayout('hunk')}>
                    <Rows3 size={13} /> Hunk
                  </button>
                  <button className={layout === 'inline' ? 'active' : ''} title="Unificado" onClick={() => setLayout('inline')}>
                    <AlignLeft size={13} /> Inline
                  </button>
                  <button className={layout === 'split' ? 'active' : ''} title="Lado a lado" onClick={() => setLayout('split')}>
                    <Columns2 size={13} /> Split
                  </button>
                </div>
              )}

              <span className="dph-div" />

              {viewMode === 'diff' && layout !== 'hunk' && (
                <>
                  <button className="mini icon" title="Cambio anterior" onClick={() => nav(-1)}>
                    <ChevronUp size={15} />
                  </button>
                  <button className="mini icon" title="Cambio siguiente" onClick={() => nav(1)}>
                    <ChevronDown size={15} />
                  </button>
                </>
              )}
              <button className={`mini icon${wrap ? ' on' : ''}`} title="Ajuste de línea" onClick={() => setWrap((v) => !v)}>
                <WrapText size={15} />
              </button>
              <button className="mini icon" title="Cerrar diff" onClick={() => setSelectedFile(null)}>
                <X size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea className="file-editor" value={editText} onChange={(e) => setEditText(e.target.value)} spellCheck={false} />
      ) : viewMode === 'history' ? (
        <FileHistory file={selectedFile.path} commit={selectedFile.commit} />
      ) : viewMode === 'blame' ? (
        <BlameView file={selectedFile.path} commit={selectedFile.commit} />
      ) : viewMode === 'file' ? (
        <FileContent text={fileText} diff={diff} />
      ) : layout === 'split' ? (
        <SplitDiff diff={diff} />
      ) : layout === 'hunk' ? (
        <HunkView
          diff={diff}
          side={isWip ? side : 'staged'}
          readOnly={!isWip}
          onStage={stageHunk}
          onUnstage={unstageHunk}
          onDiscard={discardHunk}
          onStageLines={stageLines}
          onUnstageLines={unstageLines}
          onDiscardLines={discardLines}
        />
      ) : (
        <DiffViewer diff={diff} />
      )}
    </div>
  )
}

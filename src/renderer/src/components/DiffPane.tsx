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
  Undo2,
  Eye
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bridge } from '../bridge'
import { useDialog } from '../dialog'
import {
  buildLinePatch,
  parseDiff,
  splitHunks,
  toSplitRows,
  type DiffLine,
  type Hunk,
  type SplitRow
} from '../lib/parseDiff'
import { useStore } from '../store'
import { kindByExt, type FileInfo } from '@shared/fileKinds'
import { BinaryView } from './BinaryView'
import { BlameView } from './BlameView'
import { DiffViewer } from './DiffViewer'
import { FileHistory } from './FileHistory'
import { CHUNK_ROWS, clipLine, LazyRows, MoreRows, useRowLimit } from './LazyRows'

type Layout = 'hunk' | 'inline' | 'split'
type ViewMode = 'diff' | 'file' | 'history' | 'blame'
type Side = 'unstaged' | 'staged'

/** Contenido cargado (diff o archivo) junto a la selección a la que pertenece. */
interface Loaded {
  key: string
  text: string
}
const NOT_LOADED: Loaded = { key: '', text: '' }

/** Salida de git para un archivo que considera binario (sin hunks de texto). */
const GIT_BINARY_RE = /^Binary files .* differ$/m

function renderSplitRow(r: SplitRow): JSX.Element {
  return r.hunk ? (
    <div className="split-row hunk">
      <div className="side full">{r.hunk}</div>
    </div>
  ) : (
    <div className="split-row">
      <div className={`side ${r.left ? r.left.kind : 'empty'}`}>
        <span className="gutter">{r.left?.no ?? ''}</span>
        <span className="content">{r.left ? clipLine(r.left.text) : ''}</span>
      </div>
      <div className={`side ${r.right ? r.right.kind : 'empty'}`}>
        <span className="gutter">{r.right?.no ?? ''}</span>
        <span className="content">{r.right ? clipLine(r.right.text) : ''}</span>
      </div>
    </div>
  )
}

const SplitDiff = memo(function SplitDiff({ diff }: { diff: string }): JSX.Element {
  const rows = useMemo(() => toSplitRows(parseDiff(diff)), [diff])
  if (!diff.trim()) return <div className="empty">Sin cambios para mostrar</div>
  return (
    <div className="diff split">
      <LazyRows items={rows} renderRow={renderSplitRow} />
    </div>
  )
})

/** Selección de líneas dentro de un hunk (stage/descarte por línea). */
interface LineSel {
  hunk: number
  lines: number[]
  anchor: number
}

type LineClick = (e: React.MouseEvent, hunkIdx: number, lineIdx: number, kind: string) => void

/** Tramo de líneas de un hunk. Memoizado: al seleccionar líneas solo se
 *  re-renderiza el hunk afectado (los demás reciben `picked` = null). */
const HunkLines = memo(function HunkLines({
  lines,
  hunkIdx,
  start,
  end,
  picked,
  readOnly,
  onLineClick
}: {
  lines: DiffLine[]
  hunkIdx: number
  start: number
  end: number
  picked: number[] | null
  readOnly?: boolean
  onLineClick: LineClick
}): JSX.Element {
  const out: JSX.Element[] = []
  for (let j = start; j < end; j++) {
    const l = lines[j]
    const pickable = !readOnly && (l.kind === 'add' || l.kind === 'del')
    const isPicked = !!picked && picked.includes(j)
    out.push(
      <div
        key={j}
        className={`diff-line ${l.kind === 'add' ? 'add' : l.kind === 'del' ? 'del' : ''}${
          pickable ? ' pickable' : ''
        }${isPicked ? ' picked' : ''}`}
        title={pickable ? 'Clic: seleccionar línea · Shift+clic: rango · Ctrl+clic: alternar' : undefined}
        onMouseDown={(e) => {
          if (e.shiftKey) e.preventDefault() // evita selección de texto
        }}
        onClick={(e) => onLineClick(e, hunkIdx, j, l.kind)}
      >
        <span className="gutter">{l.oldNo ?? ''}</span>
        <span className="gutter">{l.newNo ?? ''}</span>
        <span className="content">
          {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}
          {clipLine(l.text)}
        </span>
      </div>
    )
  }
  return <>{out}</>
})

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
  const { limit, more, all } = useRowLimit()
  const hunksRef = useRef(hunks)
  hunksRef.current = hunks

  // La selección se descarta si el diff cambia (stage aplicado, edición, etc.).
  useEffect(() => setSel(null), [diff])

  // Estable (usa refs) para no invalidar los tramos memoizados de HunkLines.
  const clickLine = useCallback<LineClick>(
    (e, hunkIdx, lineIdx, kind) => {
      if (readOnly || (kind !== 'add' && kind !== 'del')) return
      const shift = e.shiftKey
      const toggle = e.ctrlKey || e.metaKey
      setSel((prev) => {
        // Shift+clic: rango desde el ancla (solo líneas de cambio del mismo hunk).
        if (shift && prev && prev.hunk === hunkIdx) {
          const [lo, hi] = prev.anchor < lineIdx ? [prev.anchor, lineIdx] : [lineIdx, prev.anchor]
          const lines: number[] = []
          hunksRef.current[hunkIdx].lines.forEach((l, j) => {
            if (j >= lo && j <= hi && (l.kind === 'add' || l.kind === 'del')) lines.push(j)
          })
          return { hunk: hunkIdx, lines, anchor: prev.anchor }
        }
        // Ctrl/Cmd+clic: alterna la línea dentro de la selección.
        if (toggle && prev && prev.hunk === hunkIdx) {
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
    },
    [readOnly]
  )

  if (hunks.length === 0) return <div className="empty">Sin cambios para mostrar</div>

  // Presupuesto de filas compartido entre hunks (cada cabecera cuenta como una).
  let total = 0
  for (const h of hunks) total += h.lines.length + 1
  let budget = limit
  let shown = 0

  return (
    <div className="diff hunkview">
      {hunks.map((h, i) => {
        if (budget <= 0) return null
        const count = Math.min(h.lines.length, budget - 1)
        budget -= count + 1
        shown += count + 1
        const selHere = sel && sel.hunk === i && sel.lines.length > 0 ? sel : null
        const chunks: JSX.Element[] = []
        for (let s = 0; s < count; s += CHUNK_ROWS) {
          chunks.push(
            <HunkLines
              key={s}
              lines={h.lines}
              hunkIdx={i}
              start={s}
              end={Math.min(s + CHUNK_ROWS, count)}
              picked={selHere ? selHere.lines : null}
              readOnly={readOnly}
              onLineClick={clickLine}
            />
          )
        }
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
            {chunks}
          </div>
        )
      })}
      {shown < total && <MoreRows shown={shown} total={total} onMore={more} onAll={all} />}
    </div>
  )
}

/** File View con resaltado: las líneas añadidas/modificadas según
 *  el diff se marcan en verde; donde hubo eliminaciones, un marcador rojo. */
const FileContent = memo(function FileContent({ text, diff }: { text: string; diff: string }): JSX.Element {
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

  const renderRow = useCallback(
    (l: string, i: number) => (
      <div
        className={`diff-line${marks.added.has(i + 1) ? ' add' : ''}${
          marks.delAbove.has(i + 1) ? ' del-above' : ''
        }`}
      >
        <span className="gutter">{i + 1}</span>
        <span className="content"> {clipLine(l)}</span>
      </div>
    ),
    [marks]
  )

  if (!text) return <div className="empty">Archivo vacío o no disponible</div>
  return (
    <div className="diff">
      <LazyRows items={lines} renderRow={renderRow} />
    </div>
  )
})

export function DiffPane(): JSX.Element | null {
  // Selectores individuales: suscribirse al store entero re-renderizaba el
  // diff (potencialmente enorme) con cualquier cambio (toasts, busy, grafo…).
  const repo = useStore((s) => s.repo)
  const selectedFile = useStore((s) => s.selectedFile)
  const status = useStore((s) => s.status)
  const setSelectedFile = useStore((s) => s.setSelectedFile)
  const run = useStore((s) => s.run)
  const { openConfirm } = useDialog()
  // Cada contenido recuerda de qué repo/archivo/lado es (`key`): mientras llega
  // el del archivo o lado recién elegido no se muestra el anterior, cuyos
  // botones de hunk actuarían sobre otro archivo o lado.
  const [diffState, setDiffState] = useState<Loaded>(NOT_LOADED)
  const [fileState, setFileState] = useState<Loaded>(NOT_LOADED)
  const [infoState, setInfoState] = useState<{ key: string; info: FileInfo | null }>({ key: '', info: null })
  const [layout, setLayout] = useState<Layout>('inline')
  const [viewMode, setViewMode] = useState<ViewMode>('diff')
  const [side, setSide] = useState<Side>('unstaged')
  const [wrap, setWrap] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const paneRef = useRef<HTMLDivElement>(null)

  const isWip = !!selectedFile && !selectedFile.commit
  const path = repo?.path
  const staged = isWip ? side === 'staged' : selectedFile?.staged
  const contentKey = selectedFile
    ? JSON.stringify([path ?? null, selectedFile.path, selectedFile.commit ?? null, !!staged])
    : ''
  // Binarios (imágenes, PDF, Office, comprimidos…): nunca se piden como texto.
  // Por extensión se sabe al instante; las desconocidas las confirma fileInfo.
  const extKind = selectedFile ? kindByExt(selectedFile.path) : 'text'
  const info = infoState.key === contentKey ? infoState.info : null
  const knownBinary = extKind !== 'text' || (!!info && info.kind !== 'text')

  useEffect(() => {
    setSide(selectedFile?.staged ? 'staged' : 'unstaged')
    setEditing(false)
    // History/Blame directos desde un menú contextual.
    setViewMode(selectedFile?.mode ?? 'diff')
  }, [selectedFile])

  // Tipo y tamaños del archivo (barato: no lee el contenido entero).
  useEffect(() => {
    if (!path || !selectedFile || editing) return
    let cancelled = false
    const key = contentKey
    bridge.fileInfo(path, { file: selectedFile.path, staged, commit: selectedFile.commit }).then(
      (i) =>
        !cancelled &&
        setInfoState((prev) =>
          prev.key === key && JSON.stringify(prev.info) === JSON.stringify(i) ? prev : { key, info: i }
        ),
      () =>
        !cancelled &&
        setInfoState({ key, info: { kind: extKind, old: { size: null, sig: '' }, new: { size: null, sig: '' } } })
    )
    return () => {
      cancelled = true
    }
  }, [path, selectedFile, status, staged, editing, contentKey, extKind])

  useEffect(() => {
    if (!path || !selectedFile || editing || knownBinary) return
    if (viewMode === 'history' || viewMode === 'blame') return // cargan lo suyo
    // Con archivos grandes una petición puede tardar más que la siguiente
    // (refresco del watcher, cambio de archivo): se ignoran las obsoletas.
    let cancelled = false
    const key = contentKey
    // Conserva el objeto si nada cambió: un refresco idéntico no re-renderiza.
    const store =
      (set: React.Dispatch<React.SetStateAction<Loaded>>) =>
      (text: string): void => {
        if (!cancelled) set((prev) => (prev.key === key && prev.text === text ? prev : { key, text }))
      }
    if (viewMode === 'file') {
      bridge
        .fileContent(path, { file: selectedFile.path, staged, commit: selectedFile.commit })
        .then(store(setFileState), () => store(setFileState)(''))
    }
    // El diff también alimenta el resaltado de la File View.
    bridge
      .diff(path, { file: selectedFile.path, staged, commit: selectedFile.commit })
      .then(store(setDiffState), () => store(setDiffState)(''))
    return () => {
      cancelled = true
    }
  }, [path, selectedFile, status, side, viewMode, isWip, editing, staged, contentKey, knownBinary])

  if (!selectedFile) return null

  // Clave por archivo: al cambiar de archivo las vistas se remontan (vuelven a
  // la carga progresiva inicial y al principio del scroll); los refrescos del
  // mismo archivo conservan las líneas ya cargadas.
  const viewKey = JSON.stringify([selectedFile.path, selectedFile.commit ?? null, side])
  // null = aún no ha llegado el contenido de lo que está seleccionado ahora.
  const diff = diffState.key === contentKey ? diffState.text : null
  const fileText = fileState.key === contentKey ? fileState.text : null
  const isBinary = knownBinary || (diff !== null && GIT_BINARY_RE.test(diff) && !diff.includes('\n@@'))
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
      // Sin más cambios pintados pero quedan líneas por cargar: baja al final
      // para que la carga progresiva traiga el siguiente tramo.
      else if (scroller.querySelector('.diff-more')) scroller.scrollTo({ top: scroller.scrollHeight })
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
              {isWip && !isBinary && (
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

              {isBinary ? (
                <div className="seg small">
                  <button className={viewMode !== 'history' ? 'active' : ''} onClick={() => setViewMode('diff')}>
                    <Eye size={13} /> Vista previa
                  </button>
                  <button
                    className={viewMode === 'history' ? 'active' : ''}
                    title="Commits que tocaron este archivo"
                    onClick={() => setViewMode('history')}
                  >
                    <History size={13} /> History
                  </button>
                </div>
              ) : (
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
              )}

              {viewMode === 'diff' && !isBinary && (
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

              {viewMode === 'diff' && layout !== 'hunk' && !isBinary && (
                <>
                  <button className="mini icon" title="Cambio anterior" onClick={() => nav(-1)}>
                    <ChevronUp size={15} />
                  </button>
                  <button className="mini icon" title="Cambio siguiente" onClick={() => nav(1)}>
                    <ChevronDown size={15} />
                  </button>
                </>
              )}
              {!isBinary && (
                <button className={`mini icon${wrap ? ' on' : ''}`} title="Ajuste de línea" onClick={() => setWrap((v) => !v)}>
                  <WrapText size={15} />
                </button>
              )}
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
      ) : isBinary ? (
        <BinaryView
          key={viewKey}
          fileRef={{ file: selectedFile.path, staged, commit: selectedFile.commit }}
          info={info}
        />
      ) : viewMode === 'blame' ? (
        <BlameView file={selectedFile.path} commit={selectedFile.commit} />
      ) : diff === null || (viewMode === 'file' && fileText === null) ? (
        <div className="empty">Cargando…</div>
      ) : viewMode === 'file' ? (
        <FileContent key={viewKey} text={fileText ?? ''} diff={diff} />
      ) : layout === 'split' ? (
        <SplitDiff key={viewKey} diff={diff} />
      ) : layout === 'hunk' ? (
        <HunkView
          key={viewKey}
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
        <DiffViewer key={viewKey} diff={diff} />
      )}
    </div>
  )
}

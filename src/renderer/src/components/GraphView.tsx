import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GitBranch,
  Tag as TagIcon,
  Tags,
  Cloud,
  Circle,
  Pencil,
  Search,
  X,
  ZoomIn,
  ZoomOut,
  Locate,
  ChevronsDown,
  ChevronsUp,
  ThumbsUp,
  ThumbsDown,
  FlagOff
} from 'lucide-react'
import { buildGraph } from '@shared/graph'
import { commitWebUrl } from '@shared/remoteUrls'
import type { Commit, CommitWithGraph, GraphRow, GraphSegment, RefDecoration } from '@shared/types'
import { bridge } from '../bridge'
import { useCenterView } from '../centerView'
import { useContextMenu, type MenuItem } from '../contextMenu'
import { useDialog } from '../dialog'
import { useDrag, type DragItem } from '../drag'
import { branchOntoCommitMenu } from '../lib/dropMenus'
import { authorColor } from '../lib/avatar'
import { initials, relativeTime } from '../lib/time'
import { useStore } from '../store'
import { useRebasePanel } from './InteractiveRebase'

const LANE_W_BASE = 18
const ROW_H_BASE = 30
const PAD = 12
const ZOOM_MIN = 0.8
const ZOOM_MAX = 1.6
const ZOOM_STEP = 0.1
/** Carriles visibles como máximo; los demás se recortan para no aplastar
 *  la columna de mensaje en repos con muchísimas ramas paralelas. */
const MAX_VISIBLE_LANES = 14
/** Filas extra renderizadas por encima/debajo del viewport (virtualización). */
const OVERSCAN = 10

const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))

function x(col: number, laneW: number): number {
  return PAD + col * laneW + laneW / 2
}

function segPath(seg: GraphSegment, laneW: number, rowH: number): string {
  const x1 = x(seg.fromCol, laneW)
  const y1 = seg.fromY * rowH
  const x2 = x(seg.toCol, laneW)
  const y2 = seg.toY * rowH
  if (x1 === x2) return `M${x1},${y1} L${x2},${y2}`
  const my = (y1 + y2) / 2
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`
}

/** ¿El commit coincide con el texto (mensaje, autor o SHA)? `q` en minúsculas. */
function matchCommit(c: Commit, q: string): boolean {
  return (
    c.subject.toLowerCase().includes(q) ||
    c.authorName.toLowerCase().includes(q) ||
    c.hash.includes(q) ||
    c.shortHash.includes(q)
  )
}

/** Resalta la primera coincidencia de `q` (minúsculas) dentro de `text`. */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q)
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="hl">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

const GraphCell = memo(function GraphCell({
  row,
  width,
  laneW,
  rowH,
  avatarColor,
  avatarText
}: {
  row: GraphRow
  width: number
  laneW: number
  rowH: number
  avatarColor: string
  avatarText: string
}): JSX.Element {
  const cx = x(row.col, laneW)
  const cy = rowH / 2
  const isMerge = row.segments.filter((s) => s.fromY === 0.5).length > 1
  // El nodo es el avatar del autor (iniciales + color propio) con un anillo
  // del color del carril; el halo lo separa de las líneas.
  const r = Math.min(rowH * 0.32, laneW * 0.48)
  return (
    <div className="col-graph">
      <svg width={width} height={rowH} viewBox={`0 0 ${width} ${rowH}`}>
        {row.segments.map((s, i) => (
          <path key={i} d={segPath(s, laneW, rowH)} fill="none" stroke={s.color} strokeWidth={2} />
        ))}
        <circle cx={cx} cy={cy} r={r + 1.5} fill="var(--bg-app)" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={avatarColor}
          stroke={row.color}
          strokeWidth={isMerge ? 3 : 2}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={r * 0.9}
          fontWeight={700}
          fill="#fff"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {avatarText}
        </text>
      </svg>
    </div>
  )
})

const RefChip = memo(function RefChip({
  decoration,
  tipHash
}: {
  decoration: RefDecoration
  tipHash: string
}): JSX.Element {
  const dragStart = useDrag((s) => s.start)
  const dragEnd = useDrag((s) => s.end)
  const isBranch = decoration.type !== 'tag'
  const icon =
    decoration.type === 'tag' ? (
      <TagIcon />
    ) : decoration.type === 'remoteBranch' ? (
      <Cloud />
    ) : (
      <GitBranch />
    )
  return (
    <span
      className={`ref-chip ${decoration.type}`}
      title={isBranch ? `Arrastra «${decoration.name}» sobre otra rama o commit` : decoration.name}
      draggable={isBranch}
      onDragStart={(e) => {
        if (!isBranch) return
        e.stopPropagation()
        dragStart({
          kind: 'branch',
          label: decoration.name,
          ref: decoration.name,
          isRemote: decoration.type === 'remoteBranch',
          hash: tipHash
        })
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => dragEnd()}
    >
      {icon}
      {decoration.name}
    </span>
  )
})

const CommitRow = memo(function CommitRow({
  commit,
  width,
  laneW,
  rowH,
  query,
  filterState,
  onSelect
}: {
  commit: CommitWithGraph
  width: number
  laneW: number
  rowH: number
  query: string
  /** '' = sin filtro · 'match' = coincide · 'dim' = filtro activo pero no coincide. */
  filterState: '' | 'match' | 'dim'
  onSelect: (e: React.MouseEvent, hash: string) => void
}): JSX.Element {
  // Suscripciones mínimas: la fila solo se re-renderiza si cambia SU estado
  // (selección/drag sobre ella), no con cada toast/busy/refresh global.
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const notify = useStore((s) => s.notify)
  const selected = useStore(
    (s) =>
      (s.selection?.kind === 'commit' && s.selection.hash === commit.hash) ||
      s.multiSel.includes(commit.hash)
  )
  const isMulti = useStore((s) => s.multiSel.includes(commit.hash))
  const isBisectCur = useStore((s) => !!s.bisect?.active && s.bisect.current === commit.hash)
  const openMenu = useContextMenu((s) => s.openMenu)
  const { openPrompt, openConfirm } = useDialog()
  const overKey = `c:${commit.hash}`
  const canDrop = useDrag((s) => s.item?.kind === 'branch')
  const isOver = useDrag((s) => s.overKey === overKey)
  const dragStart = useDrag((s) => s.start)
  const dragEnd = useDrag((s) => s.end)
  const setOver = useDrag((s) => s.setOver)

  const menu = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (!repo) return
    const multi = useStore.getState().multiSel
    const inMulti = multi.length >= 2 && multi.includes(commit.hash)

    const bisectPair = (): void => {
      const byHash = new Map(useStore.getState().commits.map((c) => [c.hash, c]))
      const [a, b] = multi
      const ca = byHash.get(a)
      const cb = byHash.get(b)
      if (!ca || !cb) return
      const good = ca.date <= cb.date ? ca : cb
      const bad = good === ca ? cb : ca
      openConfirm({
        title: 'Iniciar bisect',
        message: `Se buscará el commit que introdujo el fallo entre ${good.shortHash} (bueno) y ${bad.shortHash} (malo). El repositorio quedará en detached HEAD durante la sesión.`,
        confirmText: 'Iniciar bisect',
        onConfirm: () =>
          run('Bisect', async () => {
            const msg = await bridge.bisectStart(repo.path, { bad: bad.hash, good: good.hash })
            const line = msg.split('\n').find((l) => l.trim())
            if (line) notify('info', line.trim())
          })
      })
    }

    const bisectFromHere = (): void =>
      openConfirm({
        title: 'Iniciar bisect',
        message: `Se marcará ${commit.shortHash} como bueno y HEAD como malo, y git probará commits intermedios (detached HEAD) hasta encontrar el culpable.`,
        confirmText: 'Iniciar bisect',
        onConfirm: () =>
          run('Bisect', async () => {
            const msg = await bridge.bisectStart(repo.path, { bad: 'HEAD', good: commit.hash })
            const line = msg.split('\n').find((l) => l.trim())
            if (line) notify('info', line.trim())
          })
      })

    /** Comparación de dos commits multi-seleccionados (el más antiguo de base). */
    const comparePair = (): void => {
      const byHash = new Map(useStore.getState().commits.map((c) => [c.hash, c]))
      const [a, b] = multi
      const ca = byHash.get(a)
      const cb = byHash.get(b)
      if (!ca || !cb) return
      const older = ca.date <= cb.date ? ca : cb
      const newer = older === ca ? cb : ca
      useCenterView.getState().openCompare({
        a: older.hash,
        b: newer.hash,
        aLabel: older.shortHash,
        bLabel: newer.shortHash
      })
    }

    openMenu(e.clientX, e.clientY, [
      ...(inMulti
        ? [
            { label: `${multi.length} commits seleccionados`, disabled: true },
            {
              label: 'Copiar SHAs',
              onClick: () => {
                navigator.clipboard?.writeText(multi.join('\n'))
                notify('success', 'SHAs copiados')
              }
            },
            ...(multi.length === 2
              ? [
                  { label: 'Comparar estos 2 commits', onClick: comparePair },
                  { label: 'Iniciar bisect entre estos commits…', onClick: bisectPair }
                ]
              : []),
            { divider: true } as const
          ]
        : []),
      {
        label: 'Comparar con HEAD',
        onClick: () =>
          useCenterView.getState().openCompare({
            a: commit.hash,
            b: 'HEAD',
            aLabel: commit.shortHash,
            bLabel: 'HEAD'
          })
      },
      {
        label: 'Comparar con el working tree',
        onClick: () =>
          useCenterView.getState().openCompare({
            a: commit.hash,
            b: '',
            aLabel: commit.shortHash,
            bLabel: 'Working tree'
          })
      },
      { divider: true },
      {
        label: 'Checkout este commit (detached HEAD)',
        onClick: () =>
          openConfirm({
            title: 'Checkout de un commit',
            message: `HEAD quedará suelto (detached) en ${commit.shortHash}: los commits que hagas ahí no pertenecerán a ninguna rama y pueden perderse al cambiar de rama. Crea una rama si quieres conservar el trabajo.`,
            confirmText: 'Checkout detached',
            onConfirm: () => run('Checkout (detached)', () => bridge.checkout(repo.path, commit.hash))
          })
      },
      {
        label: 'Crear rama aquí…',
        onClick: () =>
          openPrompt({
            title: 'Crear rama desde commit',
            label: `Desde ${commit.shortHash}`,
            placeholder: 'nombre-rama',
            confirmText: 'Crear',
            onConfirm: (name) =>
              run('Crear rama', () => bridge.createBranch(repo.path, name, { startPoint: commit.hash, checkout: true }))
          })
      },
      {
        label: 'Crear tag aquí…',
        onClick: () =>
          openPrompt({
            title: 'Crear tag',
            label: `En ${commit.shortHash}`,
            placeholder: 'v1.0.0',
            confirmText: 'Crear',
            onConfirm: (name) => run('Crear tag', () => bridge.createTag(repo.path, name, { ref: commit.hash }))
          })
      },
      { divider: true },
      { label: 'Cherry-pick', onClick: () => run('Cherry-pick', () => bridge.cherryPick(repo.path, commit.hash)) },
      { label: 'Revert', onClick: () => run('Revert', () => bridge.revert(repo.path, commit.hash)) },
      { divider: true },
      {
        label: 'Rebase interactivo sobre este commit…',
        onClick: () =>
          useRebasePanel.getState().openPanel({ base: commit.hash, baseLabel: commit.shortHash })
      },
      { label: 'Iniciar bisect (este commit es bueno)…', onClick: bisectFromHere },
      { divider: true },
      { label: 'Reset (soft) a este commit', onClick: () => run('Reset soft', () => bridge.reset(repo.path, 'soft', commit.hash)) },
      { label: 'Reset (mixed) a este commit', onClick: () => run('Reset mixed', () => bridge.reset(repo.path, 'mixed', commit.hash)) },
      {
        label: 'Reset (hard) a este commit',
        danger: true,
        onClick: () =>
          openConfirm({
            title: 'Reset --hard',
            message: `Se descartarán los cambios y la rama apuntará a ${commit.shortHash}. ¿Continuar?`,
            danger: true,
            confirmText: 'Reset --hard',
            onConfirm: () => run('Reset hard', () => bridge.reset(repo.path, 'hard', commit.hash))
          })
      },
      { divider: true },
      {
        label: 'Copiar SHA',
        onClick: () => {
          navigator.clipboard?.writeText(commit.hash)
          notify('success', 'SHA copiado')
        }
      },
      {
        label: 'Copiar hash corto',
        onClick: () => {
          navigator.clipboard?.writeText(commit.shortHash)
          notify('success', 'Hash corto copiado')
        }
      },
      {
        label: 'Copiar mensaje',
        onClick: () => {
          navigator.clipboard?.writeText(commit.subject)
          notify('success', 'Mensaje copiado')
        }
      },
      // Abrir el commit en el proveedor remoto; requiere remoto conocido.
      ...((): MenuItem[] => {
        const refsState = useStore.getState().refs
        const remote =
          refsState?.remotes.find((r) => r.name === refsState.defaultRemote) ?? refsState?.remotes[0]
        const url = remote ? commitWebUrl(remote.fetchUrl, commit.hash) : null
        return [
          {
            label: url ? `Abrir en el proveedor (${remote!.name})` : 'Abrir en el proveedor (sin remoto)',
            disabled: !url,
            onClick: () => url && bridge.openExternal(url)
          }
        ]
      })()
    ])
  }

  return (
    <div
      className={`commit-row${selected ? ' selected' : ''}${isMulti ? ' multi' : ''}${
        isBisectCur ? ' bisect-cur' : ''
      }${isOver && canDrop ? ' drag-over' : ''}${filterState ? ` ${filterState}` : ''}`}
      draggable
      onClick={(e) => onSelect(e, commit.hash)}
      onContextMenu={menu}
      onDragStart={(e) => {
        dragStart({ kind: 'commit', label: commit.shortHash, ref: commit.hash, hash: commit.hash })
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => dragEnd()}
      onDragOver={(e) => {
        if (canDrop) {
          e.preventDefault()
          setOver(overKey)
        }
      }}
      onDragLeave={() => useDrag.getState().overKey === overKey && setOver(null)}
      onDrop={(e) => {
        e.preventDefault()
        const item = useDrag.getState().item
        dragEnd()
        if (!item || !repo || item.kind !== 'branch') return
        openMenu(
          e.clientX,
          e.clientY,
          branchOntoCommitMenu(repo.path, item as DragItem, commit.hash, commit.shortHash, run)
        )
      }}
    >
      <GraphCell
        row={commit.graph}
        width={width}
        laneW={laneW}
        rowH={rowH}
        avatarColor={authorColor(commit.authorEmail || commit.authorName)}
        avatarText={initials(commit.authorName)}
      />
      <div className="subject">
        {commit.refs.map((r, i) => (
          <RefChip key={i} decoration={r} tipHash={commit.hash} />
        ))}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{highlight(commit.subject, query)}</span>
      </div>
      <div className="author" title={`${commit.authorName} <${commit.authorEmail}>`}>
        {highlight(commit.authorName, query)}
      </div>
      <div className="sha">{commit.shortHash}</div>
      <div className="date">{relativeTime(commit.date)}</div>
    </div>
  )
})

export function GraphView(): JSX.Element {
  const log = useStore((s) => s.log)
  const status = useStore((s) => s.status)
  const wipSelected = useStore((s) => s.selection?.kind === 'wip')
  const selHash = useStore((s) => (s.selection?.kind === 'commit' ? s.selection.hash : null))
  const setSelection = useStore((s) => s.setSelection)
  const logHasMore = useStore((s) => s.logHasMore)
  const loadingMore = useStore((s) => s.loadingMore)
  const loadMore = useStore((s) => s.loadMore)
  const branches = useStore((s) => s.branches)
  const refs = useStore((s) => s.refs)
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const notify = useStore((s) => s.notify)
  const bisect = useStore((s) => s.bisect)

  const [input, setInput] = useState('')
  const [filter, setFilter] = useState('')
  const [zoom, setZoom] = useState(1)
  const [showRefs, setShowRefs] = useState(true)
  const [searchResults, setSearchResults] = useState<Commit[] | null>(null)
  const [searching, setSearching] = useState(false)
  // Virtualización: primera fila visible y alto del viewport de la lista.
  const [firstRow, setFirstRow] = useState(0)
  const [viewH, setViewH] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  /** Orden actual de hashes mostrados (para rangos con Shift+clic). */
  const orderRef = useRef<string[]>([])

  const laneW = LANE_W_BASE * zoom
  const rowH = ROW_H_BASE * zoom

  // Filtro en vivo con debounce de 150 ms (input inmediato → filter aplicado).
  useEffect(() => {
    const t = setTimeout(() => setFilter(input.trim()), 150)
    return () => clearTimeout(t)
  }, [input])

  // Atajo Ctrl+Alt+F: enfoca la caja de filtro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Zoom con Ctrl + rueda (listener no pasivo para poder cancelar el scroll).
  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const hasLog = !!log

  // Observa el alto del viewport de la lista (virtualización).
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    setViewH(el.clientHeight)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasLog])

  // Si cambia la altura de fila (zoom), la primera fila visible se recalcula.
  useEffect(() => {
    const el = listRef.current
    if (el) setFirstRow(Math.floor(el.scrollTop / rowH))
  }, [rowH])

  const q = filter.toLowerCase()

  // Coincidencias sobre los commits ya cargados (filtro client-side).
  const localMatches = useMemo(() => {
    if (!log) return []
    if (!q) return log.commits
    return log.commits.filter((c) => matchCommit(c, q))
  }, [log, q])

  // Si no hay coincidencias cargadas y aún queda historial, busca en git.
  useEffect(() => {
    let cancelled = false
    if (!repo || !q || localMatches.length > 0 || !logHasMore) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    bridge
      .logPage(repo.path, { grep: filter, maxCount: 300 })
      .then((page) => !cancelled && setSearchResults(page.commits))
      .catch(() => !cancelled && setSearchResults(null))
      .finally(() => !cancelled && setSearching(false))
    return () => {
      cancelled = true
    }
  }, [repo, filter, q, localMatches.length, logHasMore])

  const inServerSearch = !!(q && searchResults)

  // Modo atenuado: hay filtro y sí hay coincidencias entre los commits cargados.
  // En ese caso se conserva el grafo completo (topología intacta) y se apagan
  // las filas que no coinciden, en vez de reconstruir el grafo solo con ellas.
  const dimMode = !!q && localMatches.length > 0

  // Grafo a mostrar: historial completo (sin filtro o en modo atenuado) o el
  // resultado de buscar en el resto del historial cuando no había coincidencias
  // cargadas.
  const displayLog = useMemo(() => {
    if (!q || dimMode) return log
    if (searchResults) return buildGraph(searchResults)
    return buildGraph([])
  }, [q, dimMode, log, searchResults])

  // Hashes que coinciden con el filtro (para atenuar/resaltar sin rehacer el grafo).
  const matchSet = useMemo(
    () => (dimMode ? new Set(localMatches.map((c) => c.hash)) : null),
    [dimMode, localMatches]
  )

  orderRef.current = useMemo(() => displayLog?.commits.map((c) => c.hash) ?? [], [displayLog])

  // Salto desde Blame/File History: centra el grafo en el commit pedido.
  const focusCommit = useStore((s) => s.focusCommit)
  useEffect(() => {
    if (!focusCommit || !displayLog) return
    const i = displayLog.commits.findIndex((c) => c.hash === focusCommit)
    if (i >= 0) {
      const changes =
        (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.conflicted.length ?? 0)
      const offset = !q && changes > 0 ? 1 : 0
      const el = listRef.current
      el?.scrollTo({ top: Math.max(0, (i + offset) * rowH - el.clientHeight / 2 + rowH / 2), behavior: 'smooth' })
    }
    useStore.setState({ focusCommit: null })
  }, [focusCommit, displayLog, q, rowH, status])

  // Índice inverso padre → hijo (prefiere el hijo por primer padre).
  const childIndex = useMemo(() => {
    const first = new Map<string, string>()
    const any = new Map<string, string>()
    for (const c of displayLog?.commits ?? []) {
      c.parents.forEach((p, i) => {
        if (i === 0 && !first.has(p)) first.set(p, c.hash)
        if (!any.has(p)) any.set(p, c.hash)
      })
    }
    return { first, any }
  }, [displayLog])

  // Índices (en filas) de las coincidencias para auto-centrar. En un ref para
  // leerlos sin re-disparar el auto-centrado al paginar.
  const matchOrderRef = useRef<number[] | null>(null)
  matchOrderRef.current = useMemo(() => {
    if (!matchSet) return null
    const idx: number[] = []
    displayLog?.commits.forEach((c, i) => {
      if (matchSet.has(c.hash)) idx.push(i)
    })
    return idx
  }, [matchSet, displayLog])

  // Al aplicar/cambiar el filtro, si ninguna coincidencia queda a la vista se
  // centra la primera (evita mostrar solo filas apagadas si el match está lejos).
  // Solo se dispara cuando cambia el filtro aplicado, no al paginar.
  useEffect(() => {
    const mo = matchOrderRef.current
    if (!mo || mo.length === 0) return
    const el = listRef.current
    if (!el) return
    const first = Math.floor(el.scrollTop / rowH)
    const last = first + Math.ceil(el.clientHeight / rowH)
    if (mo.some((i) => i >= first && i <= last)) return
    el.scrollTo({
      top: Math.max(0, mo[0] * rowH - el.clientHeight / 2 + rowH / 2),
      behavior: 'smooth'
    })
  }, [filter, rowH])

  // Ramas/tags cuyo nombre coincide con el filtro (resultados de navegación).
  const refMatches = useMemo(() => {
    if (!q) return [] as { type: 'branch' | 'tag'; name: string; remote?: boolean }[]
    const out: { type: 'branch' | 'tag'; name: string; remote?: boolean }[] = []
    for (const b of branches?.local ?? []) if (b.name.toLowerCase().includes(q)) out.push({ type: 'branch', name: b.name })
    for (const b of branches?.remote ?? []) if (b.name.toLowerCase().includes(q)) out.push({ type: 'branch', name: b.name, remote: true })
    for (const t of refs?.tags ?? []) if (t.name.toLowerCase().includes(q)) out.push({ type: 'tag', name: t.name })
    return out.slice(0, 8)
  }, [q, branches, refs])

  // Selección de filas con soporte de rango (Shift) y alternado (Ctrl/Cmd).
  const onSelectRow = useCallback((e: React.MouseEvent, hash: string) => {
    const s = useStore.getState()
    const order = orderRef.current
    if (e.shiftKey && s.selection?.kind === 'commit') {
      const a = order.indexOf(s.selection.hash)
      const b = order.indexOf(hash)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        s.setMultiSel(order.slice(lo, hi + 1))
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const base = s.multiSel.length
        ? s.multiSel
        : s.selection?.kind === 'commit'
          ? [s.selection.hash]
          : []
      const next = base.includes(hash) ? base.filter((h) => h !== hash) : [...base, hash]
      s.setMultiSel(next)
      return
    }
    s.setSelection({ kind: 'commit', hash })
  }, [])

  if (!log || !displayLog) {
    return (
      <div className="graph-pane">
        <div className="empty">Cargando historial…</div>
      </div>
    )
  }

  // Recorta carriles lejanos: el SVG los clip-ea y el mensaje conserva espacio.
  const visibleCols = Math.min(displayLog.maxCol, MAX_VISIBLE_LANES)
  const width = (visibleCols + 1) * laneW + PAD * 2
  const headCol = displayLog.commits[0]?.graph.col ?? 0
  const changeCount =
    (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.conflicted.length ?? 0)
  const showWip = !q && changeCount > 0
  const wipOffset = showWip ? 1 : 0
  const totalRows = wipOffset + displayLog.commits.length

  const onScroll = (): void => {
    const el = listRef.current
    if (!el) return
    const fr = Math.floor(el.scrollTop / rowH)
    if (fr !== firstRow) setFirstRow(fr)
    if (inServerSearch || !logHasMore || loadingMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) loadMore()
  }

  const scrollToRow = (row: number): void => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: Math.max(0, row * rowH - el.clientHeight / 2 + rowH / 2), behavior: 'smooth' })
  }

  const goToCommit = (hash: string): void => {
    const i = displayLog.commits.findIndex((c) => c.hash === hash)
    if (i < 0) return
    setSelection({ kind: 'commit', hash })
    scrollToRow(i + wipOffset)
  }

  const centerHead = (): void => {
    const head =
      displayLog.commits.find((c) => c.refs.some((r) => r.type === 'head')) ?? displayLog.commits[0]
    if (head) goToCommit(head.hash)
  }

  const goParent = (): void => {
    if (!selHash) return
    const cur = displayLog.commits.find((c) => c.hash === selHash)
    const parent = cur?.parents[0]
    if (parent) goToCommit(parent)
  }

  const goChild = (): void => {
    if (!selHash) return
    const child = childIndex.first.get(selHash) ?? childIndex.any.get(selHash)
    if (child) goToCommit(child)
  }

  const bisectMark = (verdict: 'good' | 'bad'): void => {
    if (!repo) return
    void run(verdict === 'good' ? 'Marcar bueno' : 'Marcar malo', async () => {
      const msg = await bridge.bisectMark(repo.path, verdict)
      const culprit = msg.match(/([0-9a-f]{7,40}) is the first bad commit/)
      if (culprit) notify('success', `Commit culpable: ${culprit[1].slice(0, 7)}`)
      else {
        const line = msg.split('\n').find((l) => l.trim())
        if (line) notify('info', line.trim())
      }
    })
  }

  // Ventana de filas a renderizar (virtualización con altura fija de fila).
  const winStart = Math.max(0, firstRow - OVERSCAN)
  const winEnd = Math.min(totalRows, firstRow + Math.ceil((viewH || 600) / rowH) + OVERSCAN)
  const rows: JSX.Element[] = []
  for (let i = winStart; i < winEnd; i++) {
    if (showWip && i === 0) {
      rows.push(
        <div
          key="wip"
          className={`commit-row${wipSelected ? ' selected' : ''}`}
          onClick={() => setSelection({ kind: 'wip' })}
        >
          <div className="col-graph">
            <svg width={width} height={rowH} viewBox={`0 0 ${width} ${rowH}`}>
              <line
                x1={x(headCol, laneW)}
                y1={rowH / 2}
                x2={x(headCol, laneW)}
                y2={rowH}
                stroke="var(--text-muted)"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
              <circle cx={x(headCol, laneW)} cy={rowH / 2} r={4.5} fill="var(--bg-app)" stroke="var(--text-dim)" strokeWidth={2} />
            </svg>
          </div>
          <div className="subject">
            <Pencil size={13} color="var(--accent)" />
            <span style={{ fontWeight: 600 }}>Cambios sin confirmar</span>
          </div>
          <div className="author">—</div>
          <div className="sha">
            <Circle size={9} />
          </div>
          <div className="date" style={{ color: 'var(--accent)' }}>
            {changeCount} archivo{changeCount !== 1 ? 's' : ''}
          </div>
        </div>
      )
      continue
    }
    const c = displayLog.commits[i - wipOffset]
    if (!c) continue
    const filterState = !matchSet ? '' : matchSet.has(c.hash) ? 'match' : 'dim'
    rows.push(
      <CommitRow
        key={c.hash}
        commit={c}
        width={width}
        laneW={laneW}
        rowH={rowH}
        query={q}
        filterState={filterState}
        onSelect={onSelectRow}
      />
    )
  }

  return (
    <div
      ref={paneRef}
      className={`graph-pane${showRefs ? '' : ' hide-refs'}`}
      style={{
        ['--graph-w' as string]: `${width}px`,
        ['--row-h' as string]: `${rowH}px`,
        ['--graph-scale' as string]: String(zoom)
      }}
    >
      {bisect?.active && (
        <div className="bisect-banner">
          <Search size={14} />
          <span>
            Bisect en curso — probando{' '}
            <code
              className="bb-sha"
              title="Ir al commit"
              onClick={() => bisect.current && goToCommit(bisect.current)}
            >
              {bisect.current?.slice(0, 7) ?? '???????'}
            </code>{' '}
            (detached HEAD)
          </span>
          <span className="spacer" />
          <button className="bb-btn good" title="Este commit funciona" onClick={() => bisectMark('good')}>
            <ThumbsUp size={13} /> Bueno
          </button>
          <button className="bb-btn bad" title="Este commit falla" onClick={() => bisectMark('bad')}>
            <ThumbsDown size={13} /> Malo
          </button>
          <button
            className="bb-btn"
            title="Terminar bisect y volver a la rama original"
            onClick={() => repo && run('Finalizar bisect', () => bridge.bisectReset(repo.path))}
          >
            <FlagOff size={13} /> Finalizar
          </button>
        </div>
      )}
      <div className="graph-filterbar">
        <div className="filter-input">
          <Search size={13} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setInput('')
                setFilter('')
                e.currentTarget.blur()
              }
            }}
            placeholder="Filtrar por mensaje, autor o SHA…"
            spellCheck={false}
          />
          {input && (
            <button className="clear" title="Limpiar (Esc)" onClick={() => { setInput(''); setFilter('') }}>
              <X size={13} />
            </button>
          )}
        </div>
        {refMatches.length > 0 && (
          <div className="ref-results">
            {refMatches.map((m) => (
              <button
                key={`${m.type}:${m.name}`}
                className={`ref-chip ${m.type === 'tag' ? 'tag' : m.remote ? 'remoteBranch' : 'localBranch'}`}
                title={`Checkout ${m.name}`}
                onClick={() => repo && run('Checkout', () => bridge.checkout(repo.path, m.name))}
              >
                {m.type === 'tag' ? <TagIcon /> : m.remote ? <Cloud /> : <GitBranch />}
                {m.name}
              </button>
            ))}
          </div>
        )}
        <div className="filterbar-spacer" />
        <span className="viewing" title="Commits mostrados">
          {searching
            ? 'Buscando…'
            : dimMode
              ? `${localMatches.length} coincidencia${localMatches.length !== 1 ? 's' : ''}`
              : `Viendo ${displayLog.commits.length}`}
          {inServerSearch && ' en historial'}
          {logHasMore && !q && '+'}
        </span>
        <div className="zoom-controls">
          <button title="Centrar en HEAD" onClick={centerHead}>
            <Locate size={14} />
          </button>
          <button title="Ir al commit padre" disabled={!selHash} onClick={goParent}>
            <ChevronsDown size={14} />
          </button>
          <button title="Ir al commit hijo" disabled={!selHash} onClick={goChild}>
            <ChevronsUp size={14} />
          </button>
          <button
            title={showRefs ? 'Contraer referencias (ramas/tags)' : 'Expandir referencias'}
            className={showRefs ? '' : 'toggled'}
            onClick={() => setShowRefs((v) => !v)}
          >
            <Tags size={14} />
          </button>
        </div>
        <div className="zoom-controls">
          <button title="Alejar" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}>
            <ZoomOut size={14} />
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button title="Acercar" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}>
            <ZoomIn size={14} />
          </button>
        </div>
      </div>
      <div className="graph-header">
        <div className="col-graph">Grafo / Mensaje</div>
        <div />
        <div>Autor</div>
        <div>SHA</div>
        <div>Fecha</div>
      </div>
      <div className="commit-list" ref={listRef} onScroll={onScroll}>
        {/* Virtualización: solo se montan las filas visibles (+overscan); el
            resto se representa con la altura total para conservar el scroll. */}
        <div style={{ height: totalRows * rowH, position: 'relative' }}>
          <div style={{ position: 'absolute', top: winStart * rowH, left: 0, right: 0 }}>{rows}</div>
        </div>
        {q && !searching && displayLog.commits.length === 0 && (
          <div className="empty">Sin coincidencias para «{filter}».</div>
        )}
        {loadingMore && <div className="loading-more">Cargando más commits…</div>}
      </div>
    </div>
  )
}

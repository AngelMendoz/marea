import { Fragment, memo, useEffect, useRef, useState, type ReactNode } from 'react'

/** Renderizado progresivo de listas largas (diff, archivo, blame).
 *
 *  Con archivos enormes el coste no está en git sino en crear decenas de miles
 *  de nodos DOM de golpe y en re-renderizarlos con cada cambio del store. Aquí:
 *  - se pintan las primeras `FIRST_ROWS` filas y el resto se añade por tramos al
 *    acercarse al final (scroll), como el historial del grafo;
 *  - las filas van en bloques memoizados: al crecer el límite o re-renderizar
 *    el padre solo se procesa lo nuevo;
 *  - los bloques son fragmentos, así que el DOM y el CSS no cambian. */

export const FIRST_ROWS = 1500
export const STEP_ROWS = 1500
/** Filas por bloque memoizado. */
export const CHUNK_ROWS = 250
/** Longitud máxima visible de una línea (minificados, dumps de una sola línea):
 *  maquetar una línea de varios MB congela la vista. Solo afecta a lo que se
 *  pinta; los parches de stage/descartar usan el texto original. */
export const MAX_LINE_CHARS = 10_000

export function clipLine(text: string): string {
  if (text.length <= MAX_LINE_CHARS) return text
  const rest = text.length - MAX_LINE_CHARS
  return `${text.slice(0, MAX_LINE_CHARS)} … [+${rest.toLocaleString('es')} caracteres]`
}

/** Límite de filas visibles, ampliable por tramos o de una vez. */
export function useRowLimit(): { limit: number; more: () => void; all: () => void } {
  const [limit, setLimit] = useState(FIRST_ROWS)
  return {
    limit,
    more: () => setLimit((l) => l + STEP_ROWS),
    all: () => setLimit(Number.POSITIVE_INFINITY)
  }
}

interface ChunkProps<T> {
  items: readonly T[]
  start: number
  end: number
  renderRow: (item: T, index: number) => ReactNode
}

function ChunkImpl<T>({ items, start, end, renderRow }: ChunkProps<T>): JSX.Element {
  const out: ReactNode[] = []
  for (let i = start; i < end; i++) out.push(<Fragment key={i}>{renderRow(items[i], i)}</Fragment>)
  return <>{out}</>
}
const Chunk = memo(ChunkImpl) as typeof ChunkImpl

/** Pinta `items[0..count)` en bloques memoizados. `renderRow` debe ser estable
 *  (función de módulo o useCallback) para que la memoización sirva. */
export function RowChunks<T>({
  items,
  count,
  renderRow
}: {
  items: readonly T[]
  count: number
  renderRow: (item: T, index: number) => ReactNode
}): JSX.Element {
  const n = Math.min(count, items.length)
  const chunks: JSX.Element[] = []
  for (let s = 0; s < n; s += CHUNK_ROWS) {
    chunks.push(<Chunk key={s} items={items} start={s} end={Math.min(s + CHUNK_ROWS, n)} renderRow={renderRow} />)
  }
  return <>{chunks}</>
}

/** Distancia al final a la que se carga el siguiente tramo. */
const NEAR_PX = 800

/** Contenedor con scroll más cercano (raíz para detectar el final). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

/** Pie «mostrando X de Y»: carga el siguiente tramo al acercarse con el
 *  scroll y ofrece botones para cargar más o todo. */
export function MoreRows({
  shown,
  total,
  onMore,
  onAll
}: {
  shown: number
  total: number
  onMore: () => void
  onAll: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const onMoreRef = useRef(onMore)
  onMoreRef.current = onMore

  useEffect(() => {
    const el = ref.current
    const root = el && scrollParent(el)
    if (!el || !root) return
    let done = false
    // ¿El pie está a menos de NEAR_PX del borde inferior visible?
    const check = (): void => {
      if (done) return
      if (el.getBoundingClientRect().top < root.getBoundingClientRect().bottom + NEAR_PX) {
        done = true
        onMoreRef.current()
      }
    }
    root.addEventListener('scroll', check, { passive: true })
    // Se re-ejecuta con cada tramo: si el pie sigue cerca (scroll rápido o
    // salto al final), se encadena el siguiente sin esperar otro evento.
    check()
    return () => root.removeEventListener('scroll', check)
  }, [shown])

  return (
    <div className="diff-more" ref={ref}>
      <span>
        Mostrando {shown.toLocaleString('es')} de {total.toLocaleString('es')} líneas
      </span>
      <button className="hunk-btn" onClick={onMore}>
        Mostrar más
      </button>
      <button className="hunk-btn" title="Con archivos muy grandes puede tardar" onClick={onAll}>
        Mostrar todo
      </button>
    </div>
  )
}

/** Lista simple: bloques memoizados + carga progresiva. */
export function LazyRows<T>({
  items,
  renderRow
}: {
  items: readonly T[]
  renderRow: (item: T, index: number) => ReactNode
}): JSX.Element {
  const { limit, more, all } = useRowLimit()
  const shown = Math.min(limit, items.length)
  return (
    <>
      <RowChunks items={items} count={shown} renderRow={renderRow} />
      {shown < items.length && <MoreRows shown={shown} total={items.length} onMore={more} onAll={all} />}
    </>
  )
}

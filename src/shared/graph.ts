import type { Commit, CommitWithGraph, GraphRow, GraphSegment, LogResult } from './types'

// Paleta de colores por carril (lane).
export const LANE_COLORS = [
  '#41b9d6', // teal
  '#a87ddb', // purple
  '#5bc873', // green
  '#e8a33d', // orange
  '#e2607b', // pink
  '#5c8df0', // blue
  '#d2d34b', // yellow
  '#56c2b0', // cian verdoso
  '#df6b4f', // red-orange
  '#9a8cff' // violet
]

function colorForCol(col: number): string {
  return LANE_COLORS[col % LANE_COLORS.length]
}

function firstFreeIndex(lanes: (string | null)[]): number {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] == null) return i
  }
  return lanes.length
}

/** Asigna carriles procesando commits de nuevo a viejo: `lanes[c]` es el hash
 *  esperado en la columna c. Cada commit toma el carril que lo esperaba (o abre
 *  uno si es tip), el primer padre hereda la columna, los demás abren carril y
 *  los carriles que también lo esperaban se fusionan hacia el nodo. */
export function buildGraph(commits: Commit[]): LogResult {
  let lanes: (string | null)[] = []
  const rows: GraphRow[] = []
  let globalMaxCol = 0

  for (const commit of commits) {
    const topLanes = lanes.slice()

    const matched: number[] = []
    for (let c = 0; c < topLanes.length; c++) {
      if (topLanes[c] === commit.hash) matched.push(c)
    }

    let col: number
    if (matched.length > 0) {
      col = matched[0]
    } else {
      col = firstFreeIndex(topLanes)
    }

    const bottomLanes = topLanes.slice()
    for (const c of matched) bottomLanes[c] = null
    while (bottomLanes.length <= col) bottomLanes.push(null)
    bottomLanes[col] = null

    const parentCols: number[] = []
    commit.parents.forEach((parent, i) => {
      if (i === 0) {
        bottomLanes[col] = parent
        parentCols.push(col)
      } else {
        const pc = firstFreeIndex(bottomLanes)
        while (bottomLanes.length <= pc) bottomLanes.push(null)
        bottomLanes[pc] = parent
        parentCols.push(pc)
      }
    })

    const segments: GraphSegment[] = []

    // Líneas que pasan de largo (no involucran a este commit): top -> bottom.
    for (let c = 0; c < topLanes.length; c++) {
      if (topLanes[c] == null) continue
      if (matched.includes(c)) continue
      segments.push({ fromCol: c, fromY: 0, toCol: c, toY: 1, color: colorForCol(c) })
    }

    // Líneas entrantes hacia el nodo (mitad superior).
    for (const c of matched) {
      segments.push({ fromCol: c, fromY: 0, toCol: col, toY: 0.5, color: colorForCol(c) })
    }

    // Líneas salientes hacia los padres (mitad inferior).
    for (const pc of parentCols) {
      segments.push({ fromCol: col, fromY: 0.5, toCol: pc, toY: 1, color: colorForCol(pc) })
    }

    let rowMaxCol = col
    for (const s of segments) rowMaxCol = Math.max(rowMaxCol, s.fromCol, s.toCol)
    globalMaxCol = Math.max(globalMaxCol, rowMaxCol)

    rows.push({ col, color: colorForCol(col), segments, maxCol: rowMaxCol })

    while (bottomLanes.length > 0 && bottomLanes[bottomLanes.length - 1] == null) {
      bottomLanes.pop()
    }
    lanes = bottomLanes
  }

  const withGraph: CommitWithGraph[] = commits.map((c, i) => ({ ...c, graph: rows[i] }))
  return { commits: withGraph, maxCol: globalMaxCol }
}

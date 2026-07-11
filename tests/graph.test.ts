import { describe, expect, it } from 'vitest'
import { buildGraph, LANE_COLORS } from '@shared/graph'
import type { Commit } from '@shared/types'

// Helper: crea un commit mínimo para el algoritmo del grafo (solo hash/parents
// importan aquí).
function c(hash: string, parents: string[] = []): Commit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    authorName: 'a',
    authorEmail: 'a@e',
    date: 0,
    subject: hash,
    refs: []
  }
}

describe('buildGraph', () => {
  it('cadena lineal: todos en la columna 0', () => {
    const { commits, maxCol } = buildGraph([c('C', ['B']), c('B', ['A']), c('A', [])])
    expect(commits.map((x) => x.graph.col)).toEqual([0, 0, 0])
    expect(maxCol).toBe(0)
    expect(commits[0].graph.color).toBe(LANE_COLORS[0])
  })

  it('devuelve un GraphRow por cada commit, en el mismo orden', () => {
    const input = [c('C', ['B']), c('B', ['A']), c('A', [])]
    const { commits } = buildGraph(input)
    expect(commits).toHaveLength(3)
    expect(commits.map((x) => x.hash)).toEqual(['C', 'B', 'A'])
  })

  it('rama y merge: el merge abre un segundo carril que luego se fusiona', () => {
    // M es merge de main (P) y feature (F). F sale de A; P sale de A.
    //   M ->  P, F
    //   P ->  A
    //   F ->  A
    //   A
    const { commits, maxCol } = buildGraph([
      c('M', ['P', 'F']),
      c('P', ['A']),
      c('F', ['A']),
      c('A', [])
    ])
    expect(maxCol).toBeGreaterThanOrEqual(1) // hubo bifurcación
    // M debe tener al menos un segmento saliente hacia una segunda columna.
    const outCols = commits[0].graph.segments.filter((s) => s.fromY === 0.5).map((s) => s.toCol)
    expect(Math.max(...outCols)).toBeGreaterThanOrEqual(1)
    // A recoge las dos ramas: entra material desde >1 columna (fusión).
    const aRow = commits[3].graph
    expect(aRow.col).toBe(0)
  })

  it('los colores por carril son cíclicos sobre LANE_COLORS', () => {
    // Fuerza muchas ramas paralelas: N tips independientes.
    const many: Commit[] = []
    for (let i = 0; i < LANE_COLORS.length + 2; i++) many.push(c(`T${i}`, []))
    const { commits } = buildGraph(many)
    // Cada tip abre su propio carril incremental; el color cicla.
    for (let i = 0; i < commits.length; i++) {
      expect(commits[i].graph.color).toBe(LANE_COLORS[commits[i].graph.col % LANE_COLORS.length])
    }
  })

  it('lista vacía: sin filas, maxCol 0', () => {
    const { commits, maxCol } = buildGraph([])
    expect(commits).toEqual([])
    expect(maxCol).toBe(0)
  })

  it('octopus merge (3 padres) abre dos carriles adicionales', () => {
    const { commits } = buildGraph([
      c('O', ['A', 'B', 'D']),
      c('A', ['D']),
      c('B', ['D']),
      c('D', [])
    ])
    const outCols = commits[0].graph.segments.filter((s) => s.fromY === 0.5).map((s) => s.toCol)
    // Tres destinos de padres distintos.
    expect(new Set(outCols).size).toBe(3)
  })
})

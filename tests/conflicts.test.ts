import { describe, expect, it } from 'vitest'
import { buildOutput, parseConflicts, type ConflictChoice } from '@/lib/conflicts'

const SIMPLE = `linea comun
<<<<<<< HEAD
nuestro
=======
suyo
>>>>>>> branch
final`

const DIFF3 = `<<<<<<< HEAD
nuestro
||||||| base
original
=======
suyo
>>>>>>> feature`

describe('parseConflicts', () => {
  it('divide texto y bloque de conflicto simple', () => {
    const p = parseConflicts(SIMPLE)
    expect(p.count).toBe(1)
    const conflict = p.chunks.find((ch) => ch.kind === 'conflict')
    expect(conflict).toBeTruthy()
    if (conflict?.kind === 'conflict') {
      expect(conflict.block.ours).toEqual(['nuestro'])
      expect(conflict.block.theirs).toEqual(['suyo'])
      expect(conflict.block.oursLabel).toBe('HEAD')
      expect(conflict.block.theirsLabel).toBe('branch')
      expect(conflict.block.base).toBeUndefined()
    }
    // El texto de alrededor se conserva.
    const texts = p.chunks.filter((ch) => ch.kind === 'text')
    expect(texts.length).toBe(2)
  })

  it('estilo diff3 captura la base', () => {
    const p = parseConflicts(DIFF3)
    const conflict = p.chunks.find((ch) => ch.kind === 'conflict')
    if (conflict?.kind === 'conflict') {
      expect(conflict.block.base).toEqual(['original'])
      expect(conflict.block.ours).toEqual(['nuestro'])
      expect(conflict.block.theirs).toEqual(['suyo'])
    } else {
      throw new Error('esperaba un conflicto')
    }
  })

  it('marcador huérfano se trata como texto (no pierde contenido)', () => {
    const orphan = `hola\n<<<<<<< HEAD\nsin cierre\nmundo`
    const p = parseConflicts(orphan)
    expect(p.count).toBe(0)
    const joined = p.chunks
      .filter((ch) => ch.kind === 'text')
      .flatMap((ch) => (ch.kind === 'text' ? ch.lines : []))
      .join('\n')
    expect(joined).toContain('<<<<<<< HEAD')
    expect(joined).toContain('sin cierre')
  })

  it('múltiples conflictos con índices incrementales', () => {
    const two = `${SIMPLE}\n${SIMPLE}`
    const p = parseConflicts(two)
    expect(p.count).toBe(2)
    const idxs = p.chunks.filter((ch) => ch.kind === 'conflict').map((ch) => (ch.kind === 'conflict' ? ch.index : -1))
    expect(idxs).toEqual([0, 1])
  })
})

describe('buildOutput', () => {
  it('elige ours', () => {
    const p = parseConflicts(SIMPLE)
    const choices: ConflictChoice[] = [{ ours: new Set([0]), theirs: new Set() }]
    expect(buildOutput(p, choices)).toBe(['linea comun', 'nuestro', 'final'].join('\n'))
  })

  it('elige theirs', () => {
    const p = parseConflicts(SIMPLE)
    const choices: ConflictChoice[] = [{ ours: new Set(), theirs: new Set([0]) }]
    expect(buildOutput(p, choices)).toBe(['linea comun', 'suyo', 'final'].join('\n'))
  })

  it('combina ambos lados (ours luego theirs)', () => {
    const p = parseConflicts(SIMPLE)
    const choices: ConflictChoice[] = [{ ours: new Set([0]), theirs: new Set([0]) }]
    expect(buildOutput(p, choices)).toBe(['linea comun', 'nuestro', 'suyo', 'final'].join('\n'))
  })

  it('descarta ambos lados deja solo el texto de alrededor', () => {
    const p = parseConflicts(SIMPLE)
    const choices: ConflictChoice[] = [{ ours: new Set(), theirs: new Set() }]
    expect(buildOutput(p, choices)).toBe(['linea comun', 'final'].join('\n'))
  })
})

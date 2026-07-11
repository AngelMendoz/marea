import { describe, expect, it } from 'vitest'
import { buildLinePatch, parseDiff, splitHunks, toSplitRows } from '@/lib/parseDiff'

const DIFF = `diff --git a/file.txt b/file.txt
index 111..222 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 uno
-dos
+DOS
+tres
 cuatro`

describe('parseDiff', () => {
  it('clasifica meta/hunk/ctx/add/del y numera líneas', () => {
    const lines = parseDiff(DIFF)
    const kinds = lines.map((l) => l.kind)
    expect(kinds).toContain('meta')
    expect(kinds).toContain('hunk')
    const add = lines.find((l) => l.kind === 'add' && l.text === 'DOS')
    const del = lines.find((l) => l.kind === 'del' && l.text === 'dos')
    expect(add?.newNo).toBe(2)
    expect(del?.oldNo).toBe(2)
    // La línea de contexto inicial arranca en 1/1.
    const ctx = lines.find((l) => l.kind === 'ctx' && l.text === 'uno')
    expect(ctx).toMatchObject({ oldNo: 1, newNo: 1 })
  })

  it('las líneas de contexto avanzan ambos contadores', () => {
    const lines = parseDiff(DIFF)
    const cuatro = lines.find((l) => l.text === 'cuatro')
    // uno(old1,new1) -dos(old2) +DOS(new2) +tres(new3) cuatro -> old3, new4
    expect(cuatro).toMatchObject({ kind: 'ctx', oldNo: 3, newNo: 4 })
  })
})

describe('splitHunks', () => {
  it('separa un diff en hunks aplicables con cabecera de archivo', () => {
    const hunks = splitHunks(DIFF)
    expect(hunks).toHaveLength(1)
    const h = hunks[0]
    expect(h.header).toMatch(/^@@ -1,3 \+1,4 @@/)
    expect(h.fileHeader).toContain('diff --git a/file.txt b/file.txt')
    expect(h.patch).toContain(h.fileHeader)
    expect(h.patch).toContain(h.header)
    // body alineado con lines (sin la cabecera @@).
    expect(h.body.length).toBe(h.lines.length)
  })

  it('múltiples hunks', () => {
    const multi = `diff --git a/f b/f
index 1..2 100644
--- a/f
+++ b/f
@@ -1,1 +1,1 @@
-a
+A
@@ -10,1 +10,1 @@
-b
+B`
    const hunks = splitHunks(multi)
    expect(hunks).toHaveLength(2)
    expect(hunks[1].header).toContain('-10,1 +10,1')
  })
})

describe('buildLinePatch', () => {
  it('forward (stage): + no seleccionada se omite; - no seleccionada vuelve a contexto', () => {
    const h = splitHunks(DIFF)[0]
    // body: [' uno', '-dos', '+DOS', '+tres', ' cuatro']
    // Selecciona solo el borrado (índice 1) → el + queda fuera.
    const selected = new Set([1])
    const patch = buildLinePatch(h, selected, 'forward')
    expect(patch).not.toBeNull()
    expect(patch).toContain('-dos')
    // Los + no seleccionados NO deben aparecer como añadidos.
    expect(patch).not.toMatch(/^\+DOS/m)
  })

  it('forward: seleccionar solo un + mantiene los - como contexto', () => {
    const h = splitHunks(DIFF)[0]
    // Selecciona solo '+DOS' (índice 2). El '-dos' (índice 1) pasa a contexto.
    const patch = buildLinePatch(h, new Set([2]), 'forward')!
    expect(patch).toContain('+DOS')
    expect(patch).toMatch(/^ dos$/m) // -dos convertida en contexto ' dos'
  })

  it('reverse (unstage/discard): + no seleccionada pasa a contexto', () => {
    const h = splitHunks(DIFF)[0]
    const patch = buildLinePatch(h, new Set([3]), 'reverse')! // solo '+tres'
    expect(patch).toContain('+tres')
    expect(patch).toMatch(/^ DOS$/m) // +DOS no seleccionada → contexto
  })

  it('sin selección de cambios → null', () => {
    const h = splitHunks(DIFF)[0]
    expect(buildLinePatch(h, new Set(), 'forward')).toBeNull()
  })
})

describe('toSplitRows', () => {
  it('empareja bloques -/+ lado a lado', () => {
    const rows = toSplitRows(parseDiff(DIFF))
    // Debe haber una fila de hunk.
    expect(rows.some((r) => r.hunk)).toBe(true)
    // Fila con del a la izquierda y add a la derecha (dos / DOS).
    const paired = rows.find((r) => r.left?.text === 'dos' && r.right?.text === 'DOS')
    expect(paired).toBeTruthy()
    // La '+tres' extra queda solo a la derecha.
    const rightOnly = rows.find((r) => !r.left && r.right?.text === 'tres')
    expect(rightOnly).toBeTruthy()
  })

  it('contexto va a ambos lados', () => {
    const rows = toSplitRows(parseDiff(DIFF))
    const ctx = rows.find((r) => r.left?.kind === 'ctx' && r.left.text === 'uno')
    expect(ctx?.right?.text).toBe('uno')
  })
})

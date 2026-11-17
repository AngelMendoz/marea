import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { kindByExt, looksBinary } from '../src/shared/fileKinds'
import { commitFile, gitService, newRepo, raw } from './helpers'

/** PNG mínimo (1×1) y un "binario" con bytes NUL y extensión desconocida. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex'
)
const BLOB = Buffer.concat([Buffer.from('cabecera'), Buffer.alloc(16), Buffer.from('resto')])

describe('archivos binarios', () => {
  it('clasifica por extensión y por contenido', () => {
    expect(kindByExt('docs/manual.PDF')).toBe('pdf')
    expect(kindByExt('img/logo.png')).toBe('image')
    expect(kindByExt('datos/ventas.xlsx')).toBe('binary')
    expect(kindByExt('src/app.ts')).toBe('text')
    expect(kindByExt('Makefile')).toBe('text')
    expect(looksBinary(BLOB)).toBe(true)
    expect(looksBinary(Buffer.from('texto plano\n'))).toBe(false)
  })

  it('fileInfo da tipo, tamaños y versiones a cada lado del cambio', async () => {
    const repo = await newRepo()
    writeFileSync(join(repo, 'logo.png'), PNG)
    raw(repo, ['add', 'logo.png'])
    raw(repo, ['commit', '-m', 'logo'])
    const sha = raw(repo, ['rev-parse', 'HEAD']).trim()

    // Commit raíz: el archivo es nuevo (no hay padre).
    const inCommit = await gitService.fileInfo(repo, { file: 'logo.png', commit: sha })
    expect(inCommit.kind).toBe('image')
    expect(inCommit.old.size).toBeNull()
    expect(inCommit.new.size).toBe(PNG.length)

    // Working tree modificado: índice → disco.
    const bigger = Buffer.concat([PNG, Buffer.alloc(10)])
    writeFileSync(join(repo, 'logo.png'), bigger)
    const wip = await gitService.fileInfo(repo, { file: 'logo.png' })
    expect(wip.old.size).toBe(PNG.length)
    expect(wip.new.size).toBe(bigger.length)
    expect(wip.old.sig).not.toBe(wip.new.sig)
  })

  it('detecta binarios de extensión desconocida mirando el contenido', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'notas.txt', 'hola\n', 'c1')
    writeFileSync(join(repo, 'datos.raw2'), BLOB)
    expect((await gitService.fileInfo(repo, { file: 'datos.raw2' })).kind).toBe('binary')
    expect((await gitService.fileInfo(repo, { file: 'notas.txt' })).kind).toBe('text')
    // fileContent no decodifica binarios como texto.
    expect(await gitService.fileContent(repo, { file: 'datos.raw2' })).toBe('')
    expect(await gitService.fileContent(repo, { file: 'notas.txt' })).toBe('hola\n')
  })

  it('fileBlob devuelve los bytes exactos de cada versión', async () => {
    const repo = await newRepo()
    writeFileSync(join(repo, 'logo.png'), PNG)
    raw(repo, ['add', 'logo.png'])
    raw(repo, ['commit', '-m', 'logo'])
    const changed = Buffer.concat([PNG, Buffer.from([1, 2, 3])])
    writeFileSync(join(repo, 'logo.png'), changed)

    const oldBytes = await gitService.fileBlob(repo, { file: 'logo.png' }, 'old')
    const newBytes = await gitService.fileBlob(repo, { file: 'logo.png' }, 'new')
    expect(Buffer.from(oldBytes).equals(PNG)).toBe(true)
    expect(Buffer.from(newBytes).equals(changed)).toBe(true)
    await expect(gitService.fileBlob(repo, { file: 'logo.png' }, 'old', 10)).rejects.toThrow()

    // Copia temporal de una versión del índice, con el mismo nombre.
    const out = await gitService.exportFileVersion(repo, { file: 'logo.png' }, 'old')
    expect(out.endsWith('logo.png')).toBe(true)
    expect(readFileSync(out).equals(PNG)).toBe(true)
  })

  it('no lee fuera del repositorio', async () => {
    const repo = await newRepo()
    await expect(gitService.fileBlob(repo, { file: '../fuera.png' }, 'new')).rejects.toThrow()
    expect(await gitService.fileContent(repo, { file: '../fuera.txt' })).toBe('')
  })
})

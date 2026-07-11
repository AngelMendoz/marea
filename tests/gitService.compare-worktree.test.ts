import { existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { commitFile, gitService, newRepo, raw, tmp, write } from './helpers'

describe('comparaciones y file history', () => {
  it('diffRefs entre dos commits y a tres puntos', async () => {
    const repo = await newRepo()
    const a = await commitFile(repo, 'f.txt', 'uno\n', 'c1')
    const b = await commitFile(repo, 'f.txt', 'dos\n', 'c2')
    const diff = await gitService.diffRefs(repo, { a, b })
    expect(diff).toContain('-uno')
    expect(diff).toContain('+dos')

    const files = await gitService.diffRefsFiles(repo, { a, b })
    expect(files.find((f) => f.path === 'f.txt')?.type).toBe('modified')
  })

  it('diffRefsFiles detecta renombrados con -M', async () => {
    const repo = await newRepo()
    const a = await commitFile(repo, 'viejo.txt', 'contenido largo\nlinea 2\nlinea 3\n', 'c1')
    raw(repo, ['mv', 'viejo.txt', 'nuevo.txt'])
    await gitService.stageAll(repo)
    await gitService.commit(repo, 'rename')
    const b = raw(repo, ['rev-parse', 'HEAD']).trim()
    const files = await gitService.diffRefsFiles(repo, { a, b })
    const renamed = files.find((f) => f.type === 'renamed')
    expect(renamed?.oldPath).toBe('viejo.txt')
    expect(renamed?.path).toBe('nuevo.txt')
  })

  it('fileHistory de un archivo con follow sigue renombres', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'orig.txt', 'v1\n', 'crear')
    raw(repo, ['mv', 'orig.txt', 'renombrado.txt'])
    await gitService.stageAll(repo)
    await gitService.commit(repo, 'mover')
    write(repo, 'renombrado.txt', 'v2\n')
    await gitService.stage(repo, ['renombrado.txt'])
    await gitService.commit(repo, 'editar')

    const hist = await gitService.fileHistory(repo, { file: 'renombrado.txt', follow: true })
    expect(hist.length).toBe(3)
    // La entrada más antigua conserva el nombre original.
    expect(hist[hist.length - 1].path).toBe('orig.txt')
  })

  it('blame anota autor y líneas', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'f.txt', 'linea A\nlinea B\n', 'init')
    const blame = await gitService.blame(repo, 'f.txt')
    expect(blame).toHaveLength(2)
    expect(blame[0].author).toBe('Test User')
    expect(blame[0].lineNo).toBe(1)
    expect(blame[0].text).toBe('linea A')
  })

  it('restoreFileVersion recupera una versión anterior', async () => {
    const repo = await newRepo()
    const first = await commitFile(repo, 'f.txt', 'version-1\n', 'c1')
    await commitFile(repo, 'f.txt', 'version-2\n', 'c2')
    await gitService.restoreFileVersion(repo, 'f.txt', first)
    expect(await gitService.fileContent(repo, { file: 'f.txt' })).toBe('version-1\n')
  })
})

describe('worktrees', () => {
  it('add, list, lock/unlock, remove, prune', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    await gitService.createBranch(repo, 'wt-branch')

    const wtDir = join(tmp('marea-wt-'), 'checkout')
    await gitService.worktreeAdd(repo, { dir: wtDir, branch: 'wt-branch' })

    let list = await gitService.worktrees(repo)
    expect(list.length).toBe(2)
    expect(list[0].main).toBe(true)
    const wt = list.find((w) => !w.main)!
    expect(wt.branch).toBe('wt-branch')
    expect(wt.locked).toBe(false)

    await gitService.worktreeLock(repo, wtDir)
    list = await gitService.worktrees(repo)
    expect(list.find((w) => !w.main)!.locked).toBe(true)

    await gitService.worktreeUnlock(repo, wtDir)
    list = await gitService.worktrees(repo)
    expect(list.find((w) => !w.main)!.locked).toBe(false)

    await gitService.worktreeRemove(repo, wtDir)
    list = await gitService.worktrees(repo)
    expect(list.length).toBe(1)

    await gitService.worktreePrune(repo) // no debe lanzar
  })
})

describe('applyPatch (stage/unstage/discard por hunk)', () => {
  it('stage aplica un hunk al índice sin tocar el resto', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'f.txt', 'a\nb\nc\n', 'init')
    write(repo, 'f.txt', 'A\nb\nc\n') // cambia la primera línea

    const diff = await gitService.diff(repo, { file: 'f.txt' })
    await gitService.applyPatch(repo, diff, 'stage')

    const st = await gitService.status(repo)
    expect(st.staged.find((x) => x.path === 'f.txt')?.type).toBe('modified')
    // El índice contiene la nueva versión.
    expect(await gitService.fileContent(repo, { file: 'f.txt', staged: true })).toBe('A\nb\nc\n')
  })

  it('discard revierte un hunk del working tree', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'f.txt', 'a\nb\nc\n', 'init')
    write(repo, 'f.txt', 'a\nB\nc\n')
    const diff = await gitService.diff(repo, { file: 'f.txt' })
    await gitService.applyPatch(repo, diff, 'discard')
    // Vuelve al contenido commiteado.
    expect(existsSync(join(repo, 'f.txt'))).toBe(true)
    expect(raw(repo, ['diff', '--', 'f.txt'])).toBe('')
  })
})

describe('config', () => {
  it('getConfig / setConfig local y borrado con valor vacío', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')

    await gitService.setConfig(repo, 'marea.test', 'valor')
    let cfg = await gitService.getConfig(repo, ['marea.test'])
    expect(cfg['marea.test']).toBe('valor')

    await gitService.setConfig(repo, 'marea.test', '') // borra
    cfg = await gitService.getConfig(repo, ['marea.test', 'no.existe'])
    expect(cfg['marea.test']).toBe('')
    expect(cfg['no.existe']).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { commitFile, gitService, newRepo, raw, tmp } from './helpers'

// bare repo local para pruebas de remoto sin red.
async function newBare(): Promise<string> {
  const dir = tmp('marea-bare-')
  raw(dir, ['init', '--bare'])
  return dir
}

describe('ramas', () => {
  it('crear, checkout, renombrar y eliminar', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')

    await gitService.createBranch(repo, 'feature', { checkout: true })
    let list = await gitService.branches(repo)
    expect(list.current).toBe('feature')

    await gitService.renameBranch(repo, 'feature', 'feat2')
    list = await gitService.branches(repo)
    expect(list.local.some((b) => b.name === 'feat2')).toBe(true)

    await gitService.checkout(repo, list.local.find((b) => b.name !== 'feat2')!.name)
    await gitService.deleteBranch(repo, 'feat2', true)
    list = await gitService.branches(repo)
    expect(list.local.some((b) => b.name === 'feat2')).toBe(false)
  })

  it('createBranch desde un start point concreto', async () => {
    const repo = await newRepo()
    const first = await commitFile(repo, 'a.txt', '1', 'c1')
    await commitFile(repo, 'a.txt', '2', 'c2')
    await gitService.createBranch(repo, 'desde-c1', { startPoint: first, checkout: true })
    expect(raw(repo, ['rev-parse', 'HEAD']).trim()).toBe(first)
  })

  it('branches reporta ahead/behind respecto al upstream', async () => {
    const local = await newRepo()
    const bare = await newBare()

    // repo local con commits, push a bare, luego 1 commit por delante.
    await commitFile(local, 'a.txt', '1', 'c1')
    await gitService.addRemote(local, 'origin', bare)
    await gitService.push(local, { setUpstream: true, remote: 'origin' })
    await commitFile(local, 'a.txt', '2', 'c2') // 1 ahead

    await gitService.fetch(local)
    const list = await gitService.branches(local)
    const cur = list.local.find((b) => b.current)!
    expect(cur.upstream).toContain('origin/')
    expect(cur.ahead).toBe(1)
  })
})

describe('merge, rebase, cherry-pick, revert, reset', () => {
  it('merge no-ff crea commit de merge', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base', 'init')
    const main = (await gitService.branches(repo)).current
    await gitService.createBranch(repo, 'rama', { checkout: true })
    await commitFile(repo, 'b.txt', 'x', 'en rama')
    await gitService.checkout(repo, main)
    await gitService.merge(repo, 'rama', { noFf: true })
    const head = (await gitService.logPage(repo)).commits[0]
    expect(head.parents.length).toBe(2)
  })

  it('mergeInto squash aplica cambios sin merge de historia', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base', 'init')
    const main = (await gitService.branches(repo)).current
    await gitService.createBranch(repo, 'rama', { checkout: true })
    await commitFile(repo, 'b.txt', 'x', 'trabajo')
    await gitService.mergeInto(repo, 'rama', main, 'squash')
    expect(raw(repo, ['show', 'HEAD:b.txt'])).toBe('x')
    const head = (await gitService.logPage(repo, { all: false })).commits[0]
    expect(head.parents.length).toBe(1) // squash: sin doble padre
  })

  it('rebaseOnto reaplica commits encima de otra rama', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base', 'base')
    const main = (await gitService.branches(repo)).current
    await gitService.createBranch(repo, 'topic', { checkout: true })
    await commitFile(repo, 'topic.txt', '1', 'topic1')
    await gitService.checkout(repo, main)
    await commitFile(repo, 'main.txt', '1', 'main1')
    await gitService.rebaseOnto(repo, 'topic', main)
    // topic ahora contiene main.txt (rebasado encima de main).
    const files = raw(repo, ['ls-files']).trim().split('\n')
    expect(files).toContain('main.txt')
    expect(files).toContain('topic.txt')
  })

  it('cherryPick trae un commit concreto', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base', 'init')
    const main = (await gitService.branches(repo)).current
    await gitService.createBranch(repo, 'src', { checkout: true })
    const sha = await commitFile(repo, 'nuevo.txt', 'x', 'feature')
    await gitService.checkout(repo, main)
    await gitService.cherryPick(repo, sha)
    expect(raw(repo, ['show', 'HEAD:nuevo.txt'])).toBe('x')
  })

  it('revert invierte un commit', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base\n', 'init')
    const sha = await commitFile(repo, 'a.txt', 'cambiado\n', 'cambio')
    await gitService.revert(repo, sha)
    expect(raw(repo, ['show', 'HEAD:a.txt'])).toBe('base\n')
  })

  it('reset hard/soft/mixed', async () => {
    const repo = await newRepo()
    const first = await commitFile(repo, 'a.txt', '1', 'c1')
    await commitFile(repo, 'a.txt', '2', 'c2')

    await gitService.reset(repo, 'soft', first)
    // soft: HEAD movido pero el cambio queda staged.
    expect(raw(repo, ['rev-parse', 'HEAD']).trim()).toBe(first)
    const st = await gitService.status(repo)
    expect(st.staged.find((f) => f.path === 'a.txt')).toBeTruthy()

    await gitService.reset(repo, 'hard', first)
    expect(raw(repo, ['show', 'HEAD:a.txt'])).toBe('1')
  })

  it('resetBranchTo resetea una rama concreta', async () => {
    const repo = await newRepo()
    const first = await commitFile(repo, 'a.txt', '1', 'c1')
    await commitFile(repo, 'a.txt', '2', 'c2')
    const main = (await gitService.branches(repo)).current
    await gitService.createBranch(repo, 'otra', { checkout: true })
    await gitService.checkout(repo, main)
    await gitService.resetBranchTo(repo, 'otra', first, 'hard')
    expect(raw(repo, ['rev-parse', 'otra']).trim()).toBe(first)
  })
})

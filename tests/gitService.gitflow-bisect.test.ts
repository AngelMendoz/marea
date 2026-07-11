import { describe, expect, it } from 'vitest'
import { commitFile, gitService, newRepo, raw } from './helpers'

/** Repo con rama base 'main' garantizada (independiente del init.defaultBranch). */
async function repoOnMain(): Promise<string> {
  const repo = await newRepo()
  await commitFile(repo, 'a.txt', '1', 'init')
  const cur = (await gitService.branches(repo)).current
  if (cur !== 'main') raw(repo, ['branch', '-m', cur, 'main'])
  return repo
}

describe('gitflow', () => {
  it('config sin inicializar propone defaults', async () => {
    const repo = await repoOnMain()
    const cfg = await gitService.gitflowConfig(repo)
    expect(cfg.initialized).toBe(false)
    expect(cfg.master).toBe('main')
    expect(cfg.develop).toBe('develop')
    expect(cfg.featurePrefix).toBe('feature/')
  })

  it('init crea develop y persiste config', async () => {
    const repo = await repoOnMain()
    const cfg = await gitService.gitflowConfig(repo)
    await gitService.gitflowInit(repo, cfg)

    const after = await gitService.gitflowConfig(repo)
    expect(after.initialized).toBe(true)
    expect((await gitService.branches(repo)).local.some((b) => b.name === 'develop')).toBe(true)
    // Tras init, queda en develop.
    expect((await gitService.branches(repo)).current).toBe('develop')
  })

  it('start feature crea rama con prefijo desde develop', async () => {
    const repo = await repoOnMain()
    await gitService.gitflowInit(repo, await gitService.gitflowConfig(repo))
    await gitService.gitflowStart(repo, 'feature', 'login')
    expect((await gitService.branches(repo)).current).toBe('feature/login')
  })

  it('finish feature hace merge --no-ff en develop y borra la rama', async () => {
    const repo = await repoOnMain()
    await gitService.gitflowInit(repo, await gitService.gitflowConfig(repo))
    await gitService.gitflowStart(repo, 'feature', 'x')
    await commitFile(repo, 'feature.txt', 'contenido', 'trabajo en feature')
    await gitService.gitflowFinish(repo, 'feature', 'x')

    const branches = await gitService.branches(repo)
    expect(branches.current).toBe('develop')
    expect(branches.local.some((b) => b.name === 'feature/x')).toBe(false)
    // develop contiene el archivo y un commit de merge.
    expect(raw(repo, ['show', 'HEAD:feature.txt'])).toBe('contenido')
    expect((await gitService.logPage(repo, { all: false })).commits[0].parents).toHaveLength(2)
  })

  it('finish release crea tag en master y mergea a develop', async () => {
    const repo = await repoOnMain()
    await gitService.gitflowInit(repo, await gitService.gitflowConfig(repo))
    await gitService.gitflowStart(repo, 'release', '1.0.0')
    await commitFile(repo, 'rel.txt', 'x', 'preparar release')
    await gitService.gitflowFinish(repo, 'release', '1.0.0', { tag: true, tagName: 'v1.0.0' })

    // Tag creado y master avanzó.
    expect(raw(repo, ['tag']).trim()).toContain('v1.0.0')
    expect(raw(repo, ['branch']).trim()).toContain('develop')
    // La rama release desaparece.
    expect((await gitService.branches(repo)).local.some((b) => b.name === 'release/1.0.0')).toBe(false)
  })

  it('start sin init lanza error', async () => {
    const repo = await repoOnMain()
    await expect(gitService.gitflowStart(repo, 'feature', 'x')).rejects.toThrow()
  })
})

describe('git bisect', () => {
  it('flujo completo: start, mark good/bad, encuentra el primer malo, reset', async () => {
    const repo = await newRepo()
    // Historia: c0 (bueno) ... introducimos el "fallo" en c3.
    const good = await commitFile(repo, 'f.txt', 'ok\n', 'c0 bueno')
    await commitFile(repo, 'f.txt', 'ok\n', 'c1')
    await commitFile(repo, 'f.txt', 'ok\n', 'c2')
    await commitFile(repo, 'bug.txt', 'FALLO\n', 'c3 introduce bug')
    const bad = await commitFile(repo, 'f.txt', 'ok\n', 'c4')

    await gitService.bisectStart(repo, { bad, good })
    let state = await gitService.bisectState(repo)
    expect(state.active).toBe(true)

    // Bucle de bisección: en cada paso marcamos según exista bug.txt.
    let result = ''
    for (let i = 0; i < 10; i++) {
      const hasBug = raw(repo, ['ls-files']).includes('bug.txt')
      result = await gitService.bisectMark(repo, hasBug ? 'bad' : 'good')
      if (result.includes('is the first bad commit')) break
    }
    expect(result).toContain('is the first bad commit')
    expect(result).toContain('c3 introduce bug')

    await gitService.bisectReset(repo)
    expect((await gitService.bisectState(repo)).active).toBe(false)
  })
})

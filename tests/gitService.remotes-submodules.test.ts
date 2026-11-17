import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commitFile, configureRepo, gitService, newRepo, raw, tmp, write } from './helpers'

// Cobertura de las operaciones que no tenían test propio: clone, fetch,
// upstream, rebase, reescritura de commits ya subidos, submódulos, hooks,
// plantillas, firmas y escritura de archivos.

async function newBare(): Promise<string> {
  const dir = tmp('marea-bare-')
  raw(dir, ['init', '--bare'])
  return dir
}

/** Repo con un commit publicado en un remoto bare (`origin`). */
async function publishedRepo(): Promise<{ repo: string; bare: string; main: string }> {
  const repo = await newRepo()
  const bare = await newBare()
  await commitFile(repo, 'a.txt', '1', 'init')
  const main = (await gitService.branches(repo)).current
  await gitService.addRemote(repo, 'origin', bare)
  await gitService.push(repo, { setUpstream: true, remote: 'origin' })
  return { repo, bare, main }
}

describe('clone y fetch', () => {
  it('clone deriva la carpeta del nombre del repo (con .git o barra final)', async () => {
    const { bare } = await publishedRepo()
    const dest = tmp('marea-clone-')
    const target = await gitService.clone({ url: bare.replace(/[\\/]$/, '') + '/', dir: dest })
    expect(existsSync(join(target, 'a.txt'))).toBe(true)
    expect(target.startsWith(dest)).toBe(true)
    expect(target).not.toBe(dest)
  })

  it('fetchRemote / fetchRemoteBranch traen commits nuevos sin tocar la rama local', async () => {
    const { repo, bare, main } = await publishedRepo()
    const other = tmp('marea-clone-')
    raw(other, ['clone', bare, 'c'])
    const clone = join(other, 'c')
    configureRepo(clone)
    await commitFile(clone, 'b.txt', '2', 'remoto')
    raw(clone, ['push', 'origin', main])

    await gitService.fetchRemote(repo, 'origin', { prune: true })
    const st = await gitService.status(repo)
    expect(st.behind).toBe(1)
    expect(existsSync(join(repo, 'b.txt'))).toBe(false)

    await commitFile(clone, 'c.txt', '3', 'remoto 2')
    raw(clone, ['push', 'origin', main])
    await gitService.fetchRemoteBranch(repo, 'origin', main)
    expect((await gitService.status(repo)).behind).toBe(2)
  })

  it('setUpstream configura y quita el upstream', async () => {
    const { repo, main } = await publishedRepo()
    await gitService.setUpstream(repo, main, '')
    expect((await gitService.status(repo)).tracking ?? null).toBeNull()
    await gitService.setUpstream(repo, main, `origin/${main}`)
    expect((await gitService.status(repo)).tracking).toBe(`origin/${main}`)
  })
})

describe('reescribir un commit ya subido', () => {
  it('tras amend el push normal se rechaza y el force push (--force-with-lease) lo reemplaza', async () => {
    const { repo, bare, main } = await publishedRepo()
    const st = await gitService.status(repo)
    expect(st.ahead).toBe(0) // headIsPushed() de la UI: tracking y nada por delante

    await gitService.commit(repo, 'init corregido', { amend: true, messageOnly: true })
    await expect(gitService.push(repo)).rejects.toThrow()
    await gitService.push(repo, { force: true })
    expect(raw(bare, ['log', '-1', '--format=%s', main]).trim()).toBe('init corregido')
  })

  it('eliminar la rama actual no borra nada si el cambio de rama falla', async () => {
    const { repo, main } = await publishedRepo()
    await gitService.createBranch(repo, 'x', { checkout: true })
    await commitFile(repo, 'a.txt', 'x', 'cambio en x')
    write(repo, 'a.txt', 'sin confirmar') // choca con el checkout a main
    await expect(gitService.deleteBranch(repo, 'x', true, { switchTo: main })).rejects.toThrow()
    const list = await gitService.branches(repo)
    expect(list.current).toBe('x')
    expect(list.local.some((b) => b.name === 'x')).toBe(true)
  })

  it('fallbackBranch prefiere la rama anterior y devuelve vacío si no hay otra', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    const main = (await gitService.branches(repo)).current
    expect(await gitService.fallbackBranch(repo, main)).toBe('')
    await gitService.createBranch(repo, 'otra', { checkout: true })
    await gitService.createBranch(repo, 'tercera', { checkout: true })
    expect(await gitService.fallbackBranch(repo, 'tercera')).toBe('otra')
  })
})

describe('rebase y conflictos', () => {
  it('rebase lineal sobre otra rama', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'base')
    const main = (await gitService.branches(repo)).current
    await gitService.createBranch(repo, 'feat', { checkout: true })
    await commitFile(repo, 'f.txt', 'f', 'feat')
    await gitService.checkout(repo, main)
    await commitFile(repo, 'm.txt', 'm', 'main')
    await gitService.checkout(repo, 'feat')
    await gitService.rebase(repo, main)
    const subjects = raw(repo, ['log', '--format=%s']).trim().split('\n')
    expect(subjects).toEqual(['feat', 'main', 'base'])
  })

  it('rebase, cherry-pick, revert y pull con conflicto fallan (no se dan por buenos)', async () => {
    // a.txt: base → «main» en main y → «otra» en la rama `otra`.
    const setup = async (): Promise<{ repo: string; main: string; theirs: string }> => {
      const repo = await newRepo()
      await commitFile(repo, 'a.txt', 'base\n', 'base')
      const main = (await gitService.branches(repo)).current
      await gitService.createBranch(repo, 'otra', { checkout: true })
      const theirs = await commitFile(repo, 'a.txt', 'otra\n', 'otra')
      await gitService.checkout(repo, main)
      await commitFile(repo, 'a.txt', 'main\n', 'main')
      return { repo, main, theirs }
    }
    const conflicted = async (repo: string): Promise<number> => (await gitService.status(repo)).conflicted.length

    let s = await setup()
    await expect(gitService.rebase(s.repo, 'otra')).rejects.toThrow()
    expect((await gitService.operationState(s.repo)).kind).toBe('rebase')

    s = await setup()
    await expect(gitService.cherryPick(s.repo, s.theirs)).rejects.toThrow()
    expect(await conflicted(s.repo)).toBe(1)

    s = await setup()
    await commitFile(s.repo, 'a.txt', 'main 2\n', 'main 2')
    const prev = raw(s.repo, ['rev-parse', 'HEAD~1']).trim()
    await expect(gitService.revert(s.repo, prev)).rejects.toThrow()
    expect(await conflicted(s.repo)).toBe(1)

    // pull: el remoto tiene «otra» y la rama local tiene «main» sobre la misma base.
    const { repo, bare, main } = await publishedRepo()
    const holder = tmp('marea-clone-')
    raw(holder, ['clone', '-q', bare, 'c'])
    const clone = join(holder, 'c')
    configureRepo(clone)
    await commitFile(clone, 'a.txt', 'remoto\n', 'remoto')
    raw(clone, ['push', '-q', 'origin', main])
    await commitFile(repo, 'a.txt', 'local\n', 'local')
    // Sin la config de sistema de Git for Windows (pull.rebase=false), como en
    // Linux/macOS: el modo merge debe integrar igualmente (y aquí, chocar).
    process.env.GIT_CONFIG_NOSYSTEM = '1'
    try {
      await expect(gitService.pull(repo, { mode: 'merge' })).rejects.toThrow(/conflict/i)
    } finally {
      delete process.env.GIT_CONFIG_NOSYSTEM
    }
    expect(await conflicted(repo)).toBe(1)
  })

  it('resolveDelete resuelve un conflicto modificado/borrado quitando el archivo', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'base')
    const main = (await gitService.branches(repo)).current
    await gitService.createBranch(repo, 'borra', { checkout: true })
    raw(repo, ['rm', '-q', 'a.txt'])
    raw(repo, ['commit', '-qm', 'borra a'])
    await gitService.checkout(repo, main)
    await commitFile(repo, 'a.txt', '2', 'modifica a')
    await expect(gitService.merge(repo, 'borra')).rejects.toThrow()
    await gitService.resolveDelete(repo, 'a.txt')
    await gitService.continueOperation(repo)
    expect(existsSync(join(repo, 'a.txt'))).toBe(false)
    expect((await gitService.operationState(repo)).kind).toBeNull()
  })
})

describe('writeFile', () => {
  it('escribe dentro del repo y rechaza rutas que salen de él', async () => {
    const repo = await newRepo()
    await gitService.writeFile(repo, 'nuevo.txt', 'hola')
    expect(readFileSync(join(repo, 'nuevo.txt'), 'utf-8')).toBe('hola')
    await expect(gitService.writeFile(repo, '../fuera.txt', 'x')).rejects.toThrow()
  })
})

describe('submódulos', () => {
  // Git ≥ 2.38.1 prohíbe el transporte file:// en submódulos por defecto.
  const prev = process.env.GIT_ALLOW_PROTOCOL
  beforeAll(() => {
    process.env.GIT_ALLOW_PROTOCOL = 'file'
  })
  afterAll(() => {
    if (prev === undefined) delete process.env.GIT_ALLOW_PROTOCOL
    else process.env.GIT_ALLOW_PROTOCOL = prev
  })

  it('add, listar, set-url, sync, y init/update en un clon', async () => {
    const lib = await newRepo()
    await commitFile(lib, 'lib.txt', 'lib', 'lib')
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')

    await gitService.submoduleAdd(repo, lib, 'libs/lib')
    raw(repo, ['commit', '-qm', 'añade submódulo'])
    let subs = await gitService.submodules(repo)
    expect(subs).toHaveLength(1)
    expect(subs[0].path).toBe('libs/lib')
    expect(subs[0].status).toBe('ok')

    await gitService.submoduleSetUrl(repo, 'libs/lib', lib + '/')
    await gitService.submoduleSync(repo)
    subs = await gitService.submodules(repo)
    expect(subs[0].url).toBe(lib + '/')

    const holder = tmp('marea-clone-')
    raw(holder, ['clone', '-q', repo, 'c'])
    const clone = join(holder, 'c')
    expect((await gitService.submodules(clone))[0].status).toBe('uninitialized')
    await gitService.submoduleInit(clone)
    await gitService.submoduleUpdate(clone, undefined, { init: true, recursive: true })
    expect((await gitService.submodules(clone))[0].status).toBe('ok')
    expect(existsSync(join(clone, 'libs', 'lib', 'lib.txt'))).toBe(true)
  })
})

describe('hooks, plantilla, firma y versión de git', () => {
  it('hooksInfo ignora los .sample', async () => {
    const repo = await newRepo()
    const dir = join(repo, 'hooks-propios')
    mkdirSync(dir)
    writeFileSync(join(dir, 'pre-commit'), '#!/bin/sh\nexit 0\n')
    writeFileSync(join(dir, 'commit-msg.sample'), '')
    raw(repo, ['config', 'core.hooksPath', 'hooks-propios'])
    const info = await gitService.hooksInfo(repo)
    expect(info.hooks).toEqual(['pre-commit'])
    expect(info.dir.endsWith('hooks-propios')).toBe(true)
  })

  it('commitTemplate lee commit.template relativo al repo', async () => {
    const repo = await newRepo()
    expect(await gitService.commitTemplate(repo)).toBe('')
    write(repo, 'plantilla.txt', 'tipo: resumen\n')
    raw(repo, ['config', 'commit.template', 'plantilla.txt'])
    expect(await gitService.commitTemplate(repo)).toBe('tipo: resumen\n')
  })

  it('commitSignature de un commit sin firmar', async () => {
    const repo = await newRepo()
    const sha = await commitFile(repo, 'a.txt', '1', 'init')
    expect((await gitService.commitSignature(repo, sha)).code).toBe('N')
  })

  it('gitVersion devuelve la versión instalada', async () => {
    expect(await gitService.gitVersion()).toMatch(/^git version \d+\.\d+/)
  })
})

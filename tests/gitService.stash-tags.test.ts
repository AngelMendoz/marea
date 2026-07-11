import { describe, expect, it } from 'vitest'
import { commitFile, gitService, newRepo, raw, tmp, write } from './helpers'

async function newBare(): Promise<string> {
  const dir = tmp('marea-bare-')
  raw(dir, ['init', '--bare'])
  return dir
}

describe('stash', () => {
  it('create, list (refs), apply, pop, drop', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base\n', 'init')
    write(repo, 'a.txt', 'trabajo en curso\n')

    await gitService.stashCreate(repo, 'mi wip')
    let refs = await gitService.refs(repo)
    expect(refs.stashes).toHaveLength(1)
    expect(refs.stashes[0].message).toContain('mi wip')
    // El working tree volvió al estado commiteado.
    expect(raw(repo, ['show', 'HEAD:a.txt'])).toBe('base\n')

    await gitService.stashApply(repo, 0)
    // apply mantiene la entrada.
    refs = await gitService.refs(repo)
    expect(refs.stashes).toHaveLength(1)

    // Limpia el working tree y prueba pop (aplica y elimina).
    await gitService.discard(repo, ['a.txt'])
    await gitService.stashPop(repo, 0)
    refs = await gitService.refs(repo)
    expect(refs.stashes).toHaveLength(0)
  })

  it('stashRename del stash superior conserva el contenido con nuevo mensaje', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base\n', 'init')
    write(repo, 'a.txt', 'cambio\n')
    await gitService.stashCreate(repo, 'viejo')

    await gitService.stashRename(repo, 0, 'nuevo mensaje')
    const refs = await gitService.refs(repo)
    expect(refs.stashes).toHaveLength(1)
    expect(refs.stashes[0].message).toContain('nuevo mensaje')
    // El contenido del stash se conserva.
    expect(raw(repo, ['stash', 'show', '-p', 'stash@{0}'])).toContain('+cambio')
  })

  it('stashRename de un stash no-superior no pierde otros stashes', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base\n', 'init')
    write(repo, 'a.txt', 'primero\n')
    await gitService.stashCreate(repo, 'stash-A')
    write(repo, 'a.txt', 'segundo\n')
    await gitService.stashCreate(repo, 'stash-B') // índice 0; stash-A pasa a 1

    // Renombra el de abajo (índice 1 = stash-A).
    await gitService.stashRename(repo, 1, 'stash-A-renombrado')
    const refs = await gitService.refs(repo)
    expect(refs.stashes).toHaveLength(2)
    const msgs = refs.stashes.map((s) => s.message).join('\n')
    expect(msgs).toContain('stash-A-renombrado')
    expect(msgs).toContain('stash-B')
  })

  it('stashDrop elimina la entrada', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'base\n', 'init')
    write(repo, 'a.txt', 'x\n')
    await gitService.stashCreate(repo, 's1')
    await gitService.stashDrop(repo, 0)
    expect((await gitService.refs(repo)).stashes).toHaveLength(0)
  })
})

describe('tags', () => {
  it('createTag anotado, listado en refs, y delete', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    await gitService.createTag(repo, 'v1.0', { message: 'primera versión' })

    let refs = await gitService.refs(repo)
    const tag = refs.tags.find((t) => t.name === 'v1.0')
    expect(tag).toBeTruthy()
    expect(tag?.annotated).toBe(true)

    await gitService.deleteTag(repo, 'v1.0')
    refs = await gitService.refs(repo)
    expect(refs.tags.some((t) => t.name === 'v1.0')).toBe(false)
  })

  it('tag ligero (sin mensaje) no es anotado', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    await gitService.createTag(repo, 'lite')
    const refs = await gitService.refs(repo)
    expect(refs.tags.find((t) => t.name === 'lite')?.annotated).toBe(false)
  })

  it('renameTag conserva el objeto y borra el viejo', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    await gitService.createTag(repo, 'old', { message: 'x' })
    const before = raw(repo, ['rev-parse', 'old^{commit}']).trim()
    await gitService.renameTag(repo, 'old', 'new')
    const refs = await gitService.refs(repo)
    expect(refs.tags.some((t) => t.name === 'new')).toBe(true)
    expect(refs.tags.some((t) => t.name === 'old')).toBe(false)
    expect(raw(repo, ['rev-parse', 'new^{commit}']).trim()).toBe(before)
  })

  it('pushTag y deleteRemoteTag sobre un bare local', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    const bare = await newBare()
    await gitService.addRemote(repo, 'origin', bare)
    await gitService.push(repo, { setUpstream: true, remote: 'origin' })

    await gitService.createTag(repo, 'v2', { message: 'dos' })
    await gitService.pushTag(repo, 'v2', 'origin')
    expect(raw(bare, ['tag']).trim()).toContain('v2')

    await gitService.deleteRemoteTag(repo, 'origin', 'v2')
    expect(raw(bare, ['tag']).trim()).not.toContain('v2')
  })
})

describe('remotos', () => {
  it('add, refs, setRemoteUrl, rename, remove', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    await gitService.addRemote(repo, 'origin', 'https://example.com/a.git')

    let refs = await gitService.refs(repo)
    expect(refs.remotes.find((r) => r.name === 'origin')?.fetchUrl).toContain('example.com')

    await gitService.setRemoteUrl(repo, 'origin', 'https://example.com/b.git')
    refs = await gitService.refs(repo)
    expect(refs.remotes.find((r) => r.name === 'origin')?.fetchUrl).toContain('/b.git')

    await gitService.renameRemote(repo, 'origin', 'upstream')
    refs = await gitService.refs(repo)
    expect(refs.remotes.some((r) => r.name === 'upstream')).toBe(true)

    await gitService.removeRemote(repo, 'upstream')
    refs = await gitService.refs(repo)
    expect(refs.remotes).toHaveLength(0)
  })

  it('setDefaultRemote se refleja en refs.defaultRemote', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    await gitService.addRemote(repo, 'origin', 'https://example.com/a.git')
    await gitService.addRemote(repo, 'mirror', 'https://example.com/m.git')
    await gitService.setDefaultRemote(repo, 'mirror')
    expect((await gitService.refs(repo)).defaultRemote).toBe('mirror')
  })

  it('setUpstream y deleteRemoteBranch sobre bare local', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    const bare = await newBare()
    await gitService.addRemote(repo, 'origin', bare)
    await gitService.push(repo, { setUpstream: true, remote: 'origin' })

    const main = (await gitService.branches(repo)).current
    await gitService.createBranch(repo, 'temporal', { checkout: true })
    await gitService.push(repo, { setUpstream: true, remote: 'origin', branch: 'temporal' })
    expect(raw(bare, ['branch']).trim()).toContain('temporal')

    await gitService.checkout(repo, main)
    await gitService.deleteRemoteBranch(repo, 'origin', 'temporal')
    expect(raw(bare, ['branch']).trim()).not.toContain('temporal')
  })
})

describe('pull / fetch con bare', () => {
  it('pull trae commits del remoto', async () => {
    const bare = await newBare()
    const a = await newRepo()
    await commitFile(a, 'a.txt', '1', 'c1')
    await gitService.addRemote(a, 'origin', bare)
    await gitService.push(a, { setUpstream: true, remote: 'origin' })

    const branch = (await gitService.branches(a)).current

    // Segundo clon que recibe el push de A.
    const b = await newRepo()
    await gitService.addRemote(b, 'origin', bare)
    await gitService.pull(b, { remote: 'origin', branch })
    expect(raw(b, ['show', 'HEAD:a.txt'])).toBe('1')

    // A hace un commit nuevo y B lo trae (fast-forward explícito).
    await commitFile(a, 'a.txt', '2', 'c2')
    await gitService.push(a, { remote: 'origin' })
    await gitService.pull(b, { mode: 'ff-only', remote: 'origin', branch })
    expect(raw(b, ['show', 'HEAD:a.txt'])).toBe('2')
  })
})

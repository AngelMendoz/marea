import { describe, expect, it } from 'vitest'
import { commitFile, gitService, newRepo, raw, write } from './helpers'

/** Prepara dos ramas que tocan la misma línea (conflicto garantizado al fusionar). */
async function setupConflict(): Promise<string> {
  const repo = await newRepo()
  await commitFile(repo, 'f.txt', 'base\n', 'init')
  const main = (await gitService.branches(repo)).current
  await gitService.createBranch(repo, 'otra', { checkout: true })
  await commitFile(repo, 'f.txt', 'desde-otra\n', 'cambio otra')
  await gitService.checkout(repo, main)
  await commitFile(repo, 'f.txt', 'desde-main\n', 'cambio main')
  return repo
}

describe('operaciones en curso y conflictos', () => {
  it('merge conflictivo → operationState=merge y status.conflicted', async () => {
    const repo = await setupConflict()
    await expect(gitService.merge(repo, 'otra')).rejects.toThrow()

    const op = await gitService.operationState(repo)
    expect(op.kind).toBe('merge')

    const st = await gitService.status(repo)
    expect(st.conflicted.find((f) => f.path === 'f.txt')).toBeTruthy()
  })

  it('conflictVersions expone ours/theirs y working con marcadores', async () => {
    const repo = await setupConflict()
    await gitService.merge(repo, 'otra').catch(() => undefined)
    const v = await gitService.conflictVersions(repo, 'f.txt')
    expect(v.ours).toBe('desde-main\n')
    expect(v.theirs).toBe('desde-otra\n')
    expect(v.working).toContain('<<<<<<<')
    expect(v.working).toContain('>>>>>>>')
  })

  it('keepSide=ours + continue completa el merge', async () => {
    const repo = await setupConflict()
    await gitService.merge(repo, 'otra').catch(() => undefined)
    await gitService.keepSide(repo, 'f.txt', 'ours')
    await gitService.continueOperation(repo)

    expect((await gitService.operationState(repo)).kind).toBeNull()
    expect(raw(repo, ['show', 'HEAD:f.txt'])).toBe('desde-main\n')
    // Merge commit → dos padres.
    expect((await gitService.logPage(repo)).commits[0].parents).toHaveLength(2)
  })

  it('keepSide=theirs conserva el otro lado', async () => {
    const repo = await setupConflict()
    await gitService.merge(repo, 'otra').catch(() => undefined)
    await gitService.keepSide(repo, 'f.txt', 'theirs')
    await gitService.markResolved(repo, ['f.txt'])
    await gitService.continueOperation(repo)
    expect(raw(repo, ['show', 'HEAD:f.txt'])).toBe('desde-otra\n')
  })

  it('abortOperation revierte el merge en curso', async () => {
    const repo = await setupConflict()
    const before = raw(repo, ['rev-parse', 'HEAD']).trim()
    await gitService.merge(repo, 'otra').catch(() => undefined)
    await gitService.abortOperation(repo)
    expect((await gitService.operationState(repo)).kind).toBeNull()
    expect(raw(repo, ['rev-parse', 'HEAD']).trim()).toBe(before)
  })

  it('continue/abort sin operación lanzan error', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    await expect(gitService.continueOperation(repo)).rejects.toThrow()
    await expect(gitService.abortOperation(repo)).rejects.toThrow()
  })
})

describe('rebase interactivo', () => {
  async function threeCommits(): Promise<{ repo: string; base: string; hashes: string[] }> {
    const repo = await newRepo()
    const base = await commitFile(repo, 'a.txt', '0\n', 'base')
    const c1 = await commitFile(repo, 'b.txt', '1\n', 'commit uno')
    const c2 = await commitFile(repo, 'c.txt', '2\n', 'commit dos')
    const c3 = await commitFile(repo, 'd.txt', '3\n', 'commit tres')
    return { repo, base, hashes: [c1, c2, c3] }
  }

  it('commitsSince lista base..HEAD del más viejo al más nuevo', async () => {
    const { repo, base } = await threeCommits()
    const list = await gitService.commitsSince(repo, base)
    expect(list.map((c) => c.subject)).toEqual(['commit uno', 'commit dos', 'commit tres'])
  })

  it('reword cambia el mensaje de un commit', async () => {
    const { repo, base, hashes } = await threeCommits()
    const res = await gitService.interactiveRebase(repo, base, [
      { hash: hashes[0], action: 'pick' },
      { hash: hashes[1], action: 'reword', message: 'commit dos (reescrito)' },
      { hash: hashes[2], action: 'pick' }
    ])
    expect(res.completed).toBe(true)
    const subjects = raw(repo, ['log', '--format=%s', `${base}..HEAD`]).trim().split('\n')
    expect(subjects).toContain('commit dos (reescrito)')
  })

  it('drop elimina un commit', async () => {
    const { repo, base, hashes } = await threeCommits()
    const res = await gitService.interactiveRebase(repo, base, [
      { hash: hashes[0], action: 'pick' },
      { hash: hashes[1], action: 'drop' },
      { hash: hashes[2], action: 'pick' }
    ])
    expect(res.completed).toBe(true)
    const subjects = raw(repo, ['log', '--format=%s', `${base}..HEAD`]).trim().split('\n')
    expect(subjects).not.toContain('commit dos')
    expect(subjects).toContain('commit tres')
  })

  it('squash combina commits en uno', async () => {
    const { repo, base, hashes } = await threeCommits()
    const res = await gitService.interactiveRebase(repo, base, [
      { hash: hashes[0], action: 'pick' },
      { hash: hashes[1], action: 'squash', message: 'uno + dos combinados' },
      { hash: hashes[2], action: 'pick' }
    ])
    expect(res.completed).toBe(true)
    const subjects = raw(repo, ['log', '--format=%s', `${base}..HEAD`]).trim().split('\n')
    // uno y dos combinados → 2 commits en vez de 3.
    expect(subjects).toHaveLength(2)
    expect(subjects).toContain('uno + dos combinados')
  })

  it('reordenar commits', async () => {
    const { repo, base, hashes } = await threeCommits()
    const res = await gitService.interactiveRebase(repo, base, [
      { hash: hashes[2], action: 'pick' },
      { hash: hashes[0], action: 'pick' },
      { hash: hashes[1], action: 'pick' }
    ])
    expect(res.completed).toBe(true)
    // El nuevo orden cronológico (viejo→nuevo) es tres, uno, dos.
    const subjects = raw(repo, ['log', '--reverse', '--format=%s', `${base}..HEAD`]).trim().split('\n')
    expect(subjects).toEqual(['commit tres', 'commit uno', 'commit dos'])
  })

  it('plan que elimina todo o empieza con squash es rechazado', async () => {
    const { repo, base, hashes } = await threeCommits()
    await expect(
      gitService.interactiveRebase(repo, base, hashes.map((h) => ({ hash: h, action: 'drop' as const })))
    ).rejects.toThrow()
    await expect(
      gitService.interactiveRebase(repo, base, [{ hash: hashes[0], action: 'squash' }])
    ).rejects.toThrow()
  })
})

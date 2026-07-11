import { describe, expect, it } from 'vitest'
import { commitFile, gitService, newRepo, raw, tmp, write } from './helpers'

describe('repo lifecycle', () => {
  it('isRepo: false para carpeta normal, true para repo', async () => {
    const plain = tmp()
    expect(await gitService.isRepo(plain)).toBe(false)
    const repo = await newRepo()
    expect(await gitService.isRepo(repo)).toBe(true)
    expect(await gitService.isRepo(join_nonexistent())).toBe(false)
  })

  it('init + open devuelve rama actual', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'hola', 'primero')
    const info = await gitService.open(repo)
    expect(info.isDetached).toBe(false)
    expect(info.currentBranch).toBeTruthy()
    expect(info.name).toBeTruthy()
  })

  it('open detecta detached HEAD', async () => {
    const repo = await newRepo()
    const sha = await commitFile(repo, 'a.txt', '1', 'c1')
    await commitFile(repo, 'a.txt', '2', 'c2')
    await gitService.checkout(repo, sha)
    const info = await gitService.open(repo)
    expect(info.isDetached).toBe(true)
  })

  it('open lanza error en carpeta no-repo', async () => {
    const plain = tmp()
    await expect(gitService.open(plain)).rejects.toThrow()
  })
})

describe('status y staging', () => {
  it('clasifica untracked, staged y modified', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'tracked.txt', 'base', 'init')

    write(repo, 'nuevo.txt', 'contenido')
    write(repo, 'tracked.txt', 'modificado')

    let st = await gitService.status(repo)
    expect(st.unstaged.find((f) => f.path === 'nuevo.txt')?.type).toBe('untracked')
    expect(st.unstaged.find((f) => f.path === 'tracked.txt')?.type).toBe('modified')

    await gitService.stage(repo, ['nuevo.txt'])
    st = await gitService.status(repo)
    expect(st.staged.find((f) => f.path === 'nuevo.txt')?.type).toBe('added')
  })

  it('stageAll / unstage / unstageAll / discard', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'x.txt', 'v1', 'init')
    write(repo, 'x.txt', 'v2')
    write(repo, 'y.txt', 'nuevo')

    await gitService.stageAll(repo)
    let st = await gitService.status(repo)
    expect(st.staged.length).toBe(2)

    await gitService.unstage(repo, ['x.txt'])
    st = await gitService.status(repo)
    expect(st.staged.find((f) => f.path === 'x.txt')).toBeUndefined()

    await gitService.unstageAll(repo)
    st = await gitService.status(repo)
    expect(st.staged.length).toBe(0)

    await gitService.discard(repo, ['x.txt'])
    expect(raw(repo, ['show', 'HEAD:x.txt'])).toBe('v1')
  })

  it('discard elimina también archivos no rastreados', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'init')
    write(repo, 'basura.txt', 'x')
    await gitService.discard(repo, ['basura.txt'])
    const st = await gitService.status(repo)
    expect(st.unstaged.find((f) => f.path === 'basura.txt')).toBeUndefined()
  })
})

describe('commit y amend', () => {
  it('commit crea historial; amend reescribe el último', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'mensaje original')
    write(repo, 'a.txt', '2')
    await gitService.stage(repo, ['a.txt'])
    await gitService.commit(repo, 'mensaje corregido', { amend: true })

    const subjects = raw(repo, ['log', '--format=%s']).trim().split('\n')
    expect(subjects).toEqual(['mensaje corregido'])
    expect(raw(repo, ['show', 'HEAD:a.txt'])).toBe('2')
  })
})

describe('logPage', () => {
  it('pagina con skip/maxCount y marca hasMore', async () => {
    const repo = await newRepo()
    for (let i = 0; i < 5; i++) await commitFile(repo, 'a.txt', `v${i}`, `commit ${i}`)

    const page1 = await gitService.logPage(repo, { maxCount: 2, skip: 0 })
    expect(page1.commits).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    expect(page1.commits[0].subject).toBe('commit 4')

    const page3 = await gitService.logPage(repo, { maxCount: 2, skip: 4 })
    expect(page3.commits).toHaveLength(1)
    expect(page3.hasMore).toBe(false)
  })

  it('filtra por grep (literal) y por autor', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'arreglar login')
    await commitFile(repo, 'b.txt', '2', 'añadir tests')
    await commitFile(repo, 'c.txt', '3', 'arreglar logout')

    const grep = await gitService.logPage(repo, { grep: 'arreglar' })
    expect(grep.commits).toHaveLength(2)

    const byAuthor = await gitService.logPage(repo, { author: 'test@example.com' })
    expect(byAuthor.commits.length).toBeGreaterThanOrEqual(3)

    const none = await gitService.logPage(repo, { author: 'nadie@nope.com' })
    expect(none.commits).toHaveLength(0)
  })

  it('parsea padres, refs y datos del commit', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', '1', 'c1')
    await commitFile(repo, 'a.txt', '2', 'c2')
    const page = await gitService.logPage(repo)
    const head = page.commits[0]
    expect(head.parents).toHaveLength(1)
    expect(head.authorEmail).toBe('test@example.com')
    expect(head.refs.some((r) => r.type === 'head')).toBe(true)
  })
})

describe('diff y commitFiles', () => {
  it('diff del working tree y staged', async () => {
    const repo = await newRepo()
    await commitFile(repo, 'a.txt', 'uno\n', 'init')
    write(repo, 'a.txt', 'dos\n')
    const unstaged = await gitService.diff(repo, { file: 'a.txt' })
    expect(unstaged).toContain('-uno')
    expect(unstaged).toContain('+dos')

    await gitService.stage(repo, ['a.txt'])
    const staged = await gitService.diff(repo, { file: 'a.txt', staged: true })
    expect(staged).toContain('+dos')
  })

  it('commitFiles lista archivos de un commit', async () => {
    const repo = await newRepo()
    const sha = await commitFile(repo, 'a.txt', '1', 'init')
    const files = await gitService.commitFiles(repo, sha)
    expect(files.map((f) => f.path)).toContain('a.txt')
    expect(files[0].type).toBe('added')
  })

  it('fileContent lee working, staged y de un commit', async () => {
    const repo = await newRepo()
    const sha = await commitFile(repo, 'a.txt', 'commit-version', 'init')
    write(repo, 'a.txt', 'working-version')
    expect(await gitService.fileContent(repo, { file: 'a.txt' })).toBe('working-version')
    expect(await gitService.fileContent(repo, { file: 'a.txt', commit: sha })).toBe('commit-version')
    expect(await gitService.fileContent(repo, { file: 'noexiste.txt' })).toBe('')
  })
})

// Ruta que garantizadamente no existe (para isRepo).
function join_nonexistent(): string {
  return tmp() + '__inexistente__'
}

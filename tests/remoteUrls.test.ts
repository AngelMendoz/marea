import { describe, expect, it } from 'vitest'
import { branchWebUrl, commitWebUrl, parseRemoteUrl, repoWebUrl } from '@shared/remoteUrls'

describe('parseRemoteUrl', () => {
  it('GitHub https y ssh → misma base', () => {
    expect(parseRemoteUrl('https://github.com/acme/repo.git')).toEqual({
      kind: 'github',
      base: 'https://github.com/acme/repo'
    })
    expect(parseRemoteUrl('git@github.com:acme/repo.git')).toEqual({
      kind: 'github',
      base: 'https://github.com/acme/repo'
    })
    expect(parseRemoteUrl('ssh://git@github.com/acme/repo')).toEqual({
      kind: 'github',
      base: 'https://github.com/acme/repo'
    })
  })

  it('GitLab con subgrupos', () => {
    expect(parseRemoteUrl('git@gitlab.com:group/sub/repo.git')).toEqual({
      kind: 'gitlab',
      base: 'https://gitlab.com/group/sub/repo'
    })
  })

  it('Bitbucket Cloud', () => {
    expect(parseRemoteUrl('https://bitbucket.org/team/repo.git')).toEqual({
      kind: 'bitbucket',
      base: 'https://bitbucket.org/team/repo'
    })
  })

  it('Azure DevOps https y ssh v3', () => {
    expect(parseRemoteUrl('https://org@dev.azure.com/org/proj/_git/repo')).toEqual({
      kind: 'azure',
      base: 'https://dev.azure.com/org/proj/_git/repo'
    })
    expect(parseRemoteUrl('git@ssh.dev.azure.com:v3/org/proj/repo')).toEqual({
      kind: 'azure',
      base: 'https://dev.azure.com/org/proj/_git/repo'
    })
  })

  it('proveedor desconocido → null', () => {
    expect(parseRemoteUrl('https://example.com/x/y.git')).toBeNull()
    expect(repoWebUrl('file:///tmp/repo')).toBeNull()
  })

  it('recorta espacios y sufijo .git', () => {
    expect(repoWebUrl('  https://github.com/a/b.git  ')).toBe('https://github.com/a/b')
  })
})

describe('branchWebUrl', () => {
  it('rutas por proveedor', () => {
    const gh = 'git@github.com:a/b.git'
    expect(branchWebUrl(gh, 'main')).toBe('https://github.com/a/b/tree/main')
    expect(branchWebUrl('git@gitlab.com:a/b.git', 'main')).toBe('https://gitlab.com/a/b/-/tree/main')
    expect(branchWebUrl('https://bitbucket.org/a/b', 'main')).toBe('https://bitbucket.org/a/b/branch/main')
    expect(branchWebUrl('https://dev.azure.com/o/p/_git/r', 'main')).toBe(
      'https://dev.azure.com/o/p/_git/r?version=GBmain'
    )
  })

  it('conserva las barras de ramas jerárquicas (feature/x)', () => {
    expect(branchWebUrl('git@github.com:a/b.git', 'feature/x')).toBe(
      'https://github.com/a/b/tree/feature/x'
    )
  })

  it('proveedor desconocido → null', () => {
    expect(branchWebUrl('https://example.com/a/b', 'main')).toBeNull()
  })
})

describe('commitWebUrl', () => {
  it('rutas por proveedor', () => {
    const sha = 'abc123'
    expect(commitWebUrl('git@github.com:a/b.git', sha)).toBe('https://github.com/a/b/commit/abc123')
    expect(commitWebUrl('git@gitlab.com:a/b.git', sha)).toBe('https://gitlab.com/a/b/-/commit/abc123')
    expect(commitWebUrl('https://bitbucket.org/a/b', sha)).toBe('https://bitbucket.org/a/b/commits/abc123')
    expect(commitWebUrl('https://dev.azure.com/o/p/_git/r', sha)).toBe(
      'https://dev.azure.com/o/p/_git/r/commit/abc123'
    )
  })
})

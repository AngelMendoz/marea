import { beforeEach, describe, expect, it, vi } from 'vitest'

// El menú al soltar una rama sobre otra solo arma opciones que llaman al
// puente; se sustituye por un doble para ver qué modo de merge se pide.
const mergeInto = vi.fn(async () => undefined)
const rebaseOnto = vi.fn(async () => undefined)
vi.mock('@/bridge', () => ({ bridge: { mergeInto, rebaseOnto } }))
vi.mock('@/components/InteractiveRebase', () => ({ useRebasePanel: { getState: () => ({ openPanel: vi.fn() }) } }))
vi.mock('@/centerView', () => ({ useCenterView: { getState: () => ({ openCompare: vi.fn() }) } }))

const { branchOntoBranchMenu } = await import('@/lib/dropMenus')

type Item = { label?: string; divider?: boolean; onClick?: () => void }

const source = { kind: 'branch', ref: 'prueba-ff', label: 'prueba-ff', hash: 'b' }
const target = { kind: 'branch', ref: 'main', label: 'main', hash: 'a' }
const run = async (_label: string, fn: () => Promise<unknown>): Promise<void> => {
  await fn()
}

function menu(): Item[] {
  return branchOntoBranchMenu('/repo', source as never, target as never, run) as Item[]
}

describe('menú al soltar una rama sobre otra', () => {
  beforeEach(() => mergeInto.mockClear())

  it('«Merge» crea commit de merge (--no-ff), como GitKraken', async () => {
    const item = menu().find((i) => i.label === 'Merge prueba-ff en main')!
    item.onClick!()
    await Promise.resolve()
    expect(mergeInto).toHaveBeenCalledWith('/repo', 'prueba-ff', 'main', 'noff')
  })

  it('el fast-forward sigue disponible como opción aparte', async () => {
    const item = menu().find((i) => i.label?.startsWith('Fast-forward main a prueba-ff'))!
    item.onClick!()
    await Promise.resolve()
    expect(mergeInto).toHaveBeenCalledWith('/repo', 'prueba-ff', 'main', 'ff')
  })

  it('ya no hay una opción duplicada de «Merge sin fast-forward»', () => {
    expect(menu().some((i) => /sin fast-forward/i.test(i.label ?? ''))).toBe(false)
  })

  it('squash y rebase siguen en el menú', () => {
    const labels = menu().map((i) => i.label)
    expect(labels).toContain('Squash merge prueba-ff en main')
    expect(labels).toContain('Rebase main sobre prueba-ff')
  })

  it('ramas en el mismo commit: solo se ofrece comparar', () => {
    const same = branchOntoBranchMenu('/repo', { ...source, hash: 'a' } as never, target as never, run) as Item[]
    expect(same.map((i) => i.label)).toEqual(['Comparar prueba-ff con main'])
  })
})

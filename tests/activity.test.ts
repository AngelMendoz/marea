import { describe, expect, it } from 'vitest'
import { aggregateActivity, type ActivityFetchers } from '@shared/activity'
import type { Issue, PullRequest } from '@shared/types'

function pr(number: number, title: string): PullRequest {
  return {
    number,
    title,
    state: 'open',
    author: 'me',
    head: 'h',
    base: 'main',
    url: `https://x/pr/${number}`,
    draft: false,
    assignees: []
  }
}

function issue(number: number, title: string): Issue {
  return {
    number,
    title,
    state: 'open',
    author: 'me',
    assignees: [],
    labels: [],
    comments: 0,
    createdAt: 0,
    url: `https://x/i/${number}`,
    body: ''
  }
}

describe('aggregateActivity', () => {
  it('reúne PRs, issues y WIP de varios repos', async () => {
    const fetchers: ActivityFetchers = {
      listPullRequests: async (p) => (p === '/a' ? [pr(1, 'PR uno')] : []),
      listIssues: async (p) => (p === '/b' ? [issue(2, 'Issue dos')] : []),
      wipCount: async (p) => (p === '/a' ? 3 : 0)
    }
    const { items, errors } = await aggregateActivity(['/a', '/b'], fetchers)
    expect(errors).toEqual([])
    expect(items.find((i) => i.kind === 'pr')?.title).toBe('PR uno')
    expect(items.find((i) => i.kind === 'issue')?.title).toBe('Issue dos')
    const wip = items.find((i) => i.kind === 'wip')
    expect(wip?.changes).toBe(3)
    expect(wip?.title).toContain('3 archivos')
  })

  it('WIP en singular con un solo archivo, y se omite con 0', async () => {
    const fetchers: ActivityFetchers = {
      listPullRequests: async () => [],
      listIssues: async () => [],
      wipCount: async (p) => (p === '/one' ? 1 : 0)
    }
    const { items } = await aggregateActivity(['/one', '/zero'], fetchers)
    const wips = items.filter((i) => i.kind === 'wip')
    expect(wips).toHaveLength(1)
    expect(wips[0].title).toContain('1 archivo con')
  })

  it('claves estables por repo+tipo+número', async () => {
    const fetchers: ActivityFetchers = {
      listPullRequests: async () => [pr(5, 'x')],
      listIssues: async () => [],
      wipCount: async () => 0
    }
    const { items } = await aggregateActivity(['/repo'], fetchers)
    expect(items[0].key).toBe('/repo#pr#5')
    expect(items[0].repoName).toBe('repo')
  })

  it('tolera errores por repo sin romper el resto y deduplica', async () => {
    const fetchers: ActivityFetchers = {
      listPullRequests: async (p) => {
        if (p === '/bad') throw new Error('sin credenciales')
        return [pr(1, 'ok')]
      },
      listIssues: async (p) => {
        if (p === '/bad') throw new Error('sin credenciales')
        return []
      },
      wipCount: async () => 0
    }
    const { items, errors } = await aggregateActivity(['/good', '/bad'], fetchers)
    expect(items.some((i) => i.title === 'ok')).toBe(true)
    // Un solo error por repo pese a fallar PRs e issues.
    expect(errors).toEqual([{ repoPath: '/bad', error: 'sin credenciales' }])
  })

  it('deduplica repos repetidos en la entrada', async () => {
    let prCalls = 0
    const fetchers: ActivityFetchers = {
      listPullRequests: async () => {
        prCalls++
        return []
      },
      listIssues: async () => [],
      wipCount: async () => 0
    }
    await aggregateActivity(['/x', '/x', '/x'], fetchers)
    expect(prCalls).toBe(1)
  })

  it('respeta el límite de concurrencia', async () => {
    let active = 0
    let peak = 0
    const fetchers: ActivityFetchers = {
      listPullRequests: async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 10))
        active--
        return []
      },
      listIssues: async () => [],
      wipCount: async () => 0
    }
    await aggregateActivity(['/1', '/2', '/3', '/4', '/5'], fetchers, 2)
    expect(peak).toBeLessThanOrEqual(2)
  })
})

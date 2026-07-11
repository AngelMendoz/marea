import { create } from 'zustand'
import type { PullRequest } from '@shared/types'
import { bridge } from './bridge'

/** Filtros predefinidos del panel de PRs. */
export type PRFilter = 'all' | 'mine' | 'assigned'

interface PRListState {
  prs: PullRequest[] | null
  /** Repo al que pertenece la lista cargada (para detectar cambio de pestaña). */
  path: string | null
  loading: boolean
  error: string | null
  filter: PRFilter
  /** Login del usuario autenticado (para "Míos" / "Asignados a mí"). */
  user: string
  setFilter: (filter: PRFilter) => void
  /** Carga (o recarga) la lista de PRs abiertos del repo. */
  load: (repoPath: string) => Promise<void>
}

export const usePRList = create<PRListState>((set) => ({
  prs: null,
  path: null,
  loading: false,
  error: null,
  filter: 'all',
  user: '',
  setFilter: (filter) => set({ filter }),
  load: async (repoPath) => {
    set({ loading: true, error: null, path: repoPath })
    try {
      const [prs, user] = await Promise.all([bridge.listPullRequests(repoPath), bridge.githubUser()])
      set({ prs, user })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'error', prs: [] })
    } finally {
      set({ loading: false })
    }
  }
}))

export function filterPRs(prs: PullRequest[], filter: PRFilter, user: string): PullRequest[] {
  if (filter === 'mine') return prs.filter((pr) => pr.author === user)
  if (filter === 'assigned') return prs.filter((pr) => pr.assignees.includes(user))
  return prs
}

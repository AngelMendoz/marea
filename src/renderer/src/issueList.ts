import { create } from 'zustand'
import type { Issue } from '@shared/types'
import { bridge } from './bridge'

/** Filtros predefinidos del panel de Issues. */
export type IssueFilter = 'all' | 'mine' | 'assigned'

interface IssueListState {
  issues: Issue[] | null
  /** Repo al que pertenece la lista cargada. */
  path: string | null
  loading: boolean
  error: string | null
  filter: IssueFilter
  /** Filtro adicional por label ('' = todas). */
  label: string
  user: string
  setFilter: (filter: IssueFilter) => void
  setLabel: (label: string) => void
  load: (repoPath: string) => Promise<void>
}

export const useIssueList = create<IssueListState>((set) => ({
  issues: null,
  path: null,
  loading: false,
  error: null,
  filter: 'all',
  label: '',
  user: '',
  setFilter: (filter) => set({ filter }),
  setLabel: (label) => set({ label }),
  load: async (repoPath) => {
    set({ loading: true, error: null, path: repoPath })
    try {
      const [issues, user] = await Promise.all([bridge.listIssues(repoPath), bridge.githubUser()])
      set({ issues, user })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'error', issues: [] })
    } finally {
      set({ loading: false })
    }
  }
}))

export function filterIssues(
  issues: Issue[],
  filter: IssueFilter,
  label: string,
  user: string
): Issue[] {
  let out = issues
  if (filter === 'mine') out = out.filter((i) => i.author === user)
  else if (filter === 'assigned') out = out.filter((i) => i.assignees.includes(user))
  if (label) out = out.filter((i) => i.labels.some((l) => l.name === label))
  return out
}

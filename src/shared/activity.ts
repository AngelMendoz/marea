// Agregación de Actividad: reúne PRs, issues y WIP de varios repos. Función
// pura con los fetchers inyectados (bridge en el renderer, servicios reales
// en las pruebas).

import type { GhLabel, Issue, PullRequest } from './types'

/** Elemento normalizado de la vista unificada. */
export interface ActivityItem {
  /** Clave estable (repo + tipo + número) para pin/snooze/leído. */
  key: string
  kind: 'pr' | 'issue' | 'wip'
  repoPath: string
  repoName: string
  number?: number
  title: string
  author?: string
  assignees: string[]
  labels: GhLabel[]
  url?: string
  draft?: boolean
  /** Archivos con cambios sin commitear (solo kind 'wip'). */
  changes?: number
}

export interface ActivityError {
  repoPath: string
  error: string
}

export interface ActivityData {
  items: ActivityItem[]
  /** Errores por repo (sin credenciales, sin remoto…), sin romper la vista. */
  errors: ActivityError[]
}

export interface ActivityFetchers {
  listPullRequests: (path: string) => Promise<PullRequest[]>
  listIssues: (path: string) => Promise<Issue[]>
  /** Número de archivos con cambios sin commitear en el repo. */
  wipCount: (path: string) => Promise<number>
}

const repoNameOf = (p: string): string => p.split(/[\\/]/).pop() || p
const errText = (r: PromiseRejectedResult): string =>
  r.reason instanceof Error ? r.reason.message : String(r.reason)

/** Reúne PRs, issues y WIPs de `repos` en paralelo (con límite de
 *  concurrencia) y tolerante a errores por repo. */
export async function aggregateActivity(
  repos: string[],
  fetchers: ActivityFetchers,
  limit = 3
): Promise<ActivityData> {
  const items: ActivityItem[] = []
  const errors: ActivityError[] = []
  const queue = [...new Set(repos)]

  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      const repoName = repoNameOf(path)
      const [prs, issues, wip] = await Promise.allSettled([
        fetchers.listPullRequests(path),
        fetchers.listIssues(path),
        fetchers.wipCount(path)
      ])
      if (prs.status === 'fulfilled') {
        for (const pr of prs.value) {
          items.push({
            key: `${path}#pr#${pr.number}`,
            kind: 'pr',
            repoPath: path,
            repoName,
            number: pr.number,
            title: pr.title,
            author: pr.author,
            assignees: pr.assignees,
            labels: [],
            url: pr.url,
            draft: pr.draft
          })
        }
      } else {
        errors.push({ repoPath: path, error: errText(prs) })
      }
      if (issues.status === 'fulfilled') {
        for (const issue of issues.value) {
          items.push({
            key: `${path}#issue#${issue.number}`,
            kind: 'issue',
            repoPath: path,
            repoName,
            number: issue.number,
            title: issue.title,
            author: issue.author,
            assignees: issue.assignees,
            labels: issue.labels,
            url: issue.url
          })
        }
      } else {
        errors.push({ repoPath: path, error: errText(issues) })
      }
      if (wip.status === 'fulfilled') {
        if (wip.value > 0) {
          items.push({
            key: `${path}#wip`,
            kind: 'wip',
            repoPath: path,
            repoName,
            title: `${wip.value} ${wip.value === 1 ? 'archivo' : 'archivos'} con cambios sin commitear`,
            assignees: [],
            labels: [],
            changes: wip.value
          })
        }
      } else {
        errors.push({ repoPath: path, error: errText(wip) })
      }
    }
  })
  await Promise.all(workers)

  // Un repo sin credenciales falla igual en PRs e issues: un error por repo basta.
  const seen = new Set<string>()
  const deduped = errors.filter((e) => {
    const k = `${e.repoPath}|${e.error}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { items, errors: deduped }
}

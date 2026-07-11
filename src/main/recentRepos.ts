import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { RecentRepo } from '../shared/types'

function storeFile(): string {
  return join(app.getPath('userData'), 'recent-repos.json')
}

export function getRecentRepos(): RecentRepo[] {
  try {
    const file = storeFile()
    if (!existsSync(file)) return []
    const data = JSON.parse(readFileSync(file, 'utf-8')) as RecentRepo[]
    // Solo devolvemos los que aún existen en disco.
    return data
      .filter((r) => existsSync(r.path))
      .sort((a, b) => b.lastOpened - a.lastOpened)
  } catch {
    return []
  }
}

export function addRecentRepo(path: string): RecentRepo[] {
  const list = getRecentRepos().filter((r) => r.path !== path)
  list.unshift({ path, name: basename(path), lastOpened: Date.now() })
  const trimmed = list.slice(0, 20)
  try {
    writeFileSync(storeFile(), JSON.stringify(trimmed, null, 2), 'utf-8')
  } catch {
    /* ignore */
  }
  return trimmed
}

export function removeRecentRepo(path: string): RecentRepo[] {
  const list = getRecentRepos().filter((r) => r.path !== path)
  try {
    writeFileSync(storeFile(), JSON.stringify(list, null, 2), 'utf-8')
  } catch {
    /* ignore */
  }
  return list
}

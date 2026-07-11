import { create } from 'zustand'

/** Vínculos issue ↔ rama creados desde "Crear rama para este issue".
 *  Se persisten en localStorage por repo (mostrando el icono
 *  de rama enlazada en el issue). */
type LinkMap = Record<string, Record<string, string>> // repoPath → nºissue → rama

function load(): LinkMap {
  try {
    return JSON.parse(localStorage.getItem('marea-issue-links') || '{}')
  } catch {
    return {}
  }
}

interface IssueLinksState {
  links: LinkMap
  link: (repoPath: string, issue: number, branch: string) => void
  /** Rama enlazada a un issue (o null). */
  branchFor: (repoPath: string, issue: number) => string | null
  /** Issue enlazado a una rama (o null) — para sugerir «#n» al commitear. */
  issueFor: (repoPath: string, branch: string) => number | null
}

export const useIssueLinks = create<IssueLinksState>((set, get) => ({
  links: load(),
  link: (repoPath, issue, branch) => {
    const links = { ...get().links, [repoPath]: { ...get().links[repoPath], [issue]: branch } }
    localStorage.setItem('marea-issue-links', JSON.stringify(links))
    set({ links })
  },
  branchFor: (repoPath, issue) => get().links[repoPath]?.[issue] ?? null,
  issueFor: (repoPath, branch) => {
    const repo = get().links[repoPath]
    if (!repo) return null
    for (const [n, b] of Object.entries(repo)) {
      if (b === branch) return Number(n)
    }
    return null
  }
}))

/** Nombre de rama sugerido para un issue: «n-titulo» en kebab-case sin
 *  acentos ni símbolos, longitud limitada (editable). */
export function suggestBranchName(issueNumber: number, title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos (marcas diacriticas NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return slug ? `${issueNumber}-${slug}` : `${issueNumber}-issue`
}

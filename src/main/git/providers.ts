// Abstracción multi-proveedor para PRs e Issues (GitHub, GitLab, Bitbucket,
// Azure DevOps). GitHub está implementado en `github.ts`.

import type {
  CreateIssueOptions,
  CreatePROptions,
  Issue,
  IssueComment,
  PRComment,
  PRFile,
  PRInlineComment,
  PRMergeMethod,
  PRReviewEvent,
  ProviderKind,
  PullRequest,
  PullRequestDetail,
  RepoHost
} from '../../shared/types'

export const PROVIDER_NAMES: Record<ProviderKind, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  'bitbucket-cloud': 'Bitbucket Cloud',
  'bitbucket-server': 'Bitbucket Server',
  azure: 'Azure DevOps',
  unknown: 'desconocido'
}

/** Deducción del proveedor a partir de la URL del remoto (https o ssh). */
export function detectProvider(url: string): RepoHost | null {
  const patterns: [ProviderKind, RegExp][] = [
    ['github', /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/],
    ['gitlab', /gitlab\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/],
    ['bitbucket-cloud', /bitbucket\.org[:/]([^/]+)\/(.+?)(?:\.git)?$/],
    // Azure: https://dev.azure.com/{org}/{proyecto}/_git/{repo} o ssh v3.
    ['azure', /dev\.azure\.com[:/](?:v3\/)?([^/]+)\/[^/]+\/(?:_git\/)?(.+?)(?:\.git)?$/]
  ]
  for (const [host, re] of patterns) {
    const m = url.match(re)
    if (m) return { host, owner: m[1], repo: m[2] }
  }
  return null
}

/**
 * Contrato que debe cumplir cada proveedor de Pull Requests.
 * `githubService` lo implementa; GitLab/Bitbucket/Azure quedan pendientes.
 */
export interface PullRequestProvider {
  hostInfo(repoPath: string): Promise<RepoHost>
  user(): Promise<string>
  listPullRequests(repoPath: string): Promise<PullRequest[]>
  getPullRequest(repoPath: string, number: number): Promise<PullRequestDetail>
  prFiles(repoPath: string, number: number): Promise<PRFile[]>
  prDiff(repoPath: string, number: number): Promise<string>
  prComments(repoPath: string, number: number): Promise<PRComment[]>
  createPullRequest(repoPath: string, opts: CreatePROptions): Promise<{ number: number; url: string }>
  reviewPullRequest(
    repoPath: string,
    number: number,
    event: PRReviewEvent,
    body?: string,
    comments?: PRInlineComment[]
  ): Promise<void>
  commentPullRequest(repoPath: string, number: number, body: string): Promise<void>
  inlineCommentPullRequest(
    repoPath: string,
    number: number,
    comment: PRInlineComment,
    commitId: string
  ): Promise<void>
  mergePullRequest(repoPath: string, number: number, method: PRMergeMethod): Promise<string>
  closePullRequest(repoPath: string, number: number): Promise<void>
}

/**
 * Contrato de Issues por proveedor (GitHub implementado; GitLab usa
 * /projects/:id/issues y Jira su API REST v3 con host + token propios).
 */
export interface IssueProvider {
  listIssues(repoPath: string): Promise<Issue[]>
  getIssue(repoPath: string, number: number): Promise<Issue>
  createIssue(repoPath: string, opts: CreateIssueOptions): Promise<{ number: number; url: string }>
  issueComments(repoPath: string, number: number): Promise<IssueComment[]>
  commentIssue(repoPath: string, number: number, body: string): Promise<void>
}

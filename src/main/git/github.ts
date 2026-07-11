import { spawn } from 'child_process'
import simpleGit from 'simple-git'
import type {
  CreateIssueOptions,
  CreatePROptions,
  FileChangeType,
  GhLabel,
  Issue,
  IssueComment,
  PRComment,
  PRFile,
  PRInlineComment,
  PRMergeMethod,
  PRReviewEvent,
  PullRequest,
  PullRequestDetail,
  RepoHost
} from '../../shared/types'
import { tokenForRepo } from '../accounts'
import { detectProvider, PROVIDER_NAMES } from './providers'

/** Obtiene el token de GitHub desde Git Credential Manager (sin interacción). */
function getToken(host = 'github.com'): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['credential', 'fill'], {
      env: { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' }
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', reject)
    p.on('close', () => {
      const m = out.match(/^password=(.*)$/m)
      resolve(m ? m[1].trim() : '')
    })
    p.stdin.write(`protocol=https\nhost=${host}\n\n`)
    p.stdin.end()
  })
}

async function resolveHost(repoPath: string): Promise<RepoHost> {
  const remotes = await simpleGit(repoPath).getRemotes(true)
  const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0]
  if (!origin) throw new Error('El repositorio no tiene remotos configurados.')
  const detected = detectProvider(origin.refs.fetch || origin.refs.push)
  if (!detected || detected.host === 'unknown') {
    throw new Error('No se reconoce el proveedor del remoto.')
  }
  if (detected.host !== 'github') {
    throw new Error(`${PROVIDER_NAMES[detected.host]} aún no está soportado (por ahora solo GitHub).`)
  }
  return detected
}

async function api<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Marea'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    // `errors` puede traer strings planos ("Review Can not approve your own
    // pull request") u objetos { message }; hay que soportar ambos formatos.
    const detail = Array.isArray(data.errors)
      ? (data.errors as unknown[])
          .map((e) => (typeof e === 'string' ? e : ((e as { message?: string }).message ?? '')))
          .filter(Boolean)
          .join('; ')
      : ''
    const errors = detail ? ` (${detail})` : ''
    throw new Error(`${(data.message as string) || `GitHub ${res.status}`}${errors}`)
  }
  return data as T
}

/** Como `api` pero devuelve el cuerpo en texto (p. ej. el diff de un PR). */
async function apiText(path: string, token: string, accept: string): Promise<string> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'Marea' }
  })
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text().catch(() => '')}`)
  return res.text()
}

/** owner/repo del remoto + token: primero la cuenta asignada al repo
 * y, si no hay, el credential helper (GCM). */
async function ghAuth(repoPath: string): Promise<{ owner: string; repo: string; token: string }> {
  const { owner, repo } = await resolveHost(repoPath)
  const token = tokenForRepo(repoPath, 'github') || (await getToken())
  if (!token) throw new Error('No hay credenciales de GitHub (inicia sesión con Git primero).')
  return { owner, repo, token }
}

type Json = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const login = (v: unknown): string => str((v as Json)?.login)
const when = (v: unknown): number => Math.floor(new Date(str(v)).getTime() / 1000) || 0

function mapPR(pr: Json): PullRequest {
  return {
    number: pr.number as number,
    title: str(pr.title),
    state: str(pr.state),
    author: login(pr.user),
    head: str((pr.head as Json)?.ref),
    base: str((pr.base as Json)?.ref),
    url: str(pr.html_url),
    draft: !!pr.draft,
    assignees: Array.isArray(pr.assignees) ? (pr.assignees as Json[]).map(login) : []
  }
}

const PR_FILE_STATUS: Record<string, FileChangeType> = {
  added: 'added',
  removed: 'deleted',
  modified: 'modified',
  renamed: 'renamed',
  copied: 'copied',
  changed: 'modified'
}

function mapIssue(i: Json): Issue {
  return {
    number: i.number as number,
    title: str(i.title),
    state: str(i.state),
    author: login(i.user),
    assignees: Array.isArray(i.assignees) ? (i.assignees as Json[]).map(login) : [],
    labels: Array.isArray(i.labels)
      ? (i.labels as Json[]).map((l) => ({
          name: str(l.name),
          color: `#${str(l.color) || '888888'}`
        }))
      : [],
    comments: (i.comments as number) ?? 0,
    createdAt: when(i.created_at),
    url: str(i.html_url),
    body: str(i.body)
  }
}

/** Login del usuario autenticado (no cambia durante la sesión). */
let cachedLogin: string | null = null

export const githubService = {
  async hostInfo(repoPath: string): Promise<RepoHost> {
    return resolveHost(repoPath)
  },

  /** Usuario autenticado (para filtros "Míos" / "Asignados a mí"). */
  async user(): Promise<string> {
    const token = await getToken()
    if (!token) return ''
    if (cachedLogin !== null) return cachedLogin
    try {
      cachedLogin = login(await api<Json>('GET', '/user', token))
    } catch {
      cachedLogin = ''
    }
    return cachedLogin
  },

  async listPullRequests(repoPath: string): Promise<PullRequest[]> {
    const { owner, repo, token } = await ghAuth(repoPath)
    const data = await api<Json[]>('GET', `/repos/${owner}/${repo}/pulls?state=open&per_page=50`, token)
    return data.map(mapPR)
  },

  async getPullRequest(repoPath: string, number: number): Promise<PullRequestDetail> {
    const { owner, repo, token } = await ghAuth(repoPath)
    const pr = await api<Json>('GET', `/repos/${owner}/${repo}/pulls/${number}`, token)
    return {
      ...mapPR(pr),
      body: str(pr.body),
      createdAt: when(pr.created_at),
      merged: !!pr.merged,
      mergeable: typeof pr.mergeable === 'boolean' ? pr.mergeable : null,
      headSha: str((pr.head as Json)?.sha),
      headLabel: str((pr.head as Json)?.label),
      additions: (pr.additions as number) ?? 0,
      deletions: (pr.deletions as number) ?? 0,
      changedFiles: (pr.changed_files as number) ?? 0
    }
  },

  async prFiles(repoPath: string, number: number): Promise<PRFile[]> {
    const { owner, repo, token } = await ghAuth(repoPath)
    const data = await api<Json[]>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
      token
    )
    return data.map((f) => ({
      path: str(f.filename),
      previousPath: f.previous_filename ? str(f.previous_filename) : undefined,
      type: PR_FILE_STATUS[str(f.status)] ?? 'unknown',
      additions: (f.additions as number) ?? 0,
      deletions: (f.deletions as number) ?? 0,
      patch: f.patch ? str(f.patch) : undefined
    }))
  },

  /** Diff unificado completo del PR (Accept: application/vnd.github.diff). */
  async prDiff(repoPath: string, number: number): Promise<string> {
    const { owner, repo, token } = await ghAuth(repoPath)
    return apiText(`/repos/${owner}/${repo}/pulls/${number}`, token, 'application/vnd.github.diff')
  },

  /** Conversación del PR: comentarios generales + reviews + comentarios en línea,
   *  ordenados por fecha. */
  async prComments(repoPath: string, number: number): Promise<PRComment[]> {
    const { owner, repo, token } = await ghAuth(repoPath)
    const base = `/repos/${owner}/${repo}`
    const [general, reviews, inline] = await Promise.all([
      api<Json[]>('GET', `${base}/issues/${number}/comments?per_page=100`, token),
      api<Json[]>('GET', `${base}/pulls/${number}/reviews?per_page=100`, token),
      api<Json[]>('GET', `${base}/pulls/${number}/comments?per_page=100`, token)
    ])
    const out: PRComment[] = []
    for (const c of general) {
      out.push({
        id: c.id as number,
        author: login(c.user),
        body: str(c.body),
        createdAt: when(c.created_at),
        kind: 'general'
      })
    }
    for (const r of reviews) {
      const state = str(r.state)
      // Un review COMMENTED sin texto es solo el contenedor de comentarios en
      // línea (que ya se listan aparte); no aporta nada a la conversación.
      if (state === 'PENDING' || (state === 'COMMENTED' && !str(r.body).trim())) continue
      out.push({
        id: r.id as number,
        author: login(r.user),
        body: str(r.body),
        createdAt: when(r.submitted_at),
        kind: 'review',
        state
      })
    }
    for (const c of inline) {
      out.push({
        id: c.id as number,
        author: login(c.user),
        body: str(c.body),
        createdAt: when(c.created_at),
        kind: 'inline',
        path: str(c.path),
        line: (c.line as number) ?? (c.original_line as number) ?? undefined,
        side: c.side === 'LEFT' ? 'LEFT' : 'RIGHT'
      })
    }
    return out.sort((a, b) => a.createdAt - b.createdAt)
  },

  /** Publica un review: APPROVE, REQUEST_CHANGES o COMMENT (con comentarios
   *  en línea opcionales vía `comments[]` con path/line/side). */
  async reviewPullRequest(
    repoPath: string,
    number: number,
    event: PRReviewEvent,
    body?: string,
    comments?: PRInlineComment[]
  ): Promise<void> {
    const { owner, repo, token } = await ghAuth(repoPath)
    await api('POST', `/repos/${owner}/${repo}/pulls/${number}/reviews`, token, {
      event,
      body: body ?? '',
      ...(comments?.length ? { comments } : {})
    })
  },

  /** Comentario general en la conversación (endpoint de issues). */
  async commentPullRequest(repoPath: string, number: number, body: string): Promise<void> {
    const { owner, repo, token } = await ghAuth(repoPath)
    await api('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, token, { body })
  },

  /** Comentario en línea suelto sobre el diff (requiere el SHA del head). */
  async inlineCommentPullRequest(
    repoPath: string,
    number: number,
    comment: PRInlineComment,
    commitId: string
  ): Promise<void> {
    const { owner, repo, token } = await ghAuth(repoPath)
    await api('POST', `/repos/${owner}/${repo}/pulls/${number}/comments`, token, {
      body: comment.body,
      path: comment.path,
      line: comment.line,
      side: comment.side,
      commit_id: commitId
    })
  },

  /** Merge del PR con la estrategia elegida. Devuelve el mensaje de GitHub. */
  async mergePullRequest(repoPath: string, number: number, method: PRMergeMethod): Promise<string> {
    const { owner, repo, token } = await ghAuth(repoPath)
    const res = await api<Json>('PUT', `/repos/${owner}/${repo}/pulls/${number}/merge`, token, {
      merge_method: method
    })
    return str(res.message)
  },

  async closePullRequest(repoPath: string, number: number): Promise<void> {
    const { owner, repo, token } = await ghAuth(repoPath)
    await api('PATCH', `/repos/${owner}/${repo}/pulls/${number}`, token, { state: 'closed' })
  },

  // ---------- Issues ----------

  /** Issues abiertos del repo. OJO: GitHub incluye los PRs en este endpoint
   *  (traen la clave `pull_request`); aquí se excluyen. */
  async listIssues(repoPath: string): Promise<Issue[]> {
    const { owner, repo, token } = await ghAuth(repoPath)
    const data = await api<Json[]>(
      'GET',
      `/repos/${owner}/${repo}/issues?state=open&per_page=100`,
      token
    )
    return data.filter((i) => !i.pull_request).map(mapIssue)
  },

  async getIssue(repoPath: string, number: number): Promise<Issue> {
    const { owner, repo, token } = await ghAuth(repoPath)
    return mapIssue(await api<Json>('GET', `/repos/${owner}/${repo}/issues/${number}`, token))
  },

  async createIssue(
    repoPath: string,
    opts: CreateIssueOptions
  ): Promise<{ number: number; url: string }> {
    const { owner, repo, token } = await ghAuth(repoPath)
    const issue = await api<Json>('POST', `/repos/${owner}/${repo}/issues`, token, {
      title: opts.title,
      body: opts.body ?? '',
      ...(opts.labels?.length ? { labels: opts.labels } : {}),
      ...(opts.assignees?.length ? { assignees: opts.assignees } : {})
    })
    return { number: issue.number as number, url: str(issue.html_url) }
  },

  async issueComments(repoPath: string, number: number): Promise<IssueComment[]> {
    const { owner, repo, token } = await ghAuth(repoPath)
    const data = await api<Json[]>(
      'GET',
      `/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
      token
    )
    return data.map((c) => ({
      id: c.id as number,
      author: login(c.user),
      body: str(c.body),
      createdAt: when(c.created_at)
    }))
  },

  async commentIssue(repoPath: string, number: number, body: string): Promise<void> {
    const { owner, repo, token } = await ghAuth(repoPath)
    await api('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, token, { body })
  },

  async listCollaborators(repoPath: string): Promise<string[]> {
    const { owner, repo } = await resolveHost(repoPath)
    const token = await getToken()
    if (!token) return []
    try {
      const data = await api<Record<string, unknown>[]>(
        'GET',
        `/repos/${owner}/${repo}/collaborators?per_page=100`,
        token
      )
      return data.map((u) => u.login as string)
    } catch {
      return []
    }
  },

  async listLabels(repoPath: string): Promise<GhLabel[]> {
    const { owner, repo } = await resolveHost(repoPath)
    const token = await getToken()
    if (!token) return []
    try {
      const data = await api<Record<string, unknown>[]>(
        'GET',
        `/repos/${owner}/${repo}/labels?per_page=100`,
        token
      )
      return data.map((l) => ({ name: l.name as string, color: `#${(l.color as string) || '888888'}` }))
    } catch {
      return []
    }
  },

  async createPullRequest(
    repoPath: string,
    opts: CreatePROptions
  ): Promise<{ number: number; url: string }> {
    const { owner, repo } = await resolveHost(repoPath)
    const token = await getToken()
    if (!token) throw new Error('No hay credenciales de GitHub (inicia sesión con Git primero).')
    const pr = await api<Record<string, unknown>>('POST', `/repos/${owner}/${repo}/pulls`, token, {
      title: opts.title,
      body: opts.body ?? '',
      head: opts.head,
      base: opts.base,
      draft: !!opts.draft
    })
    const number = pr.number as number

    // Metadatos opcionales (no fallar el PR si alguno da error).
    if (opts.reviewers?.length) {
      await api('POST', `/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, token, {
        reviewers: opts.reviewers
      }).catch(() => undefined)
    }
    if (opts.assignees?.length) {
      await api('POST', `/repos/${owner}/${repo}/issues/${number}/assignees`, token, {
        assignees: opts.assignees
      }).catch(() => undefined)
    }
    if (opts.labels?.length) {
      await api('POST', `/repos/${owner}/${repo}/issues/${number}/labels`, token, {
        labels: opts.labels
      }).catch(() => undefined)
    }

    return { number, url: pr.html_url as string }
  }
}

export type GithubService = typeof githubService

// URLs web a partir de la URL de un remoto (https o ssh), para «Abrir en el
// proveedor». Soporta GitHub, GitLab, Bitbucket Cloud y Azure DevOps.

interface ParsedRemote {
  kind: 'github' | 'gitlab' | 'bitbucket' | 'azure'
  /** URL web base del repositorio (sin barra final). */
  base: string
}

/** Normaliza la URL del remoto a la URL web base del repositorio. */
export function parseRemoteUrl(url: string): ParsedRemote | null {
  const u = url.trim().replace(/\.git$/, '')

  let m = u.match(/(?:https?:\/\/|git@|ssh:\/\/(?:git@)?)github\.com[:/]([^/]+)\/(.+)$/)
  if (m) return { kind: 'github', base: `https://github.com/${m[1]}/${m[2]}` }

  m = u.match(/(?:https?:\/\/|git@|ssh:\/\/(?:git@)?)gitlab\.com[:/](.+)$/)
  if (m) return { kind: 'gitlab', base: `https://gitlab.com/${m[1]}` }

  m = u.match(/(?:https?:\/\/|git@|ssh:\/\/(?:git@)?)bitbucket\.org[:/]([^/]+)\/(.+)$/)
  if (m) return { kind: 'bitbucket', base: `https://bitbucket.org/${m[1]}/${m[2]}` }

  // Azure https: https://{org}@dev.azure.com/{org}/{proyecto}/_git/{repo}
  m = u.match(/https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/(.+)$/)
  if (m) return { kind: 'azure', base: `https://dev.azure.com/${m[1]}/${m[2]}/_git/${m[3]}` }
  // Azure ssh v3: git@ssh.dev.azure.com:v3/{org}/{proyecto}/{repo}
  m = u.match(/ssh\.dev\.azure\.com[:/]v3\/([^/]+)\/([^/]+)\/(.+)$/)
  if (m) return { kind: 'azure', base: `https://dev.azure.com/${m[1]}/${m[2]}/_git/${m[3]}` }

  return null
}

/** URL web del repositorio (null si el proveedor no se reconoce). */
export function repoWebUrl(remoteUrl: string): string | null {
  return parseRemoteUrl(remoteUrl)?.base ?? null
}

/** URL web de una rama. `branch` SIN el prefijo del remoto (p. ej. "main"). */
export function branchWebUrl(remoteUrl: string, branch: string): string | null {
  const p = parseRemoteUrl(remoteUrl)
  if (!p) return null
  const b = encodeURIComponent(branch).replace(/%2F/g, '/')
  switch (p.kind) {
    case 'github':
      return `${p.base}/tree/${b}`
    case 'gitlab':
      return `${p.base}/-/tree/${b}`
    case 'bitbucket':
      return `${p.base}/branch/${b}`
    case 'azure':
      return `${p.base}?version=GB${encodeURIComponent(branch)}`
  }
}

/** URL web de un commit. */
export function commitWebUrl(remoteUrl: string, sha: string): string | null {
  const p = parseRemoteUrl(remoteUrl)
  if (!p) return null
  switch (p.kind) {
    case 'github':
    case 'azure':
      return `${p.base}/commit/${sha}`
    case 'gitlab':
      return `${p.base}/-/commit/${sha}`
    case 'bitbucket':
      return `${p.base}/commits/${sha}`
  }
}

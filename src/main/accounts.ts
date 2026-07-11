import { randomUUID } from 'crypto'
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Account, ProviderKind } from '../shared/types'

// Cuentas de proveedores. Los tokens se guardan CIFRADOS con
// safeStorage (DPAPI/Keychain/libsecret) en un JSON del userData; al renderer
// solo viajan id/proveedor/host/usuario, nunca el token.

interface StoredAccount extends Account {
  /** Token cifrado con safeStorage, en base64. */
  tokenEnc: string
}

interface AccountsFile {
  accounts: StoredAccount[]
  /** Cuenta asignada por repositorio (ruta normalizada → id de cuenta). */
  repoAccounts: Record<string, string>
}

function storeFile(): string {
  return join(app.getPath('userData'), 'accounts.json')
}

const normPath = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

function load(): AccountsFile {
  try {
    const file = storeFile()
    if (!existsSync(file)) return { accounts: [], repoAccounts: {} }
    const data = JSON.parse(readFileSync(file, 'utf-8')) as AccountsFile
    return {
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      repoAccounts: data.repoAccounts && typeof data.repoAccounts === 'object' ? data.repoAccounts : {}
    }
  } catch {
    return { accounts: [], repoAccounts: {} }
  }
}

function save(data: AccountsFile): void {
  writeFileSync(storeFile(), JSON.stringify(data, null, 2), 'utf-8')
}

function toPublic(a: StoredAccount): Account {
  return { id: a.id, provider: a.provider, host: a.host, username: a.username }
}

/** Valida el token contra la API del proveedor y devuelve el usuario.
 *  GitHub y GitLab se validan online; el resto requiere usuario manual. */
async function validateToken(provider: ProviderKind, host: string, token: string): Promise<string> {
  if (provider === 'github') {
    const base = host === 'github.com' ? 'https://api.github.com' : `https://${host}/api/v3`
    const res = await fetch(`${base}/user`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Marea' }
    })
    if (!res.ok) throw new Error(`El token no es válido para ${host} (HTTP ${res.status})`)
    const data = (await res.json()) as { login?: string }
    return data.login ?? ''
  }
  if (provider === 'gitlab') {
    const res = await fetch(`https://${host}/api/v4/user`, { headers: { 'PRIVATE-TOKEN': token } })
    if (!res.ok) throw new Error(`El token no es válido para ${host} (HTTP ${res.status})`)
    const data = (await res.json()) as { username?: string }
    return data.username ?? ''
  }
  return ''
}

export const accountsService = {
  async list(): Promise<Account[]> {
    return load().accounts.map(toPublic)
  },

  /** Conecta una cuenta: valida el token (si el proveedor lo permite) y lo
   *  guarda cifrado. `username` solo es necesario si no hay validación online. */
  async add(provider: ProviderKind, host: string, token: string, username = ''): Promise<Account> {
    const cleanHost = host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    const cleanToken = token.trim()
    if (!cleanToken) throw new Error('El token no puede estar vacío.')
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('El cifrado del sistema no está disponible: no se puede guardar el token de forma segura.')
    }
    const validated = await validateToken(provider, cleanHost, cleanToken)
    const user = validated || username.trim()
    if (!user) throw new Error('Indica el nombre de usuario de la cuenta.')
    const data = load()
    if (data.accounts.some((a) => a.provider === provider && a.host === cleanHost && a.username === user)) {
      throw new Error(`La cuenta ${user}@${cleanHost} ya está conectada.`)
    }
    const account: StoredAccount = {
      id: randomUUID(),
      provider,
      host: cleanHost,
      username: user,
      tokenEnc: safeStorage.encryptString(cleanToken).toString('base64')
    }
    data.accounts.push(account)
    save(data)
    return toPublic(account)
  },

  async remove(id: string): Promise<Account[]> {
    const data = load()
    data.accounts = data.accounts.filter((a) => a.id !== id)
    for (const [repo, acc] of Object.entries(data.repoAccounts)) {
      if (acc === id) delete data.repoAccounts[repo]
    }
    save(data)
    return data.accounts.map(toPublic)
  },

  /** Asigna la cuenta a usar en un repo ('' = automática, credential helper). */
  async setRepoAccount(repoPath: string, accountId: string): Promise<void> {
    const data = load()
    if (accountId && !data.accounts.some((a) => a.id === accountId)) {
      throw new Error('La cuenta ya no existe.')
    }
    if (accountId) data.repoAccounts[normPath(repoPath)] = accountId
    else delete data.repoAccounts[normPath(repoPath)]
    save(data)
  },

  async getRepoAccount(repoPath: string): Promise<string> {
    return load().repoAccounts[normPath(repoPath)] ?? ''
  }
}

/** Token descifrado de la cuenta asignada a un repo (uso interno del main).
 *  '' si el repo no tiene cuenta asignada de ese proveedor. */
export function tokenForRepo(repoPath: string, provider: ProviderKind): string {
  try {
    const data = load()
    const id = data.repoAccounts[normPath(repoPath)]
    if (!id) return ''
    const account = data.accounts.find((a) => a.id === id && a.provider === provider)
    if (!account) return ''
    return safeStorage.decryptString(Buffer.from(account.tokenEnc, 'base64'))
  } catch {
    return ''
  }
}

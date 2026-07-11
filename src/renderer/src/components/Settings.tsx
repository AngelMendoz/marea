import {
  Globe,
  Keyboard,
  Monitor,
  Plug,
  Settings2,
  SlidersHorizontal,
  TerminalSquare,
  User,
  Wrench,
  X
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Account, ProviderKind, PullMode } from '@shared/types'
import { bridge } from '../bridge'
import {
  comboFromEvent,
  DEFAULT_SHORTCUTS,
  isReservedCombo,
  SHORTCUT_LABELS,
  useSettings,
  ZOOM_LEVELS,
  type ShortcutAction
} from '../settings'
import { useModalLayer } from '../lib/modalLayer'
import { useStore } from '../store'
import { useRepoSettings } from './RepoSettings'

type Tab = 'general' | 'behavior' | 'git' | 'ssh' | 'network' | 'tools' | 'integrations' | 'shortcuts'

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'general', label: 'General', icon: <Monitor size={14} /> },
  { id: 'behavior', label: 'Comportamiento', icon: <SlidersHorizontal size={14} /> },
  { id: 'git', label: 'Git', icon: <User size={14} /> },
  { id: 'ssh', label: 'SSH', icon: <TerminalSquare size={14} /> },
  { id: 'network', label: 'Red y credenciales', icon: <Globe size={14} /> },
  { id: 'tools', label: 'Herramientas', icon: <Wrench size={14} /> },
  { id: 'integrations', label: 'Integraciones', icon: <Plug size={14} /> },
  { id: 'shortcuts', label: 'Atajos de teclado', icon: <Keyboard size={14} /> }
]

/** Panel de Preferencias de la aplicación. */
export function Settings(): JSX.Element | null {
  const open = useSettings((s) => s.open)
  const closePanel = useSettings((s) => s.closePanel)
  const [tab, setTab] = useState<Tab>('general')
  const layer = useModalLayer(open)

  useEffect(() => {
    if (open) setTab('general')
  }, [open])

  if (!open) return null

  return (
    <div className="pr-overlay" style={{ zIndex: layer }} onMouseDown={(e) => e.target === e.currentTarget && closePanel()}>
      <div className="pr-panel st-panel">
        <div className="pr-head">
          <Settings2 size={16} color="var(--accent)" />
          <h3>Preferencias</h3>
          <button className="icon-btn" onClick={closePanel} title="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="st-body">
          <nav className="st-nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`st-nav-item${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
          <div className="st-content">
            {tab === 'general' && <GeneralTab />}
            {tab === 'behavior' && <BehaviorTab />}
            {tab === 'git' && <GitTab />}
            {tab === 'ssh' && <SshTab />}
            {tab === 'network' && <NetworkTab />}
            {tab === 'tools' && <ToolsTab />}
            {tab === 'integrations' && <IntegrationsTab />}
            {tab === 'shortcuts' && <ShortcutsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- General

function GeneralTab(): JSX.Element {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const zoom = useSettings((s) => s.zoom)
  const setZoom = useSettings((s) => s.setZoom)
  const showSidebar = useSettings((s) => s.showSidebar)
  const showRightPanel = useSettings((s) => s.showRightPanel)
  const toggleSidebar = useSettings((s) => s.toggleSidebar)
  const toggleRightPanel = useSettings((s) => s.toggleRightPanel)
  const autoFetchMinutes = useSettings((s) => s.autoFetchMinutes)
  const setAutoFetchMinutes = useSettings((s) => s.setAutoFetchMinutes)

  return (
    <>
      <div className="rs-section">
        <div className="rs-title">Apariencia</div>
        <div className="rs-row">
          <span className="rs-label">Tema</span>
          <div className="seg small">
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => theme !== 'dark' && toggleTheme()}>
              Oscuro
            </button>
            <button className={theme === 'light' ? 'active' : ''} onClick={() => theme !== 'light' && toggleTheme()}>
              Claro
            </button>
          </div>
        </div>
        <div className="rs-row">
          <span className="rs-label">Zoom</span>
          <select value={String(zoom)} onChange={(e) => setZoom(parseFloat(e.target.value))}>
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={String(z)}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
        </div>
        <div className="rs-hint">También con Ctrl+= / Ctrl+- / Ctrl+0 y desde la barra inferior.</div>
      </div>

      <div className="rs-section">
        <div className="rs-title">Paneles</div>
        <label className="rs-check">
          <input type="checkbox" checked={showSidebar} onChange={toggleSidebar} />
          Mostrar panel izquierdo (ramas, remotos, tags…)
        </label>
        <label className="rs-check">
          <input type="checkbox" checked={showRightPanel} onChange={toggleRightPanel} />
          Mostrar panel derecho (cambios y detalle del commit)
        </label>
        <div className="rs-hint">El panel izquierdo puede redimensionarse arrastrando su borde.</div>
      </div>

      <div className="rs-section">
        <div className="rs-title">Auto-fetch</div>
        <div className="rs-row">
          <span className="rs-label">Intervalo</span>
          <select value={String(autoFetchMinutes)} onChange={(e) => setAutoFetchMinutes(parseInt(e.target.value, 10))}>
            <option value="0">Desactivado</option>
            <option value="1">Cada minuto</option>
            <option value="5">Cada 5 minutos</option>
            <option value="15">Cada 15 minutos</option>
            <option value="30">Cada 30 minutos</option>
            <option value="60">Cada hora</option>
          </select>
        </div>
        <div className="rs-hint">Trae los cambios del remoto en segundo plano para el repositorio activo.</div>
      </div>
    </>
  )
}

// ------------------------------------------------------------ Comportamiento

function BehaviorTab(): JSX.Element {
  const pullMode = useSettings((s) => s.pullMode)
  const setPullMode = useSettings((s) => s.setPullMode)

  const modes: { id: PullMode; label: string; hint: string }[] = [
    { id: 'merge', label: 'Pull (merge)', hint: 'Fast-forward si es posible; si no, crea un commit de merge.' },
    { id: 'rebase', label: 'Pull con rebase', hint: 'Reaplica tus commits locales encima de los del remoto.' },
    { id: 'ff-only', label: 'Pull (solo fast-forward)', hint: 'Falla si la rama local y la remota han divergido.' }
  ]

  return (
    <>
      <div className="rs-section">
        <div className="rs-title">Pull por defecto</div>
        {modes.map((m) => (
          <label key={m.id} className="rs-check st-radio">
            <input type="radio" name="pull-mode" checked={pullMode === m.id} onChange={() => setPullMode(m.id)} />
            <span>
              {m.label}
              <span className="rs-hint st-radio-hint">{m.hint}</span>
            </span>
          </label>
        ))}
        <div className="rs-hint">El botón Pull de la barra de herramientas usa esta estrategia.</div>
      </div>

      <div className="rs-section">
        <div className="rs-title">Push</div>
        <div className="rs-hint">
          El force push siempre usa <code>--force-with-lease</code> (aborta si alguien más empujó) y pide
          confirmación. Las ramas sin upstream se publican confirmando el remoto de destino.
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------- Git

function GitTab(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const notify = useStore((s) => s.notify)
  const gitPath = useSettings((s) => s.gitPath)
  const setGitPath = useSettings((s) => s.setGitPath)
  const externalEditor = useSettings((s) => s.externalEditor)
  const setExternalEditor = useSettings((s) => s.setExternalEditor)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [localName, setLocalName] = useState('')
  const [localEmail, setLocalEmail] = useState('')
  const [version, setVersion] = useState('')
  const [binDraft, setBinDraft] = useState(gitPath)
  const [editorDraft, setEditorDraft] = useState(externalEditor)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const path = repo?.path ?? '.'
    const [g, l, v] = await Promise.all([
      bridge.getConfig(path, ['user.name', 'user.email'], { scope: 'global' }),
      repo ? bridge.getConfig(repo.path, ['user.name', 'user.email'], { scope: 'local' }) : Promise.resolve({} as Record<string, string>),
      bridge.gitVersion()
    ])
    setName(g['user.name'] ?? '')
    setEmail(g['user.email'] ?? '')
    setLocalName(l['user.name'] ?? '')
    setLocalEmail(l['user.email'] ?? '')
    setVersion(v)
    setLoaded(true)
  }, [repo])

  useEffect(() => {
    void load()
  }, [load])

  if (!loaded) return <div className="rs-hint">Leyendo configuración…</div>

  const saveIdentity = (scope: 'global' | 'local'): void => {
    const path = repo?.path ?? '.'
    const n = scope === 'global' ? name : localName
    const e = scope === 'global' ? email : localEmail
    void run(scope === 'global' ? 'Identidad global guardada' : 'Identidad del repositorio guardada', async () => {
      await bridge.setConfig(path, 'user.name', n.trim(), { global: scope === 'global' })
      await bridge.setConfig(path, 'user.email', e.trim(), { global: scope === 'global' })
    })
  }

  const applyBinary = (): void => {
    void (async () => {
      try {
        const v = await bridge.setGitBinary(binDraft)
        setGitPath(binDraft)
        setVersion(v)
        notify('success', binDraft ? `Ejecutable git cambiado (${v})` : `Usando el git del PATH (${v})`)
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'No se pudo cambiar el ejecutable git')
      }
    })()
  }

  return (
    <>
      <div className="rs-section">
        <div className="rs-title">Identidad global (todos los repositorios)</div>
        <div className="rs-row">
          <span className="rs-label">Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="user.name" spellCheck={false} />
        </div>
        <div className="rs-row">
          <span className="rs-label">Correo</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user.email" spellCheck={false} />
        </div>
        <button className="btn primary rs-save" onClick={() => saveIdentity('global')}>
          Guardar identidad global
        </button>
      </div>

      {repo && (
        <div className="rs-section">
          <div className="rs-title">Identidad de este repositorio ({repo.name})</div>
          <div className="rs-row">
            <span className="rs-label">Nombre</span>
            <input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              placeholder={name ? `(hereda: ${name})` : 'user.name local'}
              spellCheck={false}
            />
          </div>
          <div className="rs-row">
            <span className="rs-label">Correo</span>
            <input
              value={localEmail}
              onChange={(e) => setLocalEmail(e.target.value)}
              placeholder={email ? `(hereda: ${email})` : 'user.email local'}
              spellCheck={false}
            />
          </div>
          <button className="btn rs-save" onClick={() => saveIdentity('local')}>
            Guardar para este repositorio
          </button>
        </div>
      )}

      <div className="rs-section">
        <div className="rs-title">Ejecutable Git</div>
        <div className="rs-row">
          <span className="rs-label">Ruta</span>
          <input
            value={binDraft}
            onChange={(e) => setBinDraft(e.target.value)}
            placeholder="vacío = usar el git del PATH"
            spellCheck={false}
          />
          <button className="btn rs-save" onClick={applyBinary}>
            Aplicar
          </button>
        </div>
        {version && <div className="rs-hint">En uso: {version}</div>}
      </div>

      <div className="rs-section">
        <div className="rs-title">Editor externo</div>
        <div className="rs-row">
          <span className="rs-label">Comando</span>
          <input
            value={editorDraft}
            onChange={(e) => setEditorDraft(e.target.value)}
            onBlur={() => setExternalEditor(editorDraft)}
            placeholder="p. ej. code · vacío = aplicación por defecto"
            spellCheck={false}
          />
        </div>
        <div className="rs-hint">Se usa al abrir archivos desde la app (recibe la ruta como argumento).</div>
      </div>

      {repo && (
        <div className="rs-section">
          <div className="rs-title">Firma y plantilla de commit</div>
          <div className="rs-hint">La firma GPG/SSH, los hooks y la plantilla se configuran por repositorio.</div>
          <button
            className="btn rs-save"
            onClick={() => {
              useSettings.getState().closePanel()
              useRepoSettings.getState().openPanel()
            }}
          >
            Abrir ajustes del repositorio…
          </button>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------- SSH

function SshTab(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const [sshCommand, setSshCommand] = useState('')
  const [keys, setKeys] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const path = repo?.path ?? '.'
      const [cfg, sk] = await Promise.all([
        bridge.getConfig(path, ['core.sshCommand'], { scope: 'global' }),
        bridge.listSshKeys()
      ])
      setSshCommand(cfg['core.sshCommand'] ?? '')
      setKeys(sk)
      setLoaded(true)
    })()
  }, [repo])

  if (!loaded) return <div className="rs-hint">Leyendo configuración…</div>

  const save = (): void => {
    void run('Configuración SSH guardada', () =>
      bridge.setConfig(repo?.path ?? '.', 'core.sshCommand', sshCommand.trim(), { global: true })
    )
  }

  const useKey = (pub: string): void => {
    // core.sshCommand apunta a la clave PRIVADA: quita el .pub.
    const priv = pub.replace(/\.pub$/, '')
    setSshCommand(`ssh -i "${priv}" -o IdentitiesOnly=yes`)
  }

  return (
    <>
      <div className="rs-section">
        <div className="rs-title">Comando SSH (core.sshCommand, global)</div>
        <div className="rs-row">
          <span className="rs-label">Comando</span>
          <input
            value={sshCommand}
            onChange={(e) => setSshCommand(e.target.value)}
            placeholder="vacío = ssh por defecto (usa el agente SSH del sistema)"
            spellCheck={false}
          />
          <button className="btn primary rs-save" onClick={save}>
            Guardar
          </button>
        </div>
        <div className="rs-hint">
          Vacío, git usa <code>ssh</code> y el agente del sistema (OpenSSH Agent en Windows). Para forzar una
          clave concreta, elige una de abajo o escribe tu propio comando.
        </div>
      </div>

      <div className="rs-section">
        <div className="rs-title">Claves detectadas en ~/.ssh</div>
        {keys.length === 0 ? (
          <div className="rs-hint">No se encontraron claves públicas (.pub) en ~/.ssh.</div>
        ) : (
          keys.map((k) => (
            <div key={k} className="rs-row">
              <span className="rs-label st-key-path" title={k}>
                {k.split('/').pop()}
              </span>
              <button className="btn rs-save" onClick={() => useKey(k)}>
                Usar esta clave
              </button>
            </div>
          ))
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------- Red/credenciales

function NetworkTab(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const [proxy, setProxy] = useState('')
  const [helper, setHelper] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const cfg = await bridge.getConfig(repo?.path ?? '.', ['http.proxy', 'credential.helper'], {
        scope: 'global'
      })
      setProxy(cfg['http.proxy'] ?? '')
      setHelper(cfg['credential.helper'] ?? '')
      setLoaded(true)
    })()
  }, [repo])

  if (!loaded) return <div className="rs-hint">Leyendo configuración…</div>

  const path = repo?.path ?? '.'

  return (
    <>
      <div className="rs-section">
        <div className="rs-title">Proxy (http.proxy, global)</div>
        <div className="rs-row">
          <span className="rs-label">URL</span>
          <input
            value={proxy}
            onChange={(e) => setProxy(e.target.value)}
            placeholder="http://usuario:clave@proxy:8080 · vacío = sin proxy"
            spellCheck={false}
          />
          <button
            className="btn primary rs-save"
            onClick={() => void run('Proxy guardado', () => bridge.setConfig(path, 'http.proxy', proxy.trim(), { global: true }))}
          >
            Guardar
          </button>
        </div>
      </div>

      <div className="rs-section">
        <div className="rs-title">Credenciales (credential.helper, global)</div>
        <div className="rs-row">
          <span className="rs-label">Helper</span>
          <select value={helper} onChange={(e) => setHelper(e.target.value)}>
            <option value="">(por defecto del sistema)</option>
            <option value="manager">manager — Git Credential Manager</option>
            <option value="store">store — guarda en claro en disco</option>
            <option value="cache">cache — en memoria, temporal</option>
            {helper && !['', 'manager', 'store', 'cache'].includes(helper) && (
              <option value={helper}>{helper}</option>
            )}
          </select>
          <button
            className="btn primary rs-save"
            onClick={() =>
              void run('Credential helper guardado', () =>
                bridge.setConfig(path, 'credential.helper', helper, { global: true })
              )
            }
          >
            Guardar
          </button>
        </div>
        <div className="rs-hint">
          Marea obtiene los tokens de GitHub del credential helper (recomendado: Git Credential Manager).
        </div>
      </div>
    </>
  )
}

// --------------------------------------------------------------- Herramientas

function ToolsTab(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const [mergeTool, setMergeTool] = useState('')
  const [diffTool, setDiffTool] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const cfg = await bridge.getConfig(repo?.path ?? '.', ['merge.tool', 'diff.tool'], { scope: 'global' })
      setMergeTool(cfg['merge.tool'] ?? '')
      setDiffTool(cfg['diff.tool'] ?? '')
      setLoaded(true)
    })()
  }, [repo])

  if (!loaded) return <div className="rs-hint">Leyendo configuración…</div>

  const path = repo?.path ?? '.'
  const save = (): void => {
    void run('Herramientas guardadas', async () => {
      await bridge.setConfig(path, 'merge.tool', mergeTool.trim(), { global: true })
      await bridge.setConfig(path, 'diff.tool', diffTool.trim(), { global: true })
    })
  }

  return (
    <div className="rs-section">
      <div className="rs-title">Herramientas de merge y diff (git config global)</div>
      <div className="rs-row">
        <span className="rs-label">Merge tool</span>
        <input
          value={mergeTool}
          onChange={(e) => setMergeTool(e.target.value)}
          list="st-merge-tools"
          placeholder="p. ej. vscode, meld, kdiff3"
          spellCheck={false}
        />
      </div>
      <div className="rs-row">
        <span className="rs-label">Diff tool</span>
        <input
          value={diffTool}
          onChange={(e) => setDiffTool(e.target.value)}
          list="st-merge-tools"
          placeholder="p. ej. vscode, meld, kdiff3"
          spellCheck={false}
        />
      </div>
      <datalist id="st-merge-tools">
        <option value="vscode" />
        <option value="meld" />
        <option value="kdiff3" />
        <option value="p4merge" />
        <option value="vimdiff" />
      </datalist>
      <button className="btn primary rs-save" onClick={save}>
        Guardar
      </button>
      <div className="rs-hint">
        Las usa git en <code>git mergetool</code> y <code>git difftool</code>. Marea incluye además su propio
        editor de conflictos integrado.
      </div>
    </div>
  )
}

// -------------------------------------------------------------- Integraciones

const PROVIDER_OPTIONS: { id: ProviderKind; label: string; host: string; validated: boolean }[] = [
  { id: 'github', label: 'GitHub', host: 'github.com', validated: true },
  { id: 'gitlab', label: 'GitLab', host: 'gitlab.com', validated: true },
  { id: 'bitbucket-cloud', label: 'Bitbucket', host: 'bitbucket.org', validated: false },
  { id: 'azure', label: 'Azure DevOps', host: 'dev.azure.com', validated: false }
]

const providerLabel = (p: ProviderKind): string =>
  PROVIDER_OPTIONS.find((o) => o.id === p)?.label ?? p

/** Cuentas conectadas: varias por proveedor, token cifrado con
 *  safeStorage en el main, y selección de cuenta por repositorio. */
function IntegrationsTab(): JSX.Element {
  const repo = useStore((s) => s.repo)
  const notify = useStore((s) => s.notify)
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [ghUser, setGhUser] = useState<string | null>(null)
  const [repoAccount, setRepoAccount] = useState('')
  // Formulario de conexión.
  const [provider, setProvider] = useState<ProviderKind>('github')
  const [host, setHost] = useState('github.com')
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const [list, gh, assigned] = await Promise.all([
      bridge.accountsList().catch((): Account[] => []),
      bridge.githubUser(),
      repo ? bridge.repoAccountGet(repo.path).catch(() => '') : Promise.resolve('')
    ])
    setAccounts(list)
    setGhUser(gh)
    setRepoAccount(assigned)
  }, [repo])

  useEffect(() => {
    void load()
  }, [load])

  if (!accounts) return <div className="rs-hint">Leyendo cuentas…</div>

  const selectedProvider = PROVIDER_OPTIONS.find((o) => o.id === provider)!

  const add = (): void => {
    setAdding(true)
    void bridge
      .accountAdd(provider, host.trim(), token, username.trim())
      .then((acc) => {
        notify('success', `Cuenta ${acc.username}@${acc.host} conectada ✓`)
        setToken('')
        setUsername('')
        return load()
      })
      .catch((err) => notify('error', err instanceof Error ? err.message : 'No se pudo conectar la cuenta'))
      .finally(() => setAdding(false))
  }

  const remove = (acc: Account): void => {
    void bridge
      .accountRemove(acc.id)
      .then(() => {
        notify('success', `Cuenta ${acc.username} desconectada ✓`)
        return load()
      })
      .catch((err) => notify('error', err instanceof Error ? err.message : 'No se pudo desconectar'))
  }

  const assign = (value: string): void => {
    if (!repo) return
    void bridge
      .repoAccountSet(repo.path, value)
      .then(() => {
        setRepoAccount(value)
        notify('success', value ? 'Cuenta asignada al repositorio ✓' : 'El repositorio vuelve a la cuenta automática ✓')
      })
      .catch((err) => notify('error', err instanceof Error ? err.message : 'No se pudo asignar'))
  }

  return (
    <>
      <div className="rs-section">
        <div className="rs-title">Cuentas conectadas</div>
        <div className="rs-row st-integration">
          <span className={`st-dot${ghUser ? ' ok' : ''}`} />
          <span className="rs-label">Automática (git)</span>
          <span className="rs-hint">
            {ghUser === null
              ? 'Comprobando…'
              : ghUser
                ? `GitHub vía credential helper: ${ghUser}`
                : 'Sin credenciales en el credential helper'}
          </span>
        </div>
        {accounts.map((a) => (
          <div key={a.id} className="rs-row st-integration">
            <span className="st-dot ok" />
            <span className="rs-label">{providerLabel(a.provider)}</span>
            <span className="rs-hint" style={{ flex: 1 }}>
              {a.username}@{a.host}
            </span>
            <button className="btn rs-save" onClick={() => remove(a)}>
              Desconectar
            </button>
          </div>
        ))}
        <div className="rs-hint">Los tokens se guardan cifrados con el almacén del sistema (safeStorage).</div>
      </div>

      <div className="rs-section">
        <div className="rs-title">Conectar otra cuenta</div>
        <div className="rs-row">
          <span className="rs-label">Proveedor</span>
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value as ProviderKind
              setProvider(p)
              setHost(PROVIDER_OPTIONS.find((o) => o.id === p)?.host ?? '')
            }}
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rs-row">
          <span className="rs-label">Host</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} spellCheck={false} />
        </div>
        <div className="rs-row">
          <span className="rs-label">Token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="token de acceso personal"
            spellCheck={false}
          />
        </div>
        {!selectedProvider.validated && (
          <div className="rs-row">
            <span className="rs-label">Usuario</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="nombre de usuario de la cuenta"
              spellCheck={false}
            />
          </div>
        )}
        <button className="btn primary rs-save" disabled={adding || !token.trim()} onClick={add}>
          {adding ? 'Validando…' : 'Conectar cuenta'}
        </button>
        <div className="rs-hint">
          {selectedProvider.validated
            ? 'El token se valida contra la API del proveedor al conectar.'
            : 'Este proveedor aún no se valida online: indica el usuario manualmente.'}
        </div>
      </div>

      {repo && (
        <div className="rs-section">
          <div className="rs-title">Cuenta para este repositorio ({repo.name})</div>
          <div className="rs-row">
            <span className="rs-label">Usar</span>
            <select value={repoAccount} onChange={(e) => assign(e.target.value)}>
              <option value="">Automática (credential helper de git)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {providerLabel(a.provider)} — {a.username}@{a.host}
                </option>
              ))}
            </select>
          </div>
          <div className="rs-hint">Se usa para Pull Requests e Issues de este repositorio.</div>
        </div>
      )}
    </>
  )
}

// -------------------------------------------------------------------- Atajos

function ShortcutsTab(): JSX.Element {
  const shortcuts = useSettings((s) => s.shortcuts)
  const setShortcut = useSettings((s) => s.setShortcut)
  const resetShortcuts = useSettings((s) => s.resetShortcuts)
  const notify = useStore((s) => s.notify)
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null)

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setShortcut(capturing, '')
        setCapturing(null)
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return // solo modificadores: sigue esperando
      if (isReservedCombo(combo)) {
        notify('error', `${combo} está reservado por el sistema`)
        return
      }
      const clash = setShortcut(capturing, combo)
      if (clash) {
        notify('error', `${combo} ya está asignado a «${SHORTCUT_LABELS[clash]}»`)
        return
      }
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, setShortcut, notify])

  return (
    <div className="rs-section">
      <div className="rs-title">Atajos de teclado</div>
      <div className="rs-hint">
        Clic en un atajo para reasignarlo: pulsa la combinación nueva, Retroceso para quitarlo o Escape para
        cancelar.
      </div>
      {(Object.keys(SHORTCUT_LABELS) as ShortcutAction[]).map((a) => (
        <div key={a} className="rs-row st-shortcut-row">
          <span className="rs-label st-shortcut-label">{SHORTCUT_LABELS[a]}</span>
          <button
            className={`st-combo${capturing === a ? ' capturing' : ''}${shortcuts[a] ? '' : ' empty'}`}
            onClick={() => setCapturing(capturing === a ? null : a)}
          >
            {capturing === a ? 'Pulsa la combinación…' : shortcuts[a] || 'Sin asignar'}
          </button>
          {shortcuts[a] !== DEFAULT_SHORTCUTS[a] && (
            <button
              className="icon-btn st-combo-reset"
              title={`Restaurar (${DEFAULT_SHORTCUTS[a] || 'sin asignar'})`}
              onClick={() => setShortcut(a, DEFAULT_SHORTCUTS[a])}
            >
              ↺
            </button>
          )}
        </div>
      ))}
      <button className="btn rs-save" onClick={resetShortcuts}>
        Restaurar todos por defecto
      </button>
    </div>
  )
}

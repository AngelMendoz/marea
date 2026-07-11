import { FileSignature, FileText, Settings, Webhook, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { create } from 'zustand'
import type { GpgKey, HooksInfo } from '@shared/types'
import { bridge } from '../bridge'
import { useStore } from '../store'

interface RepoSettingsState {
  open: boolean
  openPanel: () => void
  close: () => void
}

export const useRepoSettings = create<RepoSettingsState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  close: () => set({ open: false })
}))

const CONFIG_KEYS = [
  'commit.gpgsign',
  'tag.gpgSign',
  'gpg.format',
  'user.signingkey',
  'gpg.ssh.allowedSignersFile',
  'commit.template'
]

/** Ajustes del repositorio: firma de commits (GPG/SSH), hooks
 *  presentes y plantilla de mensaje de commit. */
export function RepoSettings(): JSX.Element | null {
  const open = useRepoSettings((s) => s.open)
  const close = useRepoSettings((s) => s.close)
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)

  const [cfg, setCfg] = useState<Record<string, string> | null>(null)
  const [gpgKeys, setGpgKeys] = useState<GpgKey[]>([])
  const [sshKeys, setSshKeys] = useState<string[]>([])
  const [hooks, setHooks] = useState<HooksInfo | null>(null)
  const [template, setTemplate] = useState('')
  // Borrador editable de la sección de firma.
  const [sign, setSign] = useState(false)
  const [signTags, setSignTags] = useState(false)
  const [format, setFormat] = useState<'openpgp' | 'ssh'>('openpgp')
  const [key, setKey] = useState('')
  const [signersFile, setSignersFile] = useState('')
  const [templatePath, setTemplatePath] = useState('')
  const [toGlobal, setToGlobal] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!repo) return
    const [c, gk, sk, hi, tpl] = await Promise.all([
      bridge.getConfig(repo.path, CONFIG_KEYS),
      bridge.listGpgKeys(),
      bridge.listSshKeys(),
      bridge.hooksInfo(repo.path).catch((): HooksInfo => ({ dir: '', hooks: [] })),
      bridge.commitTemplate(repo.path).catch(() => '')
    ])
    setCfg(c)
    setGpgKeys(gk)
    setSshKeys(sk)
    setHooks(hi)
    setTemplate(tpl)
    setSign(c['commit.gpgsign'] === 'true')
    setSignTags(c['tag.gpgSign'] === 'true')
    setFormat(c['gpg.format'] === 'ssh' ? 'ssh' : 'openpgp')
    setKey(c['user.signingkey'] ?? '')
    setSignersFile(c['gpg.ssh.allowedSignersFile'] ?? '')
    setTemplatePath(c['commit.template'] ?? '')
  }, [repo])

  useEffect(() => {
    if (open) {
      setCfg(null)
      void load()
    }
  }, [open, load])

  if (!open || !repo) return null

  const saveSigning = (): void => {
    void run('Configuración de firma guardada', async () => {
      const opts = { global: toGlobal }
      await bridge.setConfig(repo.path, 'commit.gpgsign', sign ? 'true' : '', opts)
      await bridge.setConfig(repo.path, 'tag.gpgSign', signTags ? 'true' : '', opts)
      await bridge.setConfig(repo.path, 'gpg.format', format === 'ssh' ? 'ssh' : '', opts)
      await bridge.setConfig(repo.path, 'user.signingkey', key.trim(), opts)
      if (format === 'ssh') {
        await bridge.setConfig(repo.path, 'gpg.ssh.allowedSignersFile', signersFile.trim(), opts)
      }
    }).then(load)
  }

  const saveTemplate = (): void => {
    void run('Plantilla de commit guardada', () =>
      bridge.setConfig(repo.path, 'commit.template', templatePath.trim())
    ).then(load)
  }

  return (
    <div className="pr-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="pr-panel rs-panel">
        <div className="pr-head">
          <Settings size={16} color="var(--accent)" />
          <h3>Ajustes del repositorio</h3>
          <span className="pr-repo">{repo.name}</span>
          <button className="icon-btn" onClick={close} title="Cerrar">
            <X size={16} />
          </button>
        </div>

        {!cfg ? (
          <div className="pr-body">
            <span className="pr-empty">Leyendo configuración…</span>
          </div>
        ) : (
          <div className="pr-body rs-body">
            {/* ---- Firma de commits ---- */}
            <div className="rs-section">
              <div className="rs-title">
                <FileSignature size={14} /> Firma de commits
              </div>
              <label className="rs-check">
                <input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} />
                Firmar commits automáticamente (commit.gpgsign)
              </label>
              <label className="rs-check">
                <input type="checkbox" checked={signTags} onChange={(e) => setSignTags(e.target.checked)} />
                Firmar tags anotados (tag.gpgSign)
              </label>

              <div className="rs-row">
                <span className="rs-label">Formato</span>
                <div className="seg small">
                  <button className={format === 'openpgp' ? 'active' : ''} onClick={() => setFormat('openpgp')}>
                    GPG
                  </button>
                  <button className={format === 'ssh' ? 'active' : ''} onClick={() => setFormat('ssh')}>
                    SSH
                  </button>
                </div>
              </div>

              <div className="rs-row">
                <span className="rs-label">Clave</span>
                {format === 'openpgp' ? (
                  gpgKeys.length > 0 ? (
                    <select value={key} onChange={(e) => setKey(e.target.value)}>
                      <option value="">(elegir clave GPG)</option>
                      {gpgKeys.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.uid || k.id} — {k.id.slice(-8)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rs-hint">No se encontraron claves GPG (¿gpg instalado?)</span>
                  )
                ) : (
                  <select value={key} onChange={(e) => setKey(e.target.value)}>
                    <option value="">(elegir clave pública SSH)</option>
                    {sshKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                    {key && !sshKeys.includes(key) && <option value={key}>{key}</option>}
                  </select>
                )}
              </div>

              {format === 'ssh' && (
                <div className="rs-row">
                  <span className="rs-label" title="Archivo «correo clave-pública» que git usa para VERIFICAR firmas SSH">
                    Allowed signers
                  </span>
                  <input
                    value={signersFile}
                    onChange={(e) => setSignersFile(e.target.value)}
                    placeholder="ruta a allowed_signers (opcional, para verificar)"
                    spellCheck={false}
                  />
                </div>
              )}

              <label className="rs-check">
                <input type="checkbox" checked={toGlobal} onChange={(e) => setToGlobal(e.target.checked)} />
                Guardar en la configuración global (todos los repositorios)
              </label>
              <button className="btn primary rs-save" onClick={saveSigning}>
                Guardar firma
              </button>
            </div>

            {/* ---- Hooks ---- */}
            <div className="rs-section">
              <div className="rs-title">
                <Webhook size={14} /> Hooks
              </div>
              {hooks && hooks.hooks.length > 0 ? (
                <>
                  <div className="rs-hint" title={hooks.dir}>
                    {hooks.hooks.length} hook{hooks.hooks.length !== 1 ? 's' : ''} activo
                    {hooks.hooks.length !== 1 ? 's' : ''} en {hooks.dir}
                  </div>
                  <div className="rs-chips">
                    {hooks.hooks.map((h) => (
                      <span key={h} className="rs-chip">
                        {h}
                      </span>
                    ))}
                  </div>
                  <div className="rs-hint">
                    Se ejecutan en cada commit; puedes saltarlos puntualmente con «Saltar hooks» en el
                    panel de commit.
                  </div>
                </>
              ) : (
                <div className="rs-hint">Este repositorio no tiene hooks activos.</div>
              )}
            </div>

            {/* ---- Plantilla de commit ---- */}
            <div className="rs-section">
              <div className="rs-title">
                <FileText size={14} /> Plantilla de mensaje (commit.template)
              </div>
              <div className="rs-row">
                <span className="rs-label">Archivo</span>
                <input
                  value={templatePath}
                  onChange={(e) => setTemplatePath(e.target.value)}
                  placeholder="ruta a la plantilla (vacío = sin plantilla)"
                  spellCheck={false}
                />
                <button className="btn rs-save" onClick={saveTemplate}>
                  Guardar
                </button>
              </div>
              {template && (
                <pre className="rs-preview" title="Contenido actual de la plantilla">
                  {template}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

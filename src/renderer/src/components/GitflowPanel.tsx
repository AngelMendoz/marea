import { GitBranchPlus, GitMerge, Workflow, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { create } from 'zustand'
import type { GitflowConfig, GitflowType } from '@shared/types'
import { bridge } from '../bridge'
import { useDialog } from '../dialog'
import { useModalLayer } from '../lib/modalLayer'
import { useStore } from '../store'

interface GitflowPanelState {
  open: boolean
  openPanel: () => void
  close: () => void
}

export const useGitflowPanel = create<GitflowPanelState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  close: () => set({ open: false })
}))

const TYPE_LABEL: Record<GitflowType, string> = {
  feature: 'Feature',
  release: 'Release',
  hotfix: 'Hotfix'
}

export function GitflowPanel(): JSX.Element | null {
  const open = useGitflowPanel((s) => s.open)
  const close = useGitflowPanel((s) => s.close)
  const repo = useStore((s) => s.repo)
  const branches = useStore((s) => s.branches)
  const run = useStore((s) => s.run)
  const { openConfirm, openPrompt } = useDialog()
  const layer = useModalLayer(open)

  const [cfg, setCfg] = useState<GitflowConfig | null>(null)
  const [draft, setDraft] = useState<GitflowConfig | null>(null)
  const [names, setNames] = useState<Record<GitflowType, string>>({ feature: '', release: '', hotfix: '' })

  const load = useCallback(async (): Promise<void> => {
    if (!repo) return
    try {
      const c = await bridge.gitflowConfig(repo.path)
      setCfg(c)
      setDraft(c)
    } catch {
      setCfg(null)
    }
  }, [repo])

  useEffect(() => {
    if (open) {
      setCfg(null)
      setDraft(null)
      setNames({ feature: '', release: '', hotfix: '' })
      void load()
    }
  }, [open, load])

  if (!open || !repo) return null

  const doInit = (): void => {
    if (!draft) return
    void run('Inicializar Gitflow', () => bridge.gitflowInit(repo.path, draft)).then(load)
  }

  const start = (type: GitflowType): void => {
    const name = names[type].trim()
    if (!name || !cfg) return
    void run(`Crear ${TYPE_LABEL[type]}`, () => bridge.gitflowStart(repo.path, type, name)).then(() => {
      setNames((n) => ({ ...n, [type]: '' }))
      return load()
    })
  }

  const finish = (type: GitflowType, name: string): void => {
    if (!cfg) return
    if (type === 'feature') {
      openConfirm({
        title: 'Finalizar Feature',
        message: `Se hará merge --no-ff de «${cfg.featurePrefix}${name}» en «${cfg.develop}» y se eliminará la rama. ¿Continuar?`,
        confirmText: 'Finalizar',
        onConfirm: () =>
          void run('Finalizar Feature', () => bridge.gitflowFinish(repo.path, type, name)).then(load)
      })
      return
    }
    openPrompt({
      title: `Finalizar ${TYPE_LABEL[type]}`,
      label: `Merge en «${cfg.master}» y «${cfg.develop}», luego se elimina la rama. Tag (vacío = sin tag):`,
      defaultValue: `${cfg.tagPrefix}${name}`,
      confirmText: 'Finalizar',
      onConfirm: (value) =>
        void run(`Finalizar ${TYPE_LABEL[type]}`, () =>
          bridge.gitflowFinish(repo.path, type, name, {
            tag: !!value.trim(),
            tagName: value.trim() || undefined
          })
        ).then(load)
    })
  }

  // Ramas gitflow existentes, agrupadas por tipo según los prefijos configurados.
  const flowBranches: { type: GitflowType; name: string; full: string }[] = []
  if (cfg?.initialized && branches) {
    for (const b of branches.local) {
      if (b.name.startsWith(cfg.featurePrefix))
        flowBranches.push({ type: 'feature', name: b.name.slice(cfg.featurePrefix.length), full: b.name })
      else if (b.name.startsWith(cfg.releasePrefix))
        flowBranches.push({ type: 'release', name: b.name.slice(cfg.releasePrefix.length), full: b.name })
      else if (b.name.startsWith(cfg.hotfixPrefix))
        flowBranches.push({ type: 'hotfix', name: b.name.slice(cfg.hotfixPrefix.length), full: b.name })
    }
  }

  const patch = (p: Partial<GitflowConfig>): void => setDraft((d) => (d ? { ...d, ...p } : d))

  return (
    <div className="pr-overlay" style={{ zIndex: layer }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="pr-panel gf-panel">
        <div className="pr-head">
          <Workflow size={16} color="var(--accent)" />
          <h3>Gitflow</h3>
          <span className="pr-repo">{repo.name}</span>
          <button className="icon-btn" onClick={close} title="Cerrar">
            <X size={16} />
          </button>
        </div>

        {!cfg || !draft ? (
          <div className="pr-body">
            <span className="pr-empty">Leyendo configuración…</span>
          </div>
        ) : !cfg.initialized ? (
          <div className="pr-body">
            <p className="mt-desc" style={{ margin: 0 }}>
              Gitflow define un modelo de ramas: una rama estable (
              <span className="mt-branch">{draft.master}</span>), una de integración (
              <span className="mt-branch target">{draft.develop}</span>) y prefijos para features,
              releases y hotfixes.
            </p>
            <div className="gf-grid">
              <label>
                Rama estable (master)
                <input value={draft.master} onChange={(e) => patch({ master: e.target.value })} spellCheck={false} />
              </label>
              <label>
                Rama de integración (develop)
                <input value={draft.develop} onChange={(e) => patch({ develop: e.target.value })} spellCheck={false} />
              </label>
              <label>
                Prefijo de features
                <input value={draft.featurePrefix} onChange={(e) => patch({ featurePrefix: e.target.value })} spellCheck={false} />
              </label>
              <label>
                Prefijo de releases
                <input value={draft.releasePrefix} onChange={(e) => patch({ releasePrefix: e.target.value })} spellCheck={false} />
              </label>
              <label>
                Prefijo de hotfixes
                <input value={draft.hotfixPrefix} onChange={(e) => patch({ hotfixPrefix: e.target.value })} spellCheck={false} />
              </label>
              <label>
                Prefijo de tags (versiones)
                <input value={draft.tagPrefix} placeholder="v" onChange={(e) => patch({ tagPrefix: e.target.value })} spellCheck={false} />
              </label>
            </div>
            <p className="pr-warn" style={{ margin: 0 }}>
              Si «{draft.develop}» no existe, se creará desde «{draft.master}».
            </p>
            <button className="btn primary" style={{ marginTop: 0 }} onClick={doInit}>
              Inicializar Gitflow
            </button>
          </div>
        ) : (
          <div className="pr-body">
            <div className="gf-summary">
              <span className="ref-chip localBranch" title="Rama estable">
                <GitMerge /> {cfg.master}
              </span>
              <span className="ref-chip head" title="Rama de integración">
                <GitMerge /> {cfg.develop}
              </span>
              <span className="gf-prefixes">
                {cfg.featurePrefix} · {cfg.releasePrefix} · {cfg.hotfixPrefix}
                {cfg.tagPrefix ? ` · tags «${cfg.tagPrefix}»` : ''}
              </span>
            </div>

            {(['feature', 'release', 'hotfix'] as GitflowType[]).map((t) => (
              <div key={t} className="gf-row">
                <span className={`gf-kind ${t}`}>{TYPE_LABEL[t]}</span>
                <input
                  placeholder={
                    t === 'feature' ? 'nombre-de-la-feature' : t === 'release' ? '1.4.0' : 'fix-urgente'
                  }
                  value={names[t]}
                  spellCheck={false}
                  onChange={(e) => setNames((n) => ({ ...n, [t]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && start(t)}
                />
                <button
                  className="hunk-btn accent"
                  disabled={!names[t].trim()}
                  title={
                    t === 'hotfix'
                      ? `Crea ${cfg.hotfixPrefix}${names[t] || '…'} desde ${cfg.master}`
                      : `Crea la rama desde ${cfg.develop}`
                  }
                  onClick={() => start(t)}
                >
                  <GitBranchPlus size={13} /> Iniciar
                </button>
              </div>
            ))}

            <div>
              <div className="gf-list-head">Ramas Gitflow activas</div>
              {flowBranches.length === 0 ? (
                <span className="pr-empty">No hay features, releases ni hotfixes en curso.</span>
              ) : (
                flowBranches.map((fb) => (
                  <div key={fb.full} className="gf-branch">
                    <span className={`gf-kind ${fb.type}`}>{TYPE_LABEL[fb.type]}</span>
                    <span className="name" title={fb.full}>
                      {fb.full}
                    </span>
                    <button className="hunk-btn" title="Integrar y eliminar la rama" onClick={() => finish(fb.type, fb.name)}>
                      <GitMerge size={13} /> Finalizar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

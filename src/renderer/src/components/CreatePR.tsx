import { GitPullRequest, X, ArrowRight, ExternalLink, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GhLabel } from '@shared/types'
import { bridge } from '../bridge'
import { usePRPanel } from '../prPanel'
import { useStore } from '../store'

const PROVIDERS = [
  { id: 'github', name: 'GitHub', enabled: true },
  { id: 'gitlab', name: 'GitLab', enabled: false },
  { id: 'bitbucket', name: 'Bitbucket', enabled: false }
]

function prettify(branch: string): string {
  const last = branch.split('/').pop() || branch
  const s = last.replace(/[-_]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function CreatePR(): JSX.Element | null {
  const { open, head, base, close } = usePRPanel()
  const { repo, branches, notify } = useStore()

  const localNames = useMemo(() => branches?.local.map((b) => b.name) ?? [], [branches])
  const baseNames = useMemo(() => {
    const remoteShorts = (branches?.remote ?? []).map((b) => b.name.replace(/^[^/]+\//, ''))
    return [...new Set([...localNames, ...remoteShorts])]
  }, [branches, localNames])

  const defaultHead = head || branches?.current || localNames[0] || ''
  const preferredBase = ['main', 'master', 'develop']
  const defaultBase =
    base ||
    preferredBase.find((b) => baseNames.includes(b) && b !== defaultHead) ||
    baseNames.find((b) => b !== defaultHead) ||
    ''

  const [provider, setProvider] = useState('github')
  const [fromBranch, setFromBranch] = useState(defaultHead)
  const [toBranch, setToBranch] = useState(defaultBase)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ownerRepo, setOwnerRepo] = useState('')
  const [collaborators, setCollaborators] = useState<string[]>([])
  const [labels, setLabels] = useState<GhLabel[]>([])
  const [reviewers, setReviewers] = useState<string[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [selLabels, setSelLabels] = useState<string[]>([])

  useEffect(() => {
    if (!open || !repo) return
    setProvider('github')
    setFromBranch(defaultHead)
    setToBranch(defaultBase)
    setTitle('')
    setDescription('')
    setDraft(false)
    setReviewers([])
    setAssignees([])
    setSelLabels([])
    bridge.githubHostInfo(repo.path).then((h) => setOwnerRepo(`${h.owner}/${h.repo}`)).catch(() => setOwnerRepo(''))
    bridge.listCollaborators(repo.path).then(setCollaborators).catch(() => setCollaborators([]))
    bridge.listLabels(repo.path).then(setLabels).catch(() => setLabels([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || !repo) return null

  const toggle = (list: string[], set: (v: string[]) => void, v: string): void =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const generate = (): void => {
    setTitle(prettify(fromBranch))
    setDescription(`## Cambios\n\n- \n\n## Notas\n\nPR de \`${fromBranch}\` → \`${toBranch}\`.`)
  }

  const continueOnGitHub = (): void => {
    if (!ownerRepo) return
    bridge.openExternal(`https://github.com/${ownerRepo}/compare/${toBranch}...${fromBranch}?expand=1`)
  }

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      notify('error', 'El PR necesita un título')
      return
    }
    setBusy(true)
    try {
      const pr = await bridge.createPullRequest(repo.path, {
        title: title.trim(),
        body: description,
        head: fromBranch,
        base: toBranch,
        draft,
        reviewers,
        assignees,
        labels: selLabels
      })
      notify('success', `Pull Request #${pr.number} creado`)
      bridge.openExternal(pr.url)
      close()
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo crear el PR')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pr-overlay" onMouseDown={close}>
      <div className="pr-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pr-head">
          <GitPullRequest size={17} color="var(--accent)" />
          <h3>Crear Pull Request</h3>
          <button className="icon-btn" onClick={close} title="Cerrar" style={{ marginLeft: 'auto' }}>
            <X size={16} />
          </button>
        </div>

        <div className="pr-tabs">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`pr-tab${provider === p.id ? ' active' : ''}`}
              disabled={!p.enabled}
              title={p.enabled ? p.name : `${p.name}: próximamente`}
              onClick={() => p.enabled && setProvider(p.id)}
            >
              {p.name}
              {!p.enabled && <span className="soon">próximamente</span>}
            </button>
          ))}
        </div>

        <div className="pr-body">
          <div className="pr-repos">
            <label>
              From Repo
              <div className="pr-static">{ownerRepo || '—'}</div>
            </label>
            <ArrowRight size={16} className="pr-arrow" />
            <label>
              To Repo
              <div className="pr-static">{ownerRepo || '—'}</div>
            </label>
          </div>

          <div className="pr-repos">
            <label>
              Branch (desde)
              <select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)}>
                {localNames.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight size={16} className="pr-arrow" />
            <label>
              Branch (hacia)
              <select value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
                {baseNames.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="pr-field">
            <span className="pr-label-row">
              Título
              <button className="mini" onClick={generate} title="Generar título y descripción">
                <Sparkles size={13} /> Generar
              </button>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del pull request" />
          </label>

          <label className="pr-field">
            Descripción
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe los cambios…" />
          </label>

          <div className="pr-field">
            Reviewers
            <div className="pr-chips">
              {collaborators.length === 0 && <span className="pr-empty">Sin colaboradores</span>}
              {collaborators.map((c) => (
                <button
                  key={c}
                  className={`chip${reviewers.includes(c) ? ' on' : ''}`}
                  onClick={() => toggle(reviewers, setReviewers, c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="pr-field">
            Assignees
            <div className="pr-chips">
              {collaborators.length === 0 && <span className="pr-empty">Sin colaboradores</span>}
              {collaborators.map((c) => (
                <button
                  key={c}
                  className={`chip${assignees.includes(c) ? ' on' : ''}`}
                  onClick={() => toggle(assignees, setAssignees, c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="pr-field">
            Labels
            <div className="pr-chips">
              {labels.length === 0 && <span className="pr-empty">Sin labels</span>}
              {labels.map((l) => (
                <button
                  key={l.name}
                  className={`chip${selLabels.includes(l.name) ? ' on' : ''}`}
                  style={selLabels.includes(l.name) ? { borderColor: l.color, color: l.color } : undefined}
                  onClick={() => toggle(selLabels, setSelLabels, l.name)}
                >
                  <span className="chip-dot" style={{ background: l.color }} />
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <label className="pr-check">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            Enviar como borrador (draft)
          </label>
        </div>

        <div className="pr-actions">
          <button className="btn" onClick={close}>
            Cancelar
          </button>
          <button className="btn primary inline" disabled={busy || fromBranch === toBranch} onClick={submit}>
            {busy ? 'Creando…' : 'Create Pull Request'}
          </button>
        </div>
        <button className="pr-continue" onClick={continueOnGitHub}>
          <ExternalLink size={13} /> Continuar editando en GitHub
        </button>
      </div>
    </div>
  )
}

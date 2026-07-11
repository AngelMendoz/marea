import { CircleDot, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { GhLabel } from '@shared/types'
import { bridge } from '../bridge'
import { useCenterView } from '../centerView'
import { useIssueList } from '../issueList'
import { useStore } from '../store'

interface CreateIssuePanelState {
  open: boolean
  openPanel: () => void
  close: () => void
}

export const useCreateIssuePanel = create<CreateIssuePanelState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  close: () => set({ open: false })
}))

export function CreateIssue(): JSX.Element | null {
  const { open, close } = useCreateIssuePanel()
  const { repo, notify } = useStore()
  const openIssue = useCenterView((s) => s.openIssue)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState<GhLabel[]>([])
  const [collaborators, setCollaborators] = useState<string[]>([])
  const [selLabels, setSelLabels] = useState<string[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !repo) return
    setTitle('')
    setBody('')
    setSelLabels([])
    setAssignees([])
    bridge.listLabels(repo.path).then(setLabels).catch(() => setLabels([]))
    bridge.listCollaborators(repo.path).then(setCollaborators).catch(() => setCollaborators([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || !repo) return null

  const toggle = (list: string[], set: (v: string[]) => void, v: string): void =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      notify('error', 'El issue necesita un título')
      return
    }
    setBusy(true)
    try {
      const issue = await bridge.createIssue(repo.path, {
        title: title.trim(),
        body,
        labels: selLabels,
        assignees
      })
      notify('success', `Issue #${issue.number} creado`)
      close()
      useIssueList.getState().load(repo.path)
      openIssue(issue.number)
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo crear el issue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pr-overlay" onMouseDown={close}>
      <div className="pr-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pr-head">
          <CircleDot size={17} color="var(--accent-green)" />
          <h3>Crear Issue</h3>
          <button className="icon-btn" onClick={close} title="Cerrar" style={{ marginLeft: 'auto' }}>
            <X size={16} />
          </button>
        </div>

        <div className="pr-body">
          <label className="pr-field">
            Título *
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del issue"
            />
          </label>

          <label className="pr-field">
            Descripción
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe el problema o la propuesta…" />
          </label>

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
        </div>

        <div className="pr-actions">
          <button className="btn" onClick={close}>
            Cancelar
          </button>
          <button className="btn primary inline" disabled={busy || !title.trim()} onClick={submit}>
            {busy ? 'Creando…' : 'Crear Issue'}
          </button>
        </div>
      </div>
    </div>
  )
}

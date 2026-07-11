import { GripVertical, ListOrdered, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import type { Commit, RebaseAction, RebasePlanItem } from '@shared/types'
import { bridge } from '../bridge'
import { useStore } from '../store'

interface RebasePanelState {
  open: boolean
  /** Ref sobre la que se rebasa (rama o commit destino). */
  base: string
  baseLabel: string
  /** Rama que se reescribe (por defecto la actual). */
  head: string
  headLabel: string
  openPanel: (opts: { base: string; baseLabel?: string; head?: string; headLabel?: string }) => void
  close: () => void
}

export const useRebasePanel = create<RebasePanelState>((set) => ({
  open: false,
  base: '',
  baseLabel: '',
  head: 'HEAD',
  headLabel: '',
  openPanel: ({ base, baseLabel, head, headLabel }) =>
    set({
      open: true,
      base,
      baseLabel: baseLabel ?? base,
      head: head ?? 'HEAD',
      headLabel: headLabel ?? head ?? 'HEAD'
    }),
  close: () => set({ open: false })
}))

interface PlanRow {
  commit: Commit
  action: RebaseAction
  message: string
}

const ACTIONS: { value: RebaseAction; label: string; key: string }[] = [
  { value: 'pick', label: 'Pick', key: 'P' },
  { value: 'reword', label: 'Reword', key: 'R' },
  { value: 'squash', label: 'Squash', key: 'S' },
  { value: 'fixup', label: 'Fixup', key: 'F' },
  { value: 'drop', label: 'Drop', key: 'D' }
]

export function InteractiveRebase(): JSX.Element | null {
  const open = useRebasePanel((s) => s.open)
  const base = useRebasePanel((s) => s.base)
  const baseLabel = useRebasePanel((s) => s.baseLabel)
  const head = useRebasePanel((s) => s.head)
  const headLabel = useRebasePanel((s) => s.headLabel)
  const close = useRebasePanel((s) => s.close)
  const repo = useStore((s) => s.repo)
  const run = useStore((s) => s.run)
  const notify = useStore((s) => s.notify)

  const [rows, setRows] = useState<PlanRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(0)
  const dragIdx = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !repo) return
    setRows(null)
    setError(null)
    setFocused(0)
    bridge
      .commitsSince(repo.path, base, head)
      .then((commits) =>
        setRows(commits.map((c) => ({ commit: c, action: 'pick' as RebaseAction, message: c.subject })))
      )
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer el rango'))
  }, [open, repo, base, head])

  const hasMerges = useMemo(() => !!rows?.some((r) => r.commit.parents.length > 1), [rows])
  const firstBad = useMemo(() => {
    const eff = rows?.filter((r) => r.action !== 'drop') ?? []
    return eff.length > 0 && (eff[0].action === 'squash' || eff[0].action === 'fixup')
  }, [rows])
  const allDropped = useMemo(() => !!rows && rows.length > 0 && rows.every((r) => r.action === 'drop'), [rows])

  // Atajos P/R/S/F/D sobre la fila enfocada.
  useEffect(() => {
    if (!open || !rows) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const act = ACTIONS.find((a) => a.key.toLowerCase() === e.key.toLowerCase())
      if (!act) return
      e.preventDefault()
      setRows((rs) => rs?.map((r, i) => (i === focused ? { ...r, action: act.value } : r)) ?? rs)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, rows, focused])

  if (!open || !repo) return null

  const move = (from: number, to: number): void => {
    setRows((rs) => {
      if (!rs || to < 0 || to >= rs.length) return rs
      const next = [...rs]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const start = (): void => {
    if (!rows) return
    const plan: RebasePlanItem[] = rows.map((r) => ({
      hash: r.commit.hash,
      action: r.action,
      message:
        r.action === 'reword' || r.action === 'squash' ? r.message.trim() || undefined : undefined
    }))
    close()
    void run('Rebase interactivo', async () => {
      const res = await bridge.interactiveRebase(repo.path, base, plan, { autostash: true, head })
      if (!res.completed) {
        notify('info', 'El rebase se detuvo por conflictos: resuélvelos y continúa desde el banner.')
      }
    })
  }

  return (
    <div className="pr-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="pr-panel ir-panel">
        <div className="pr-head">
          <ListOrdered size={16} color="var(--accent)" />
          <h3>Rebase interactivo</h3>
          <span className="pr-repo">
            {headLabel || 'HEAD'} sobre {baseLabel}
          </span>
          <button className="icon-btn" onClick={close} title="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="ir-body">
          {error && <div className="pr-warn">{error}</div>}
          {!rows && !error && <span className="pr-empty">Leyendo commits…</span>}
          {rows && rows.length === 0 && (
            <span className="pr-empty">No hay commits entre {baseLabel} y {headLabel || 'HEAD'}.</span>
          )}

          {rows && rows.length > 0 && (
            <>
              <p className="ir-hint">
                Se aplican <strong>de arriba hacia abajo</strong>. Arrastra para reordenar; atajos:{' '}
                <kbd>P</kbd> pick · <kbd>R</kbd> reword · <kbd>S</kbd> squash · <kbd>F</kbd> fixup ·{' '}
                <kbd>D</kbd> drop. Squash/fixup se combinan con el commit de arriba.
              </p>
              <div className="ir-list" ref={listRef}>
                {rows.map((r, i) => (
                  <div
                    key={r.commit.hash}
                    className={`ir-row${i === focused ? ' focused' : ''} act-${r.action}`}
                    draggable
                    onClick={() => setFocused(i)}
                    onDragStart={(e) => {
                      dragIdx.current = i
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      const from = dragIdx.current
                      if (from == null || from === i) return
                      move(from, i)
                      dragIdx.current = i
                    }}
                    onDragEnd={() => (dragIdx.current = null)}
                  >
                    <GripVertical size={13} className="ir-grip" />
                    <select
                      className={`ir-action act-${r.action}`}
                      value={r.action}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const action = e.target.value as RebaseAction
                        setRows((rs) => rs!.map((x, xi) => (xi === i ? { ...x, action } : x)))
                        setFocused(i)
                      }}
                    >
                      {ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <span className="sha">{r.commit.shortHash}</span>
                    {r.action === 'reword' || r.action === 'squash' ? (
                      <input
                        className="ir-msg"
                        value={r.message}
                        placeholder="Mensaje del commit resultante"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setRows((rs) => rs!.map((x, xi) => (xi === i ? { ...x, message: e.target.value } : x)))
                        }
                      />
                    ) : (
                      <span className={`ir-subject${r.action === 'drop' ? ' dropped' : ''}`}>
                        {r.commit.subject}
                      </span>
                    )}
                    <span className="ir-author">{r.commit.authorName}</span>
                  </div>
                ))}
              </div>

              {hasMerges && (
                <div className="pr-warn">
                  <TriangleAlert size={13} /> El rango contiene commits de merge: el rebase lineal
                  reescribe esa topología.
                </div>
              )}
              {firstBad && (
                <div className="pr-warn">
                  <TriangleAlert size={13} /> El primer commit no puede ser squash/fixup (no tiene padre
                  donde combinarse).
                </div>
              )}
              {allDropped && (
                <div className="pr-warn">
                  <TriangleAlert size={13} /> No puedes hacer drop de todos los commits.
                </div>
              )}
              <p className="ir-warning-static">
                ⚠️ El rebase <strong>reescribe la historia</strong> de {headLabel || 'la rama actual'}; si ya
                fue publicada necesitarás force push. Los cambios sin confirmar se guardan con autostash.
              </p>
            </>
          )}
        </div>

        <div className="pr-actions">
          <button className="btn inline" onClick={close}>
            Cancelar
          </button>
          <button
            className="btn inline primary"
            style={{ width: 'auto', marginTop: 0 }}
            disabled={!rows || rows.length === 0 || firstBad || allDropped || hasMerges}
            onClick={start}
          >
            Iniciar rebase
          </button>
        </div>
      </div>
    </div>
  )
}

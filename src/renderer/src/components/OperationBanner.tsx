import { CircleAlert, OctagonX, Play } from 'lucide-react'
import type { OperationKind } from '@shared/types'
import { bridge } from '../bridge'
import { useDialog } from '../dialog'
import { useStore } from '../store'

const KIND_LABEL: Record<OperationKind, string> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert'
}

/** Banner bajo la toolbar cuando hay merge/rebase/cherry-pick/revert en curso. */
export function OperationBanner(): JSX.Element | null {
  const repo = useStore((s) => s.repo)
  const operation = useStore((s) => s.operation)
  // Selectores primitivos: devolver arrays nuevos aquí causaría re-render infinito.
  const pending = useStore((s) => s.status?.conflicted.length ?? 0)
  const firstConflict = useStore((s) => s.status?.conflicted[0]?.path ?? null)
  const run = useStore((s) => s.run)
  const setSelectedFile = useStore((s) => s.setSelectedFile)
  const setSelection = useStore((s) => s.setSelection)
  const { openConfirm } = useDialog()

  if (!repo || !operation?.kind) return null

  const label = KIND_LABEL[operation.kind]
  const progress =
    operation.kind === 'rebase' && operation.total ? ` (${operation.step ?? 0}/${operation.total})` : ''

  const openFirstConflict = (): void => {
    if (!firstConflict) return
    setSelection({ kind: 'wip' })
    setSelectedFile({ path: firstConflict, conflicted: true })
  }

  return (
    <div className="op-banner">
      <CircleAlert size={14} />
      <span>
        <strong>{label} en curso{progress}.</strong>{' '}
        {pending > 0 ? (
          <>
            {pending} archivo{pending !== 1 ? 's' : ''} en conflicto —{' '}
            <button className="op-link" onClick={openFirstConflict}>
              resolver
            </button>
          </>
        ) : (
          'Conflictos resueltos: puedes continuar.'
        )}
      </span>
      <span className="spacer" />
      <button
        className="bb-btn good"
        title={pending > 0 ? 'Aún hay conflictos sin resolver' : `Continuar el ${label.toLowerCase()}`}
        disabled={pending > 0}
        onClick={() => run(`Continuar ${label.toLowerCase()}`, () => bridge.continueOperation(repo.path))}
      >
        <Play size={13} /> Continuar
      </button>
      <button
        className="bb-btn bad"
        title="Abandona la operación y vuelve al estado anterior"
        onClick={() =>
          openConfirm({
            title: `Abortar ${label.toLowerCase()}`,
            message: `Se abandonará el ${label.toLowerCase()} en curso y el repositorio volverá al estado anterior. ¿Continuar?`,
            danger: true,
            confirmText: 'Abortar',
            onConfirm: () => run(`Abortar ${label.toLowerCase()}`, () => bridge.abortOperation(repo.path))
          })
        }
      >
        <OctagonX size={13} /> Abortar
      </button>
    </div>
  )
}

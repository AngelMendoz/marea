import { Waypoints, GitPullRequest } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePRPanel } from '../prPanel'
import { useStore } from '../store'

export function MergeTargetButton(): JSX.Element | null {
  const { repo, branches, status } = useStore()
  const openPanel = usePRPanel((s) => s.openPanel)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = status?.current || repo?.currentBranch || ''
  const target = useMemo(() => {
    const names = [
      ...(branches?.local.map((b) => b.name) ?? []),
      ...(branches?.remote.map((b) => b.name.replace(/^[^/]+\//, '')) ?? [])
    ]
    return ['main', 'master', 'develop'].find((b) => names.includes(b) && b !== current) || ''
  }, [branches, current])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  if (!repo) return null

  return (
    <div className="mt-wrap" ref={ref}>
      <button className="mt-btn" title="Objetivo de merge" onClick={() => setOpen((v) => !v)}>
        <Waypoints size={16} />
      </button>
      {open && (
        <div className="mt-pop">
          <p className="mt-desc">
            Tu rama <span className="mt-branch">{current}</span> se compara con{' '}
            <span className="mt-branch target">{target || '(sin objetivo)'}</span>.
          </p>
          <button
            className="mt-action"
            disabled={!target}
            onClick={() => {
              openPanel({ head: current, base: target })
              setOpen(false)
            }}
          >
            <GitPullRequest size={15} /> Abrir un Pull Request hacia {target || '…'}
          </button>
        </div>
      )}
    </div>
  )
}

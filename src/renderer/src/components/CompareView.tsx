import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  GitCompareArrows,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CommitFile } from '@shared/types'
import { bridge } from '../bridge'
import { useCenterView, type CompareSpec } from '../centerView'
import { useStore } from '../store'
import { DiffViewer } from './DiffViewer'

const TYPE_LETTER: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflicted: '!',
  copied: 'C',
  unknown: '?'
}

/** Comparación de dos referencias (commits/ramas/tags/stash).
 *  Lista de archivos en acordeón: cada uno carga su diff al expandirse. */
export function CompareView({ spec }: { spec: CompareSpec }): JSX.Element {
  const repo = useStore((s) => s.repo)
  const status = useStore((s) => s.status)
  const openCompare = useCenterView((s) => s.openCompare)
  const close = useCenterView((s) => s.close)
  const [threeDots, setThreeDots] = useState(false)
  const [files, setFiles] = useState<CommitFile[] | null>(null)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [diffs, setDiffs] = useState<Record<string, string>>({})
  const bodyRef = useRef<HTMLDivElement>(null)

  const path = repo?.path
  // Comparar contra el working tree: `status` en deps refresca al editar.
  const vsWorking = !spec.b

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setFiles(null)
    setError('')
    setDiffs({})
    bridge
      .diffRefsFiles(path, { a: spec.a, b: spec.b || undefined, threeDots })
      .then((f) => {
        if (cancelled) return
        setFiles(f)
        // Con pocos archivos se expande todo; con muchos, solo el primero.
        setCollapsed(f.length > 8 ? new Set(f.slice(1).map((x) => x.path)) : new Set())
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [path, spec, threeDots, vsWorking ? status : null])

  // Carga perezosa del diff de cada archivo expandido.
  useEffect(() => {
    if (!path || !files) return
    for (const f of files) {
      if (collapsed.has(f.path) || diffs[f.path] !== undefined) continue
      bridge
        .diffRefs(path, { a: spec.a, b: spec.b || undefined, threeDots, file: f.path })
        .then((d) => setDiffs((prev) => (prev[f.path] === undefined ? { ...prev, [f.path]: d } : prev)))
        .catch(() => setDiffs((prev) => ({ ...prev, [f.path]: '' })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, files, collapsed, spec, threeDots])

  const toggle = (file: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })

  const nav = (dir: number): void => {
    const scroller = bodyRef.current
    if (!scroller) return
    const marks = [...scroller.querySelectorAll('.diff-line.hunk, .cmp-file-head')] as HTMLElement[]
    const sTop = scroller.getBoundingClientRect().top
    const offsets = marks.map((m) => m.getBoundingClientRect().top - sTop + scroller.scrollTop)
    const cur = scroller.scrollTop
    if (dir > 0) {
      const next = offsets.find((o) => o > cur + 2)
      if (next != null) scroller.scrollTo({ top: next, behavior: 'smooth' })
    } else {
      const prev = [...offsets].reverse().find((o) => o < cur - 2)
      scroller.scrollTo({ top: prev ?? 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="compare-view">
      <div className="compare-head">
        <GitCompareArrows size={15} color="var(--accent)" />
        <span className="cmp-ref" title={spec.a}>
          {spec.aLabel}
        </span>
        <button
          className="mini icon"
          title="Intercambiar lados"
          disabled={vsWorking}
          onClick={() =>
            openCompare({ a: spec.b, b: spec.a, aLabel: spec.bLabel, bLabel: spec.aLabel })
          }
        >
          <ArrowLeftRight size={13} />
        </button>
        <span className="cmp-ref" title={spec.b || 'Working tree'}>
          {spec.bLabel}
        </span>

        <div className="dph-tools">
          {!vsWorking && (
            <div className="seg small">
              <button
                className={threeDots ? '' : 'active'}
                title="Diferencia exacta entre ambas referencias (a..b)"
                onClick={() => setThreeDots(false)}
              >
                Exacta
              </button>
              <button
                className={threeDots ? 'active' : ''}
                title="Cambios desde el ancestro común (a...b, merge-base)"
                onClick={() => setThreeDots(true)}
              >
                Desde base
              </button>
            </div>
          )}
          <span className="dph-div" />
          <button className="mini icon" title="Cambio anterior" onClick={() => nav(-1)}>
            <ChevronUp size={15} />
          </button>
          <button className="mini icon" title="Cambio siguiente" onClick={() => nav(1)}>
            <ChevronDown size={15} />
          </button>
          <button
            className="mini"
            title="Colapsar todos los archivos"
            onClick={() => setCollapsed(new Set(files?.map((f) => f.path) ?? []))}
          >
            <ChevronsDownUp size={13} /> Colapsar
          </button>
          <button className="mini" title="Expandir todos los archivos" onClick={() => setCollapsed(new Set())}>
            <ChevronsUpDown size={13} /> Expandir
          </button>
          <span className="dph-div" />
          <button className="mini icon" title="Cerrar comparación" onClick={close}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="compare-body" ref={bodyRef}>
        {error && <div className="empty">Error al comparar: {error}</div>}
        {!error && files === null && <div className="empty">Comparando…</div>}
        {files && files.length === 0 && <div className="empty">Sin diferencias entre las referencias.</div>}
        {files?.map((f) => {
          const isCollapsed = collapsed.has(f.path)
          const diff = diffs[f.path]
          return (
            <div key={f.path} className="cmp-file">
              <div className="cmp-file-head" onClick={() => toggle(f.path)}>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <span className={`ftype ${f.type}`}>{TYPE_LETTER[f.type] ?? '?'}</span>
                <span className="path" title={f.path}>
                  {f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                </span>
              </div>
              {!isCollapsed &&
                (diff === undefined ? (
                  <div className="empty small">Cargando diff…</div>
                ) : (
                  <DiffViewer diff={diff} />
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

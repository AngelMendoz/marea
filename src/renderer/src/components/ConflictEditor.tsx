import {
  Check,
  ChevronDown,
  ChevronUp,
  FileWarning,
  GitBranch,
  Trash2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConflictVersions } from '@shared/types'
import { bridge } from '../bridge'
import { useDialog } from '../dialog'
import {
  buildOutput,
  parseConflicts,
  type ConflictChoice,
  type ParsedConflicts
} from '../lib/conflicts'
import { useStore } from '../store'

function emptyChoices(count: number): ConflictChoice[] {
  return Array.from({ length: count }, () => ({ ours: new Set<number>(), theirs: new Set<number>() }))
}

/** Panel de un lado (ours/theirs) con checkboxes por conflicto y por línea. */
function SidePane({
  side,
  label,
  parsed,
  choices,
  current,
  onToggleLine,
  onToggleAll
}: {
  side: 'ours' | 'theirs'
  label: string
  parsed: ParsedConflicts
  choices: ConflictChoice[]
  current: number
  onToggleLine: (conflict: number, line: number) => void
  onToggleAll: (conflict: number, on: boolean) => void
}): JSX.Element {
  return (
    <div className={`ce-pane ${side}`}>
      <div className="ce-pane-head">
        <GitBranch size={12} />
        <span title={label}>{label}</span>
      </div>
      <div className="ce-pane-body">
        {parsed.chunks.map((chunk, ci) =>
          chunk.kind === 'text' ? (
            <div key={ci} className="ce-text">
              {chunk.lines.map((l, i) => (
                <div key={i} className="ce-line dim">
                  <span className="content">{l || ' '}</span>
                </div>
              ))}
            </div>
          ) : (
            (() => {
              const lines = side === 'ours' ? chunk.block.ours : chunk.block.theirs
              const sel = choices[chunk.index]?.[side] ?? new Set<number>()
              const all = lines.length > 0 && sel.size === lines.length
              return (
                <div
                  key={ci}
                  className={`ce-conflict ${side}${chunk.index === current ? ' focused' : ''}`}
                  data-conflict={chunk.index}
                >
                  <label className="ce-conflict-head" title="Usar todas las líneas de este lado">
                    <input
                      type="checkbox"
                      checked={all}
                      onChange={(e) => onToggleAll(chunk.index, e.target.checked)}
                    />
                    Conflicto {chunk.index + 1}
                  </label>
                  {lines.map((l, li) => (
                    <label key={li} className={`ce-line pick${sel.has(li) ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={sel.has(li)}
                        onChange={() => onToggleLine(chunk.index, li)}
                      />
                      <span className="content">{l || ' '}</span>
                    </label>
                  ))}
                  {lines.length === 0 && <div className="ce-line dim empty-side">(sin líneas en este lado)</div>}
                </div>
              )
            })()
          )
        )}
      </div>
    </div>
  )
}

/** Editor visual de conflictos a 3 zonas (ours · theirs · salida editable). */
export function ConflictEditor(): JSX.Element | null {
  const repo = useStore((s) => s.repo)
  const selectedFile = useStore((s) => s.selectedFile)
  const status = useStore((s) => s.status)
  const run = useStore((s) => s.run)
  const setSelectedFile = useStore((s) => s.setSelectedFile)
  const { openConfirm } = useDialog()

  const [versions, setVersions] = useState<ConflictVersions | null>(null)
  const [parsed, setParsed] = useState<ParsedConflicts | null>(null)
  const [choices, setChoices] = useState<ConflictChoice[]>([])
  const [output, setOutput] = useState('')
  const [manual, setManual] = useState(false)
  const [current, setCurrent] = useState(0)
  const panesRef = useRef<HTMLDivElement>(null)

  const path = repo?.path
  const file = selectedFile?.path

  useEffect(() => {
    if (!path || !file) return
    let cancelled = false
    bridge.conflictVersions(path, file).then((v) => {
      if (cancelled) return
      const p = parseConflicts(v.working)
      setVersions(v)
      setParsed(p)
      setChoices(emptyChoices(p.count))
      setOutput(buildOutput(p, emptyChoices(p.count)))
      setManual(false)
      setCurrent(0)
    })
    return () => {
      cancelled = true
    }
  }, [path, file])

  const applyChoices = useCallback(
    (next: ConflictChoice[]): void => {
      setChoices(next)
      if (parsed) setOutput(buildOutput(parsed, next))
      setManual(false)
    },
    [parsed]
  )

  if (!repo || !selectedFile || !versions || !parsed) {
    return (
      <div className="conflict-editor">
        <div className="empty">Cargando conflicto…</div>
      </div>
    )
  }

  const name = selectedFile.path.split('/').pop()

  // Conflicto de add/delete: un lado no existe → mantener o eliminar.
  if (versions.ours === null || versions.theirs === null) {
    const missing = versions.ours === null ? 'la rama actual (ours)' : 'la rama entrante (theirs)'
    return (
      <div className="conflict-editor">
        <div className="ce-head">
          <FileWarning size={14} color="var(--warn)" />
          <span className="fname">{name}</span>
          <span className="ce-count">conflicto de borrado</span>
          <div className="spacer" />
          <button className="mini icon" title="Cerrar" onClick={() => setSelectedFile(null)}>
            <X size={15} />
          </button>
        </div>
        <div className="ce-delete">
          <p>
            El archivo fue <strong>eliminado en {missing}</strong> y modificado en el otro lado, así que
            no hay tres versiones que combinar. Elige qué hacer:
          </p>
          <div className="ce-delete-actions">
            <button
              className="btn"
              onClick={() =>
                run('Mantener archivo', async () => {
                  await bridge.markResolved(repo.path, [selectedFile.path])
                  setSelectedFile(null)
                })
              }
            >
              <Check size={14} /> Mantener el archivo
            </button>
            <button
              className="btn danger"
              onClick={() =>
                openConfirm({
                  title: 'Eliminar archivo',
                  message: `Se eliminará «${selectedFile.path}» como resolución del conflicto.`,
                  danger: true,
                  confirmText: 'Eliminar',
                  onConfirm: () =>
                    run('Eliminar archivo', async () => {
                      await bridge.resolveDelete(repo.path, selectedFile.path)
                      setSelectedFile(null)
                    })
                })
              }
            >
              <Trash2 size={14} /> Eliminar el archivo
            </button>
          </div>
        </div>
      </div>
    )
  }

  const toggleLine = (side: 'ours' | 'theirs') => (conflict: number, line: number) => {
    const next = choices.map((c, i) => {
      if (i !== conflict) return c
      const set = new Set(c[side])
      if (set.has(line)) set.delete(line)
      else set.add(line)
      return { ...c, [side]: set }
    })
    applyChoices(next)
  }

  const toggleAll = (side: 'ours' | 'theirs') => (conflict: number, on: boolean) => {
    const block = parsed.chunks.find((ch) => ch.kind === 'conflict' && ch.index === conflict)
    if (!block || block.kind !== 'conflict') return
    const lines = side === 'ours' ? block.block.ours : block.block.theirs
    const next = choices.map((c, i) =>
      i === conflict ? { ...c, [side]: on ? new Set(lines.map((_, li) => li)) : new Set<number>() } : c
    )
    applyChoices(next)
  }

  /** Selección global: todo un lado en todos los conflictos. */
  const useSide = (side: 'ours' | 'theirs' | 'both'): void => {
    const next = parsed.chunks
      .filter((ch): ch is Extract<typeof ch, { kind: 'conflict' }> => ch.kind === 'conflict')
      .reduce((acc, ch) => {
        const oursAll = new Set(ch.block.ours.map((_, i) => i))
        const theirsAll = new Set(ch.block.theirs.map((_, i) => i))
        acc[ch.index] = {
          ours: side !== 'theirs' ? oursAll : new Set<number>(),
          theirs: side !== 'ours' ? theirsAll : new Set<number>()
        }
        return acc
      }, emptyChoices(parsed.count))
    applyChoices(next)
  }

  const goto = (idx: number): void => {
    const clamped = Math.max(0, Math.min(parsed.count - 1, idx))
    setCurrent(clamped)
    panesRef.current
      ?.querySelector(`.ce-conflict[data-conflict="${clamped}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const unresolved = choices.filter((c, i) => {
    if (manual) return false
    return c.ours.size === 0 && c.theirs.size === 0 && conflictHasLines(parsed, i)
  }).length

  const doResolve = (): void => {
    const finish = (): void => {
      void run('Marcar resuelto', async () => {
        const text = output.endsWith('\n') || output === '' ? output : output + '\n'
        await bridge.writeFile(repo.path, selectedFile.path, text)
        await bridge.markResolved(repo.path, [selectedFile.path])
      }).then(() => {
        // Abre el siguiente conflicto pendiente, si lo hay.
        const rest = useStore.getState().status?.conflicted.filter((f) => f.path !== selectedFile.path)
        if (rest && rest.length > 0) setSelectedFile({ path: rest[0].path, conflicted: true })
        else setSelectedFile(null)
      })
    }
    if (unresolved > 0) {
      openConfirm({
        title: 'Conflictos sin decidir',
        message: `${unresolved} conflicto${unresolved !== 1 ? 's' : ''} no tiene${unresolved !== 1 ? 'n' : ''} líneas elegidas: esa parte quedará vacía en el resultado. ¿Marcar resuelto igualmente?`,
        confirmText: 'Marcar resuelto',
        onConfirm: finish
      })
    } else {
      finish()
    }
  }

  const pendingFiles = status?.conflicted.length ?? 0

  return (
    <div className="conflict-editor">
      <div className="ce-head">
        <FileWarning size={14} color="var(--warn)" />
        <span className="fname" title={selectedFile.path}>
          {name}
        </span>
        <span className="ce-count">
          {parsed.count} conflicto{parsed.count !== 1 ? 's' : ''}
          {pendingFiles > 1 ? ` · ${pendingFiles} archivos en conflicto` : ''}
        </span>
        <div className="spacer" />
        <button className="mini" title="Usar solo la versión actual" onClick={() => useSide('ours')}>
          Todo ours
        </button>
        <button className="mini" title="Usar solo la versión entrante" onClick={() => useSide('theirs')}>
          Todo theirs
        </button>
        <button className="mini" title="Usar ambos lados (ours y luego theirs)" onClick={() => useSide('both')}>
          Ambos
        </button>
        <span className="dph-div" />
        <button className="mini icon" title="Conflicto anterior" onClick={() => goto(current - 1)}>
          <ChevronUp size={14} />
        </button>
        <button className="mini icon" title="Conflicto siguiente" onClick={() => goto(current + 1)}>
          <ChevronDown size={14} />
        </button>
        <span className="dph-div" />
        <button className="mini accent" title="Guardar la salida y hacer git add" onClick={doResolve}>
          <Check size={13} /> Marcar resuelto
        </button>
        <button className="mini icon" title="Cerrar" onClick={() => setSelectedFile(null)}>
          <X size={15} />
        </button>
      </div>

      <div className="ce-panes" ref={panesRef}>
        <SidePane
          side="ours"
          label={`Actual (ours) — ${status?.current ?? 'HEAD'}`}
          parsed={parsed}
          choices={choices}
          current={current}
          onToggleLine={toggleLine('ours')}
          onToggleAll={toggleAll('ours')}
        />
        <SidePane
          side="theirs"
          label="Entrante (theirs)"
          parsed={parsed}
          choices={choices}
          current={current}
          onToggleLine={toggleLine('theirs')}
          onToggleAll={toggleAll('theirs')}
        />
      </div>

      <div className="ce-output">
        <div className="ce-pane-head">
          <span>Salida (editable{manual ? ' — editada a mano' : ''})</span>
          <span className="ce-hint">marcar un checkbox regenera la salida</span>
        </div>
        <textarea
          value={output}
          spellCheck={false}
          onChange={(e) => {
            setOutput(e.target.value)
            setManual(true)
          }}
        />
      </div>
    </div>
  )
}

function conflictHasLines(parsed: ParsedConflicts, index: number): boolean {
  const ch = parsed.chunks.find((c) => c.kind === 'conflict' && c.index === index)
  if (!ch || ch.kind !== 'conflict') return false
  return ch.block.ours.length > 0 || ch.block.theirs.length > 0
}

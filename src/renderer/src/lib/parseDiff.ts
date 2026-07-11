export interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'hunk' | 'meta'
  text: string
  oldNo?: number
  newNo?: number
}

export function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('@@')) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        oldNo = parseInt(m[1], 10)
        newNo = parseInt(m[2], 10)
      }
      lines.push({ kind: 'hunk', text: raw })
      continue
    }
    if (
      raw.startsWith('diff ') ||
      raw.startsWith('index ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('new file') ||
      raw.startsWith('deleted file') ||
      raw.startsWith('similarity') ||
      raw.startsWith('rename ')
    ) {
      lines.push({ kind: 'meta', text: raw })
      continue
    }
    if (raw.startsWith('+')) {
      lines.push({ kind: 'add', text: raw.slice(1), newNo: newNo++ })
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', text: raw.slice(1), oldNo: oldNo++ })
    } else {
      lines.push({
        kind: 'ctx',
        text: raw.startsWith(' ') ? raw.slice(1) : raw,
        oldNo: oldNo++,
        newNo: newNo++
      })
    }
  }
  return lines
}

export interface Hunk {
  /** Texto de la cabecera @@ ... @@ */
  header: string
  /** Líneas del cuerpo del hunk (sin la cabecera) para renderizar. */
  lines: DiffLine[]
  /** Parche completo (cabecera de archivo + este hunk) para `git apply`. */
  patch: string
  /** Cabecera del archivo (diff --git / index / --- / +++). */
  fileHeader: string
  /** Cuerpo crudo del hunk (con prefijo +/-/espacio), alineado con `lines`. */
  body: string[]
}

/** Separa un diff de un archivo en hunks aplicables individualmente. */
export function splitHunks(diff: string): Hunk[] {
  const rawLines = diff.split('\n')
  const headerLines: string[] = []
  const blocks: { header: string; body: string[] }[] = []
  let cur: { header: string; body: string[] } | null = null

  for (const line of rawLines) {
    if (line.startsWith('@@')) {
      cur = { header: line, body: [] }
      blocks.push(cur)
    } else if (!cur) {
      // cabecera del archivo (diff --git / index / --- / +++)
      if (line.trim()) headerLines.push(line)
    } else if (line.startsWith('diff --git')) {
      cur = null // otro archivo (no debería pasar con diff por archivo)
    } else {
      cur.body.push(line)
    }
  }

  const fileHeader = headerLines.join('\n')
  return blocks.map((b) => {
    // quita una posible línea vacía final del split
    const body = [...b.body]
    if (body.length && body[body.length - 1] === '') body.pop()
    const patch = `${fileHeader}\n${b.header}\n${body.join('\n')}\n`
    const lines = parseDiff(`${b.header}\n${body.join('\n')}`).filter((l) => l.kind !== 'hunk')
    return { header: b.header, lines, patch, fileHeader, body }
  })
}

/** Parche con solo las líneas +/- seleccionadas de un hunk (índices sobre
 *  `hunk.body`). En `forward` (stage) las `-` no seleccionadas pasan a contexto
 *  y las `+` se omiten; en `reverse` (unstage/discard) al revés. La cabecera @@
 *  queda desactualizada a propósito: aplicar con `git apply --recount`. */
export function buildLinePatch(
  hunk: Hunk,
  selected: Set<number>,
  direction: 'forward' | 'reverse'
): string | null {
  const out: string[] = []
  let any = false
  let lastKept = true
  for (let i = 0; i < hunk.body.length; i++) {
    const raw = hunk.body[i]
    if (raw.startsWith('\\')) {
      // «\ No newline at end of file» acompaña a la línea anterior: se
      // conserva solo si esa línea quedó en el parche.
      if (lastKept) out.push(raw)
      continue
    }
    const kind = hunk.lines[i]?.kind
    if (kind === 'add') {
      if (selected.has(i)) {
        out.push(raw)
        any = true
        lastKept = true
      } else if (direction === 'reverse') {
        out.push(' ' + raw.slice(1))
        lastKept = true
      } else {
        lastKept = false
      }
    } else if (kind === 'del') {
      if (selected.has(i)) {
        out.push(raw)
        any = true
        lastKept = true
      } else if (direction === 'forward') {
        out.push(' ' + raw.slice(1))
        lastKept = true
      } else {
        lastKept = false
      }
    } else {
      out.push(raw)
      lastKept = true
    }
  }
  if (!any) return null
  return `${hunk.fileHeader}\n${hunk.header}\n${out.join('\n')}\n`
}

export interface SplitRow {
  left?: { no: number; text: string; kind: 'del' | 'ctx' }
  right?: { no: number; text: string; kind: 'add' | 'ctx' }
  hunk?: string
}

/** Convierte el diff unificado en filas lado a lado, emparejando bloques -/+. */
export function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []

  const flush = (): void => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) {
      const d = dels[i]
      const a = adds[i]
      rows.push({
        left: d ? { no: d.oldNo!, text: d.text, kind: 'del' } : undefined,
        right: a ? { no: a.newNo!, text: a.text, kind: 'add' } : undefined
      })
    }
    dels = []
    adds = []
  }

  for (const l of lines) {
    if (l.kind === 'meta') continue
    if (l.kind === 'hunk') {
      flush()
      rows.push({ hunk: l.text })
    } else if (l.kind === 'del') {
      dels.push(l)
    } else if (l.kind === 'add') {
      adds.push(l)
    } else {
      flush()
      rows.push({
        left: { no: l.oldNo!, text: l.text, kind: 'ctx' },
        right: { no: l.newNo!, text: l.text, kind: 'ctx' }
      })
    }
  }
  flush()
  return rows
}

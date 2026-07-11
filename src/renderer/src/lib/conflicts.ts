/** Parseo de marcadores de conflicto (<<<<<<< ======= >>>>>>>) del working tree. */

export interface ConflictBlock {
  /** Líneas de la rama actual (ours / HEAD). */
  ours: string[]
  /** Líneas de la rama entrante (theirs). */
  theirs: string[]
  /** Líneas de la base común (solo con estilo diff3). */
  base?: string[]
  oursLabel: string
  theirsLabel: string
}

export type ConflictChunk =
  | { kind: 'text'; lines: string[] }
  | { kind: 'conflict'; index: number; block: ConflictBlock }

export interface ParsedConflicts {
  chunks: ConflictChunk[]
  count: number
}

/**
 * Divide el contenido con marcadores en trozos de texto normal y bloques de
 * conflicto. Soporta el estilo diff3 (||||||| base). Si un marcador aparece
 * huérfano se trata como texto normal (no se pierde contenido).
 */
export function parseConflicts(src: string): ParsedConflicts {
  const lines = src.split('\n')
  const chunks: ConflictChunk[] = []
  let text: string[] = []
  let count = 0
  let i = 0

  const flushText = (): void => {
    if (text.length) {
      chunks.push({ kind: 'text', lines: text })
      text = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('<<<<<<<')) {
      // Busca el cierre del bloque antes de consumirlo.
      const oursLabel = line.slice(7).trim()
      const ours: string[] = []
      const base: string[] = []
      const theirs: string[] = []
      let theirsLabel = ''
      let mode: 'ours' | 'base' | 'theirs' = 'ours'
      let closed = false
      let j = i + 1
      for (; j < lines.length; j++) {
        const l = lines[j]
        if (mode === 'ours' && l.startsWith('|||||||')) {
          mode = 'base'
        } else if ((mode === 'ours' || mode === 'base') && l.startsWith('=======')) {
          mode = 'theirs'
        } else if (mode === 'theirs' && l.startsWith('>>>>>>>')) {
          theirsLabel = l.slice(7).trim()
          closed = true
          break
        } else if (mode === 'ours') {
          ours.push(l)
        } else if (mode === 'base') {
          base.push(l)
        } else {
          theirs.push(l)
        }
      }
      if (closed) {
        flushText()
        chunks.push({
          kind: 'conflict',
          index: count++,
          block: { ours, theirs, base: base.length ? base : undefined, oursLabel, theirsLabel }
        })
        i = j + 1
        continue
      }
    }
    text.push(line)
    i++
  }
  flushText()
  return { chunks, count }
}

/** Selección por conflicto: qué líneas de cada lado van a la salida. */
export interface ConflictChoice {
  ours: Set<number>
  theirs: Set<number>
}

/** Construye el texto de salida a partir de los trozos y las decisiones. */
export function buildOutput(parsed: ParsedConflicts, choices: ConflictChoice[]): string {
  const out: string[] = []
  for (const chunk of parsed.chunks) {
    if (chunk.kind === 'text') {
      out.push(...chunk.lines)
    } else {
      const c = choices[chunk.index]
      if (!c) continue
      chunk.block.ours.forEach((l, i) => c.ours.has(i) && out.push(l))
      chunk.block.theirs.forEach((l, i) => c.theirs.has(i) && out.push(l))
    }
  }
  return out.join('\n')
}

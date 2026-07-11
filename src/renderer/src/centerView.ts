import { create } from 'zustand'

/** Comparación de dos refs en el panel central. */
export interface CompareSpec {
  /** Referencia base (lado «viejo»). */
  a: string
  /** Referencia destino. Vacía = working tree. */
  b: string
  /** Etiquetas visibles (nombre de rama/tag o SHA corto). */
  aLabel: string
  bLabel: string
}

/** Historial filtrado (carpeta, tag o rama) en el panel central. */
export interface HistorySpec {
  title: string
  /** Archivo o carpeta a filtrar (opcional). */
  file?: string
  /** Ref de partida (tag/rama); por defecto HEAD. */
  ref?: string
  /** Seguir renombres (solo archivos). */
  follow?: boolean
}

/** Vista alternativa del panel central (detalle de PR, issue, comparación
 *  o historial filtrado). Cuando es null se muestra el grafo/diff como siempre. */
export type CenterView =
  | { kind: 'pr'; number: number }
  | { kind: 'issue'; number: number }
  | { kind: 'compare'; spec: CompareSpec }
  | { kind: 'history'; spec: HistorySpec }
  | null

interface CenterViewState {
  view: CenterView
  openPR: (number: number) => void
  openIssue: (number: number) => void
  openCompare: (spec: CompareSpec) => void
  openHistory: (spec: HistorySpec) => void
  close: () => void
}

export const useCenterView = create<CenterViewState>((set) => ({
  view: null,
  openPR: (number) => set({ view: { kind: 'pr', number } }),
  openIssue: (number) => set({ view: { kind: 'issue', number } }),
  openCompare: (spec) => set({ view: { kind: 'compare', spec } }),
  openHistory: (spec) => set({ view: { kind: 'history', spec } }),
  close: () => set({ view: null })
}))

import { create } from 'zustand'

export type DragKind = 'branch' | 'commit' | 'tag' | 'stash'

export interface DragItem {
  kind: DragKind
  /** Texto visible (nombre de rama, tag, o SHA corto). */
  label: string
  /** Referencia para git (nombre de rama o hash). */
  ref: string
  isRemote?: boolean
  hash?: string
}

interface DragState {
  item: DragItem | null
  /** Clave del elemento sobre el que se está arrastrando (para resaltar). */
  overKey: string | null
  start: (item: DragItem) => void
  setOver: (key: string | null) => void
  end: () => void
}

export const useDrag = create<DragState>((set) => ({
  item: null,
  overKey: null,
  start: (item) => set({ item }),
  setOver: (overKey) => set({ overKey }),
  end: () => set({ item: null, overKey: null })
}))

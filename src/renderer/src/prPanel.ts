import { create } from 'zustand'

interface PRPanelState {
  open: boolean
  head?: string
  base?: string
  openPanel: (opts?: { head?: string; base?: string }) => void
  close: () => void
}

export const usePRPanel = create<PRPanelState>((set) => ({
  open: false,
  openPanel: (opts) => set({ open: true, head: opts?.head, base: opts?.base }),
  close: () => set({ open: false })
}))

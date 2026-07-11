import { create } from 'zustand'

export interface MenuItem {
  label?: string
  danger?: boolean
  disabled?: boolean
  divider?: boolean
  onClick?: () => void
}

interface MenuState {
  open: boolean
  x: number
  y: number
  items: MenuItem[]
  openMenu: (x: number, y: number, items: MenuItem[]) => void
  close: () => void
}

export const useContextMenu = create<MenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  items: [],
  openMenu: (x, y, items) => set({ open: true, x, y, items }),
  close: () => set({ open: false, items: [] })
}))

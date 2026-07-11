import { create } from 'zustand'

export interface PromptOptions {
  title: string
  label?: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  onConfirm: (value: string) => void
}

export interface ConfirmOptions {
  title: string
  message: string
  danger?: boolean
  confirmText?: string
  onConfirm: () => void
}

interface DialogState {
  prompt: PromptOptions | null
  confirm: ConfirmOptions | null
  openPrompt: (opts: PromptOptions) => void
  openConfirm: (opts: ConfirmOptions) => void
  close: () => void
}

export const useDialog = create<DialogState>((set) => ({
  prompt: null,
  confirm: null,
  openPrompt: (prompt) => set({ prompt }),
  openConfirm: (confirm) => set({ confirm }),
  close: () => set({ prompt: null, confirm: null })
}))

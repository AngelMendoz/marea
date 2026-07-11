/// <reference types="vite/client" />

import type { MareaApi } from '../../preload/index'

declare global {
  interface Window {
    api?: MareaApi
  }
}

export {}

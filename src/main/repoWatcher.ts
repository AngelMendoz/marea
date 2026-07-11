import { watch, type FSWatcher } from 'fs'

let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null

/** Observa el repo y notifica cambios relevantes (working tree, índice, HEAD,
 *  refs). Ignora ruido como .git/objects, logs y locks. */
export function startWatch(path: string, onChange: () => void): void {
  stopWatch()
  try {
    watcher = watch(path, { recursive: true }, (_event, filename) => {
      const f = filename ? filename.toString().replace(/\\/g, '/') : ''
      if (
        f.includes('node_modules/') ||
        f.includes('.git/objects/') ||
        f.includes('.git/logs/') ||
        f.includes('.git/hooks/') ||
        f.endsWith('.lock') ||
        f.endsWith('~')
      ) {
        return
      }
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(onChange, 220)
    })
  } catch {
    // recursive puede no estar soportado en algún FS; sin watcher se sigue
    // refrescando manualmente tras cada operación.
  }
}

export function stopWatch(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (debounce) {
    clearTimeout(debounce)
    debounce = null
  }
}

// Acciones contextuales de archivo, compartidas por las listas de
// cambios (StagingPanel) y de archivos de un commit (CommitDetail).

import type { MenuItem } from '../contextMenu'
import { bridge } from '../bridge'
import { useStore } from '../store'

/** Elementos de menú comunes a cualquier archivo del repo: abrir en el
 *  editor configurado, mostrar en el explorador, copiar rutas y abrir la
 *  carpeta del repositorio. */
export function fileContextItems(repoPath: string, file: string): MenuItem[] {
  const notify = useStore.getState().notify
  const absPath = `${repoPath.replace(/\\/g, '/')}/${file}`
  return [
    {
      label: 'Abrir en el editor',
      onClick: () => bridge.openInEditor(repoPath, file)
    },
    {
      label: 'Mostrar en el explorador',
      disabled: !bridge.isElectron,
      onClick: () => bridge.showInFolder(repoPath, file)
    },
    { divider: true },
    {
      label: 'Copiar ruta relativa',
      onClick: () => {
        navigator.clipboard?.writeText(file)
        notify('success', 'Ruta relativa copiada')
      }
    },
    {
      label: 'Copiar ruta absoluta',
      onClick: () => {
        navigator.clipboard?.writeText(absPath)
        notify('success', 'Ruta absoluta copiada')
      }
    },
    { divider: true },
    {
      label: 'Abrir carpeta del repositorio',
      disabled: !bridge.isElectron,
      onClick: () => bridge.openFolder(repoPath)
    }
  ]
}

// Acciones git de alto nivel compartidas entre la toolbar y los atajos de
// teclado. Leen los stores con getState() para poder invocarse
// fuera de componentes React.

import type { PullMode, PushOptions } from '@shared/types'
import { bridge } from '../bridge'
import { useDialog } from '../dialog'
import { useSettings } from '../settings'
import { useStore } from '../store'

export function doFetch(): void {
  const { repo, run, busy } = useStore.getState()
  if (!repo || busy) return
  void run('Fetch', () => bridge.fetch(repo.path, { prune: true }))
}

/** Pull con la estrategia indicada (por defecto, la de las preferencias). */
export function doPull(mode?: PullMode): void {
  const { repo, run, busy } = useStore.getState()
  if (!repo || busy) return
  const m = mode ?? useSettings.getState().pullMode
  const label = m === 'rebase' ? 'Pull (rebase)' : m === 'ff-only' ? 'Pull (fast-forward)' : 'Pull'
  void run(label, async () => {
    try {
      await bridge.pull(repo.path, { mode: m })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // ff-only sobre ramas divergentes: explica la salida (rebase o merge).
      if (m === 'ff-only' && /fast-forward/i.test(msg)) {
        throw new Error('No es posible fast-forward: las ramas han divergido. Usa «Pull con rebase» o «Pull (merge)».')
      }
      throw e
    }
  })
}

export function doPush(opts: PushOptions = {}): void {
  const { repo, run, busy } = useStore.getState()
  if (!repo || busy) return
  void run('Push', () => bridge.push(repo.path, opts))
}

/** Argumentos para publicar la rama actual (sin upstream todavía). */
export function publishArgs(extra: PushOptions = {}): PushOptions {
  const { repo, status, refs } = useStore.getState()
  return {
    setUpstream: true,
    remote: refs?.defaultRemote || refs?.remotes[0]?.name || 'origin',
    branch: status?.current || repo?.currentBranch || '',
    ...extra
  }
}

/** Push principal: publica la rama (con confirmación) si aún no tiene upstream. */
export function primaryPush(): void {
  const { repo, status, refs, busy } = useStore.getState()
  if (!repo || busy) return
  if (status?.tracking) {
    doPush({})
    return
  }
  const currentBranch = status?.current || repo.currentBranch
  const defaultRemote = refs?.defaultRemote || refs?.remotes[0]?.name || 'origin'
  useDialog.getState().openConfirm({
    title: 'Publicar rama',
    message: `La rama «${currentBranch}» aún no existe en el remoto. ¿Publicarla en ${defaultRemote}/${currentBranch}?`,
    confirmText: 'Publicar',
    onConfirm: () => doPush(publishArgs())
  })
}

export function promptNewBranch(): void {
  const { repo, run } = useStore.getState()
  if (!repo) return
  useDialog.getState().openPrompt({
    title: 'Nueva rama',
    label: 'Nombre de la rama',
    placeholder: 'feature/mi-rama',
    confirmText: 'Crear',
    onConfirm: (name) => void run('Crear rama', () => bridge.createBranch(repo.path, name, { checkout: true }))
  })
}

export function promptStash(): void {
  const { repo, run, busy } = useStore.getState()
  if (!repo || busy) return
  useDialog.getState().openPrompt({
    title: 'Guardar en stash',
    label: 'Mensaje (opcional)',
    placeholder: 'WIP…',
    confirmText: 'Stash',
    onConfirm: (msg) => void run('Stash', () => bridge.stashCreate(repo.path, msg))
  })
}

export function doStashPop(): void {
  const { repo, run, busy, refs } = useStore.getState()
  if (!repo || busy || !refs?.stashes.length) return
  void run('Stash pop', () => bridge.stashPop(repo.path, 0))
}

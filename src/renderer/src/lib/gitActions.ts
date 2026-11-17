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

/** ¿El último commit ya está en el remoto? (upstream sin commits por delante). */
export function headIsPushed(): boolean {
  const { status } = useStore.getState()
  return !!status?.tracking && status.ahead === 0
}

/** Tras reescribir un commit ya subido, el push normal sería rechazado:
 *  ofrece subirlo con --force-with-lease. */
export function offerForcePushAfterRewrite(): void {
  const { status } = useStore.getState()
  useDialog.getState().openConfirm({
    title: 'Subir el commit reescrito',
    message: `El commit original ya estaba en ${status?.tracking ?? 'el remoto'}. Para reemplazarlo hay que hacer force push (con --force-with-lease, que aborta si alguien más empujó entretanto). ¿Subirlo ahora?`,
    danger: true,
    confirmText: 'Force push',
    onConfirm: () => doPush({ force: true })
  })
}

/** Cambia el mensaje del último commit (sin incluir lo preparado) y, si ya
 *  estaba subido, ofrece el force push. */
export async function promptRewordHead(): Promise<void> {
  const { repo, run } = useStore.getState()
  if (!repo) return
  const full = await bridge.headMessage(repo.path).catch(() => '')
  const [subject = '', ...rest] = full.replace(/\r\n/g, '\n').split('\n')
  const body = rest.join('\n').trim()
  useDialog.getState().openPrompt({
    title: 'Reescribir mensaje del último commit',
    label: body ? 'Resumen (la descripción se conserva)' : 'Mensaje',
    defaultValue: subject,
    confirmText: 'Reescribir',
    onConfirm: (value) => {
      const summary = value.trim()
      if (!summary || summary === subject.trim()) return
      const pushed = headIsPushed()
      let ok = false
      void run('Reescribir commit', async () => {
        await bridge.commit(repo.path, body ? `${summary}\n\n${body}` : summary, {
          amend: true,
          messageOnly: true
        })
        ok = true
      }).then(() => ok && pushed && offerForcePushAfterRewrite())
    }
  })
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
    optional: true,
    onConfirm: (msg) => void run('Stash', () => bridge.stashCreate(repo.path, msg || undefined))
  })
}

export function doStashPop(): void {
  const { repo, run, busy, refs } = useStore.getState()
  if (!repo || busy || !refs?.stashes.length) return
  void run('Stash pop', () => bridge.stashPop(repo.path, 0))
}

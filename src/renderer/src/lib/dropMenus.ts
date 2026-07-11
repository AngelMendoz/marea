import { bridge } from '../bridge'
import { useCenterView } from '../centerView'
import { useRebasePanel } from '../components/InteractiveRebase'
import type { MenuItem } from '../contextMenu'
import type { DragItem } from '../drag'

type Run = (label: string, fn: () => Promise<unknown>) => Promise<void>

/** Menú al soltar una rama sobre otra rama. */
export function branchOntoBranchMenu(
  repo: string,
  source: DragItem,
  target: DragItem,
  run: Run
): MenuItem[] {
  const s = source.label
  const t = target.label
  const compare: MenuItem = {
    label: `Comparar ${s} con ${t}`,
    onClick: () =>
      useCenterView.getState().openCompare({ a: source.ref, b: target.ref, aLabel: s, bLabel: t })
  }
  // Ambas ramas apuntan al mismo commit: no hay nada que combinar.
  if (source.hash && target.hash && source.hash === target.hash) return [compare]
  return [
    compare,
    { divider: true },
    {
      label: `Fast-forward ${t} a ${s}`,
      onClick: () => run('Fast-forward', () => bridge.mergeInto(repo, source.ref, target.ref, 'ff'))
    },
    { divider: true },
    {
      label: `Merge ${s} en ${t}`,
      onClick: () => run('Merge', () => bridge.mergeInto(repo, source.ref, target.ref, 'merge'))
    },
    {
      label: `Merge sin fast-forward (${s} → ${t})`,
      onClick: () => run('Merge --no-ff', () => bridge.mergeInto(repo, source.ref, target.ref, 'noff'))
    },
    {
      label: `Squash merge ${s} en ${t}`,
      onClick: () => run('Squash merge', () => bridge.mergeInto(repo, source.ref, target.ref, 'squash'))
    },
    { divider: true },
    {
      label: `Rebase ${t} sobre ${s}`,
      onClick: () => run('Rebase', () => bridge.rebaseOnto(repo, target.ref, source.ref))
    },
    {
      label: `Rebase interactivo de ${t} sobre ${s}…`,
      onClick: () =>
        useRebasePanel.getState().openPanel({
          base: source.ref,
          baseLabel: s,
          head: target.ref,
          headLabel: t
        })
    }
  ]
}

/** Menú al soltar una rama sobre un commit. */
export function branchOntoCommitMenu(
  repo: string,
  source: DragItem,
  hash: string,
  shortHash: string,
  run: Run
): MenuItem[] {
  return [
    {
      label: `Mover ${source.label} aquí (reset --hard ${shortHash})`,
      danger: true,
      onClick: () => run('Reset rama', () => bridge.resetBranchTo(repo, source.ref, hash, 'hard'))
    },
    {
      label: `Reset ${source.label} aquí (soft)`,
      onClick: () => run('Reset rama (soft)', () => bridge.resetBranchTo(repo, source.ref, hash, 'soft'))
    },
    { divider: true },
    {
      label: `Rebase ${source.label} sobre ${shortHash}`,
      onClick: () => run('Rebase', () => bridge.rebaseOnto(repo, source.ref, hash))
    }
  ]
}

/** Menú al soltar un commit sobre una rama. */
export function commitOntoBranchMenu(
  repo: string,
  hash: string,
  shortHash: string,
  target: DragItem,
  run: Run
): MenuItem[] {
  return [
    {
      label: `Cherry-pick ${shortHash} en ${target.label}`,
      onClick: () =>
        run('Cherry-pick', async () => {
          await bridge.checkout(repo, target.ref)
          await bridge.cherryPick(repo, hash)
        })
    }
  ]
}

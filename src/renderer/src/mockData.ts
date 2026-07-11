import { buildGraph } from '@shared/graph'
import type {
  BlameLine,
  BranchList,
  Commit,
  CommitFile,
  ConflictVersions,
  FileHistoryEntry,
  LogOptions,
  LogPage,
  Issue,
  IssueComment,
  LogResult,
  PRComment,
  PRFile,
  PullRequest,
  PullRequestDetail,
  RecentRepo,
  RefsResult,
  StatusResult,
  Submodule,
  Worktree
} from '@shared/types'

const DAY = 86400
const BASE = 1782518400 // ~ 2026-06-30

const rawCommits: Commit[] = [
  {
    hash: 'h01aaaa0000000000000000000000000000000001',
    parents: ['h02', 'h05'],
    subject: "Merge pull request #142 from feature/subscription",
    authorName: 'Sofia',
    refs: [
      { type: 'head', name: 'main' },
      { type: 'remoteBranch', name: 'origin/main' }
    ],
    date: BASE - 3600
  },
  {
    hash: 'h02',
    parents: ['h03'],
    subject: 'Add dark theme toggle to settings',
    authorName: 'Sofia',
    refs: [],
    date: BASE - DAY
  },
  {
    hash: 'h03',
    parents: ['h04'],
    subject: 'Update README with screenshots',
    authorName: 'Diego',
    refs: [{ type: 'tag', name: 'v0.2.0' }],
    date: BASE - DAY * 2
  },
  {
    hash: 'h04',
    parents: ['h08'],
    subject: 'Fix status bar overflow on small windows',
    authorName: 'Sofia',
    refs: [],
    date: BASE - DAY * 2 - 7200
  },
  {
    hash: 'h05',
    parents: ['h06'],
    subject: 'Implement subscription billing logic',
    authorName: 'Camila',
    refs: [
      { type: 'localBranch', name: 'feature/subscription' },
      { type: 'remoteBranch', name: 'origin/feature/subscription' }
    ],
    date: BASE - DAY * 3
  },
  {
    hash: 'h06',
    parents: ['h07'],
    subject: 'Add Stripe webhook handler',
    authorName: 'Camila',
    refs: [],
    date: BASE - DAY * 3 - 3600
  },
  {
    hash: 'h07',
    parents: ['h08'],
    subject: 'Scaffold subscription module',
    authorName: 'Camila',
    refs: [],
    date: BASE - DAY * 4
  },
  {
    hash: 'h08',
    parents: ['h09', 'h11'],
    subject: "Merge branch 'develop' into main",
    authorName: 'Sofia',
    refs: [],
    date: BASE - DAY * 5
  },
  {
    hash: 'h09',
    parents: ['h10'],
    subject: 'Refactor auth service into modules',
    authorName: 'Diego',
    refs: [],
    date: BASE - DAY * 5 - 3600
  },
  {
    hash: 'h10',
    parents: ['h13'],
    subject: 'Add OAuth login with GitHub',
    authorName: 'Diego',
    refs: [{ type: 'localBranch', name: 'develop' }],
    date: BASE - DAY * 6
  },
  {
    hash: 'h11',
    parents: ['h12'],
    subject: 'Hotfix: null pointer in diff parser',
    authorName: 'Sofia',
    refs: [],
    date: BASE - DAY * 6 - 1800
  },
  {
    hash: 'h12',
    parents: ['h13'],
    subject: 'Improve error messages on push',
    authorName: 'Camila',
    refs: [],
    date: BASE - DAY * 7
  },
  {
    hash: 'h13',
    parents: ['h14'],
    subject: 'Initial project structure',
    authorName: 'Sofia',
    refs: [],
    date: BASE - DAY * 9
  },
  {
    hash: 'h14',
    parents: [],
    subject: 'Initial commit',
    authorName: 'Sofia',
    refs: [{ type: 'tag', name: 'v0.1.0' }],
    date: BASE - DAY * 10
  }
].map((c) => ({
  ...c,
  shortHash: c.hash.slice(0, 7),
  authorEmail: `${(c as Commit).authorName.toLowerCase()}@example.com`
})) as Commit[]

/** Historial completo en crudo (para simular paginación/búsqueda en el navegador). */
export const mockRawCommits: Commit[] = rawCommits

export const mockLog: LogResult = buildGraph(rawCommits)

/** Simula `gitService.logPage` en navegador: búsqueda literal (grep/author)
 *  y paginación sobre los commits de ejemplo. */
export function mockLogPage(opts: LogOptions = {}): LogPage {
  const { maxCount = 500, skip = 0, grep, author } = opts
  let list = rawCommits
  if (grep) {
    const q = grep.toLowerCase()
    list = list.filter((c) => c.subject.toLowerCase().includes(q))
  }
  if (author) {
    const q = author.toLowerCase()
    list = list.filter((c) => c.authorName.toLowerCase().includes(q))
  }
  const page = list.slice(skip, skip + maxCount)
  return { commits: page, hasMore: skip + maxCount < list.length }
}

export const mockStatus: StatusResult = {
  staged: [
    { path: 'src/renderer/src/components/Sidebar.tsx', type: 'modified', staged: true },
    { path: 'src/shared/types.ts', type: 'modified', staged: true }
  ],
  unstaged: [
    { path: 'src/renderer/src/App.tsx', type: 'modified', staged: false },
    { path: 'README.md', type: 'modified', staged: false },
    { path: 'notas/pendientes.md', type: 'untracked', staged: false }
  ],
  // Un conflicto de ejemplo para probar el editor visual en modo navegador.
  conflicted: [{ path: 'src/billing/index.ts', type: 'conflicted', staged: false }],
  ahead: 2,
  behind: 0,
  current: 'main',
  tracking: 'origin/main'
}

export const mockBranches: BranchList = {
  current: 'main',
  local: [
    { name: 'main', current: true, isRemote: false, upstream: 'origin/main', ahead: 2, behind: 0, tip: 'h01aaaa0000000000000000000000000000000001' },
    { name: 'develop', current: false, isRemote: false, upstream: 'origin/develop', ahead: 0, behind: 3, tip: 'h10' },
    { name: 'release', current: false, isRemote: false, upstream: null, ahead: 0, behind: 0, tip: 'h08' },
    { name: 'feature/subscription', current: false, isRemote: false, upstream: 'origin/feature/subscription', ahead: 0, behind: 0, tip: 'h05' },
    { name: 'feature/ms_planes', current: false, isRemote: false, upstream: null, ahead: 1, behind: 2, tip: 'h07' },
    { name: 'feature/test-cicd', current: false, isRemote: false, upstream: null, ahead: 0, behind: 0, tip: 'h06' }
  ],
  remote: [
    { name: 'origin/main', current: false, isRemote: true, upstream: null, ahead: 0, behind: 0, tip: 'h01aaaa0000000000000000000000000000000001' },
    { name: 'origin/develop', current: false, isRemote: true, upstream: null, ahead: 0, behind: 0, tip: 'h10' },
    { name: 'origin/feature/subscription', current: false, isRemote: true, upstream: null, ahead: 0, behind: 0, tip: 'h05' }
  ]
}

export const mockRefs: RefsResult = {
  remotes: [
    { name: 'origin', fetchUrl: 'git@github.com:pleamarlabs/marea.git', pushUrl: 'git@github.com:pleamarlabs/marea.git' },
    { name: 'upstream', fetchUrl: 'https://github.com/marea/marea.git', pushUrl: 'https://github.com/marea/marea.git' }
  ],
  defaultRemote: 'origin',
  tags: [
    { name: 'v0.2.0', hash: 'h03', annotated: true },
    { name: 'v0.1.0', hash: 'h14', annotated: false }
  ],
  stashes: [
    { index: 0, message: 'On main: WIP layout experiment', branch: 'main', hash: 'stash0' }
  ]
}

export const mockCommitFiles: CommitFile[] = [
  { path: 'src/billing/stripe.ts', type: 'added' },
  { path: 'src/billing/index.ts', type: 'modified' },
  { path: 'src/legacy/payments.ts', type: 'deleted' }
]

export const mockDiff = `diff --git a/src/billing/index.ts b/src/billing/index.ts
index 83db48f..bf3e2c1 100644
--- a/src/billing/index.ts
+++ b/src/billing/index.ts
@@ -1,8 +1,12 @@
 import { stripe } from './stripe'

-export function createSubscription(userId: string) {
-  return stripe.subscriptions.create({ customer: userId })
+export async function createSubscription(userId: string, plan: string) {
+  const customer = await stripe.customers.retrieve(userId)
+  return stripe.subscriptions.create({
+    customer: customer.id,
+    items: [{ price: plan }]
+  })
 }

 export function cancelSubscription(id: string) {
   return stripe.subscriptions.cancel(id)
 }
`

/** Historial de un archivo de ejemplo (modo navegador). */
export const mockFileHistory: FileHistoryEntry[] = [
  { commit: rawCommits[0], path: 'src/billing/index.ts' },
  { commit: rawCommits[4], path: 'src/billing/index.ts' },
  { commit: rawCommits[5], path: 'src/billing/index.ts' },
  // Renombrado: en los commits antiguos el archivo vivía en otra ruta.
  { commit: rawCommits[6], path: 'src/payments/index.ts' },
  { commit: rawCommits[13], path: 'src/payments/index.ts' }
]

/** Blame de ejemplo (modo navegador): alterna dos commits. */
export const mockBlame: BlameLine[] = [
  "import { stripe } from './stripe'",
  '',
  'export async function createSubscription(userId: string, plan: string) {',
  '  const customer = await stripe.customers.retrieve(userId)',
  '  return stripe.subscriptions.create({',
  '    customer: customer.id,',
  '    items: [{ price: plan }]',
  '  })',
  '}',
  '',
  'export function cancelSubscription(id: string) {',
  '  return stripe.subscriptions.cancel(id)',
  '}'
].map((text, i) => {
  const c = i >= 2 && i <= 8 ? rawCommits[4] : rawCommits[6]
  return {
    hash: c.hash,
    shortHash: c.shortHash,
    author: c.authorName,
    date: c.date,
    summary: c.subject,
    lineNo: i + 1,
    text
  }
})

/** Conflicto de ejemplo para el editor visual (modo navegador). */
export const mockConflictVersions: ConflictVersions = {
  base: `import { stripe } from './stripe'

export function createSubscription(userId: string) {
  return stripe.subscriptions.create({ customer: userId })
}

export function cancelSubscription(id: string) {
  return stripe.subscriptions.cancel(id)
}
`,
  ours: `import { stripe } from './stripe'

export function createSubscription(userId: string) {
  return stripe.subscriptions.create({ customer: userId, trial_days: 14 })
}

export function cancelSubscription(id: string) {
  return stripe.subscriptions.cancel(id)
}
`,
  theirs: `import { stripe } from './stripe'

export async function createSubscription(userId: string, plan: string) {
  const customer = await stripe.customers.retrieve(userId)
  return stripe.subscriptions.create({ customer: customer.id, items: [{ price: plan }] })
}

export function cancelSubscription(id: string) {
  return stripe.subscriptions.cancel(id)
}
`,
  working: `import { stripe } from './stripe'

<<<<<<< HEAD
export function createSubscription(userId: string) {
  return stripe.subscriptions.create({ customer: userId, trial_days: 14 })
=======
export async function createSubscription(userId: string, plan: string) {
  const customer = await stripe.customers.retrieve(userId)
  return stripe.subscriptions.create({ customer: customer.id, items: [{ price: plan }] })
>>>>>>> feature/subscription
}

export function cancelSubscription(id: string) {
  return stripe.subscriptions.cancel(id)
}
`
}

export const mockPullRequests: PullRequest[] = [
  {
    number: 146,
    title: 'Feature: suscripciones con Stripe',
    state: 'open',
    author: 'diego-rios',
    head: 'feature/subscription',
    base: 'develop',
    url: 'https://github.com/pleamarlabs/marea/pull/146',
    draft: false,
    assignees: ['sofia-luna']
  },
  {
    number: 145,
    title: 'docs: descripción de la arquitectura',
    state: 'open',
    author: 'diego-rios',
    head: 'feature/docs-arquitectura',
    base: 'develop',
    url: 'https://github.com/pleamarlabs/marea/pull/145',
    draft: true,
    assignees: []
  }
]

/** Detalle de PR para la vista de revisión en modo navegador. */
export function mockPRDetail(number: number): PullRequestDetail {
  const pr = mockPullRequests.find((p) => p.number === number) ?? mockPullRequests[0]
  return {
    ...pr,
    body: 'Añade la lógica de suscripciones con Stripe.\n\n- Webhook handler\n- Módulo de billing\n- Tests pendientes',
    createdAt: BASE - DAY * 2,
    merged: false,
    mergeable: true,
    headSha: 'h05aaaa0000000000000000000000000000000005',
    headLabel: `pleamarlabs:${pr.head}`,
    additions: 128,
    deletions: 24,
    changedFiles: 3
  }
}

export const mockPRFiles: PRFile[] = [
  {
    path: 'src/billing/index.ts',
    type: 'modified',
    additions: 8,
    deletions: 2,
    patch: `@@ -1,8 +1,12 @@
 import { stripe } from './stripe'

-export function createSubscription(userId: string) {
-  return stripe.subscriptions.create({ customer: userId })
+export async function createSubscription(userId: string, plan: string) {
+  const customer = await stripe.customers.retrieve(userId)
+  return stripe.subscriptions.create({
+    customer: customer.id,
+    items: [{ price: plan }]
+  })
 }

 export function cancelSubscription(id: string) {
   return stripe.subscriptions.cancel(id)
 }`
  },
  {
    path: 'src/billing/stripe.ts',
    type: 'added',
    additions: 12,
    deletions: 0,
    patch: `@@ -0,0 +1,12 @@
+import Stripe from 'stripe'
+
+export const stripe = new Stripe(process.env.STRIPE_KEY ?? '', {
+  apiVersion: '2024-06-20'
+})
+
+export async function listPlans() {
+  const prices = await stripe.prices.list({ active: true })
+  return prices.data
+}
+
+export default stripe`
  },
  { path: 'src/legacy/payments.ts', type: 'deleted', additions: 0, deletions: 40 }
]

export const mockPRComments: PRComment[] = [
  {
    id: 1,
    author: 'sofia-luna',
    body: '¿Podemos añadir manejo de errores al webhook?',
    createdAt: BASE - DAY,
    kind: 'general'
  },
  {
    id: 2,
    author: 'camila-vega',
    body: 'Falta validar el plan antes de crear la suscripción.',
    createdAt: BASE - DAY + 3600,
    kind: 'inline',
    path: 'src/billing/index.ts',
    line: 4,
    side: 'RIGHT'
  },
  {
    id: 3,
    author: 'camila-vega',
    body: 'Buen trabajo, solo lo del plan.',
    createdAt: BASE - DAY + 3700,
    kind: 'review',
    state: 'CHANGES_REQUESTED'
  }
]

export const mockIssues: Issue[] = [
  {
    number: 152,
    title: 'El grafo parpadea al cambiar de tema',
    state: 'open',
    author: 'camila-vega',
    assignees: ['sofia-luna'],
    labels: [{ name: 'bug', color: '#e2607b' }],
    comments: 2,
    createdAt: BASE - DAY * 2,
    url: 'https://github.com/pleamarlabs/marea/issues/152',
    body: 'Al alternar claro/oscuro el grafo se re-renderiza completo y parpadea.\n\nPasos:\n1. Abrir un repo grande\n2. Cambiar el tema'
  },
  {
    number: 149,
    title: 'Soporte para firmas SSH en commits',
    state: 'open',
    author: 'sofia-luna',
    assignees: [],
    labels: [{ name: 'enhancement', color: '#1fb6d6' }],
    comments: 0,
    createdAt: BASE - DAY * 5,
    url: 'https://github.com/pleamarlabs/marea/issues/149',
    body: 'Firmar commits con clave SSH desde la app.'
  },
  {
    number: 147,
    title: 'Documentar atajos de teclado',
    state: 'open',
    author: 'diego-rios',
    assignees: ['diego-rios'],
    labels: [{ name: 'documentation', color: '#5bc873' }],
    comments: 1,
    createdAt: BASE - DAY * 7,
    url: 'https://github.com/pleamarlabs/marea/issues/147',
    body: ''
  }
]

export const mockIssueComments: IssueComment[] = [
  {
    id: 1,
    author: 'sofia-luna',
    body: 'Reproducido; parece que el ThemeProvider invalida el memo de las filas.',
    createdAt: BASE - DAY
  },
  {
    id: 2,
    author: 'camila-vega',
    body: 'Confirmo, pasa solo con más de ~500 commits cargados.',
    createdAt: BASE - DAY + 7200
  }
]

export const mockWorktrees: Worktree[] = [
  {
    path: 'C:/Users/sofia/Proyectos/marea',
    head: 'h01aaaa0000000000000000000000000000000001',
    branch: 'main',
    locked: false,
    bare: false,
    prunable: false,
    main: true
  },
  {
    path: 'C:/Users/sofia/Proyectos/marea-subscription',
    head: 'h05',
    branch: 'feature/subscription',
    locked: false,
    bare: false,
    prunable: false,
    main: false
  },
  {
    path: 'C:/Users/sofia/Proyectos/marea-hotfix',
    head: 'h11',
    branch: 'hotfix/diff-parser',
    locked: true,
    lockReason: 'pruebas en curso',
    bare: false,
    prunable: false,
    main: false
  }
]

export const mockSubmodules: Submodule[] = [
  {
    name: 'libs/ui-kit',
    path: 'libs/ui-kit',
    url: 'https://github.com/pleamarlabs/ui-kit.git',
    sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    status: 'ok'
  },
  {
    name: 'vendor/diff-engine',
    path: 'vendor/diff-engine',
    url: 'https://github.com/pleamarlabs/diff-engine.git',
    sha: 'c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3d4e5f6a7b8',
    status: 'uninitialized'
  },
  {
    name: 'themes',
    path: 'themes',
    url: 'https://github.com/pleamarlabs/themes.git',
    sha: 'e7f8a9b0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    status: 'modified'
  }
]

export const mockRecent: RecentRepo[] = [
  { path: 'C:/Users/sofia/Proyectos/marea', name: 'marea', lastOpened: Date.now() },
  { path: 'C:/Users/sofia/Proyectos/tienda-online', name: 'tienda-online', lastOpened: Date.now() - DAY * 1000 },
  { path: 'C:/Users/sofia/Proyectos/portafolio', name: 'portafolio', lastOpened: Date.now() - DAY * 5000 }
]

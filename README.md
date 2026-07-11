# Marea 🌊

[![CI](https://github.com/AngelMendoz/marea/actions/workflows/ci.yml/badge.svg)](https://github.com/AngelMendoz/marea/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

**Cliente Git de escritorio** con grafo de commits interactivo.
Navega tu historial de Git.

> Marea = "tide". Nombre, branding y diseño propios, de Pleamar Labs.

> 📖 **¿Vas a usar Marea?** Lee el **[Manual de usuario](MANUAL-USUARIO.md)**:
> guía paso a paso, con capturas, desde la instalación hasta cada funcionalidad.

## Stack

- **Electron** — app de escritorio nativa (acceso a filesystem, git, SSH…).
- **React + TypeScript** — UI.
- **Vite + electron-vite** — build/dev.
- **simple-git** — motor Git híbrido: envuelve el **git ejecutable del sistema**
  (compatibilidad total: hooks, LFS, firmas, rebase…) y parsea su salida.
- **Zustand** — estado. **lucide-react** — iconos.
- **xterm.js + node-pty** — terminal integrada.

## Arquitectura

```
src/
├── main/            Proceso principal (Node/Electron)
│   ├── index.ts     Ventana (frameless) + arranque
│   ├── ipc.ts       Handlers IPC (git, diálogos, ventana)
│   ├── terminal.ts  Sesiones de terminal (node-pty)
│   ├── accounts.ts  Cuentas cifradas (safeStorage)
│   └── git/
│       └── gitService.ts   Todas las operaciones Git
├── preload/         Puente seguro (contextBridge → window.api)
├── shared/          Tipos + algoritmos compartidos
│   ├── types.ts
│   ├── graph.ts     Asignación de carriles del commit graph
│   └── activity.ts  Agregación de PRs/issues/WIP entre repos
└── renderer/        UI React
    └── src/
        ├── bridge.ts      window.api  ↔  datos mock (para navegador)
        ├── store.ts       Estado global
        └── components/    TitleBar, Toolbar, Sidebar, GraphView,
                           CommitDetail, StagingPanel, DiffViewer, …
```

El **renderer** funciona en dos modos:
- **En Electron**: habla con Git real vía `window.api`.
- **En un navegador** (`npm run dev:web`): usa datos de ejemplo (mock), útil
  para iterar la UI rápido sin arrancar Electron.

## Cómo ejecutar

```bash
npm install

# App de escritorio (Electron) — modo real, opera sobre repos de verdad
npm run dev

# Vista previa de la UI en navegador (datos de ejemplo)
npm run dev:web        # → http://localhost:5174

# Verificar tipos
npm run typecheck

# Tests (unitarios + integración contra git real)
npm test

# Compilar
npm run build

# Empaquetar instalador (Windows/.exe, macOS/.dmg, Linux/AppImage+deb)
npm run dist
```

## Funcionalidades

- **Repos**: abrir, inicializar, clonar, recientes, pestañas persistentes,
  workspaces (lotes fetch/pull/abrir).
- **Grafo de commits** interactivo y virtualizado: carriles por rama, merges,
  tags/ramas como chips, avatares de autor, búsqueda y filtros, zoom,
  multi-selección, scroll infinito.
- **Cambios (WIP)**: stage / unstage / descartar por archivo, **por hunk y por
  línea**, commit, amend, plantillas de mensaje, `--no-verify`.
- **Diff viewer**: números de línea, hunks, resaltado; historial de archivo
  (`--follow`), **blame** y restaurar versiones anteriores.
- **Comparaciones**: entre ramas/refs arbitrarias con diff por archivo.
- **Ramas**: crear, checkout, renombrar, eliminar, merge, rebase,
  ahead/behind; **rebase interactivo visual** (reordenar con drag & drop,
  pick/reword/squash/fixup/drop).
- **Conflictos**: editor visual a 3 zonas (elegir por hunk/línea, salida
  editable) y banner de operación (merge/rebase/cherry-pick/revert) con
  continuar/abortar.
- **Remotos**: fetch/pull/push, prune, set-url, rename, upstream, borrar
  ramas remotas.
- **Stash** (incl. renombrar y diff), **tags** (renombrar, push, borrado
  remoto), **reset**, **cherry-pick**, **revert**.
- **Pull Requests (GitHub)**: crear, listar, revisar con diff, comentar (en
  línea también), aprobar, merge (3 métodos) y cerrar sin salir de la app.
- **Issues (GitHub)**: listar, crear, comentar, crear rama desde un issue.
- **Actividad**: PRs, issues y WIP de todos tus repos en un panel.
- **Worktrees** y **submódulos** completos.
- **Terminal integrada** (xterm.js) con sesión por repositorio.
- **Firmas GPG/SSH** (insignia de verificación por commit), hooks,
  **Gitflow** y **Bisect** visuales, **Git LFS**.
- **Cuentas** multiproveedor cifradas con `safeStorage` del sistema.
- **Preferencias**: tema claro/oscuro, zoom, paneles, **atajos reasignables**,
  git config global/local, elegir ejecutable de git.

### Ideas futuras

- Integraciones GitLab / Bitbucket / Azure para PRs e Issues (GitHub ya está).
- Undo/Redo global.

## Calidad y seguridad

- **CI** en GitHub Actions: typecheck, suite de tests (unitarios + integración
  contra repos Git reales) y build en Linux y Windows, más `npm audit` y
  análisis estático con CodeQL.
- El renderer corre con `contextIsolation` y sin integración de Node; todo
  pasa por un puente IPC tipado (`preload`).
- ¿Encontraste una vulnerabilidad? Mira [SECURITY.md](SECURITY.md).

## Licencia

[MIT](LICENSE) © 2026 Pleamar Labs.
Avisos de dependencias de terceros en
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

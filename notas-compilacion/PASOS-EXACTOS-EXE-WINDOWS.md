# Pasos exactos para generar el .exe de Windows

Comandos exactos (copiar y pegar) para compilar Marea y generar el instalador
de Windows. Flujo verificado: typecheck, tests, build y empaquetado sin errores,
y el `Marea.exe` resultante abre, carga repositorios y la terminal integrada.

## Requisitos

- Windows 10/11 x64.
- Node.js 20.19 o superior (vite 7 lo exige).
- Git instalado (los tests y la app usan el `git` del sistema).
- NO hace falta Visual Studio ni compiladores de C++: en Windows `node-pty`
  usa sus binarios precompilados (`prebuilds/win32-x64`).

## Opción recomendada (todo de una vez)

Desde una terminal (PowerShell o Git Bash) en la carpeta del proyecto:

```bash
# 1) Instalar dependencias (solo la primera vez o tras cambiar package.json)
npm install

# 2) Comprobar que todo está en verde antes de empaquetar
npm run typecheck
npm test

# 3) Compilar y generar el instalador NSIS (x64)
npm run dist

# 4) Verificar el artefacto generado
dir release\Marea-*-win-x64.exe
```

`npm run dist` ejecuta `electron-vite build` y después `electron-builder` con
la configuración de `electron-builder.yml` (en Windows genera el instalador
NSIS x64). Equivale a:

```bash
npx electron-vite build
npx electron-builder --win --x64
```

> `npmRebuild: false` ya está en `electron-builder.yml`: electron-builder no
> intenta recompilar `node-pty` (fallaría pidiendo Visual Studio y además no
> hace falta). Ya no es necesario pasar `-c.npmRebuild=false`, aunque añadirlo
> no hace daño.

## Prueba del ejecutable (antes de subirlo)

```bash
# Versión desempaquetada (arranque rápido, sin instalar):
release\win-unpacked\Marea.exe
```

Comprueba:

1. Abre la ventana de Marea y puedes abrir un repositorio.
2. **Terminal** (o Ctrl+T) abre un PowerShell dentro de la app → `node-pty`
   está bien empaquetado.
3. Al seleccionar una imagen o un PDF de un commit se ve la vista previa.

Para probar el instalador completo:

1. Doble clic en `release\Marea-0.2.2-win-x64.exe`.
2. Si SmartScreen avisa («Windows protegió tu PC»): **Más información** →
   **Ejecutar de todas formas** (el instalador no está firmado; es normal).
3. Instala, abre Marea desde el acceso directo y prueba abrir un repositorio.

## Subir al release de GitHub

Sube este archivo al release correspondiente:

- `release\Marea-0.2.2-win-x64.exe`

(El `.blockmap`, `latest.yml` y `builder-debug.yml` no hace falta subirlos.)

## Si cambias de versión

La versión sale de `package.json` (ahora **0.2.2**). Para la siguiente,
actualízala sin crear tag:

```bash
npm version 0.2.3 --no-git-tag-version
```

El instalador saldrá como `Marea-0.2.3-win-x64.exe` (el nombre lo arma
`artifactName` en `electron-builder.yml`).

## Detalles que ya están configurados (no hay que tocarlos)

- **Icono**: `build/icon.ico` (electron-builder lo toma solo de `build/`).
- **Instalador**: NSIS por usuario (sin admin), permite elegir carpeta,
  crea accesos directos en Escritorio y Menú Inicio (`electron-builder.yml`,
  sección `nsis`).
- **node-pty fuera del asar**: `asarUnpack` en `electron-builder.yml`
  (los `.node/.dll/.exe` no pueden cargarse desde dentro del asar).
- **Perfil de desarrollo separado**: sin empaquetar (`npm run dev`,
  `npm start`) la app guarda sus datos en `%APPDATA%\Marea-dev`; la instalada,
  en `%APPDATA%\Marea`. Pueden estar abiertas a la vez.

## Errores conocidos y su causa

| Error | Causa | Solución |
|---|---|---|
| `Electron failed to install correctly` al hacer `npm run dev` / `npm start` | El binario de Electron no se descargó durante `npm install` (red cortada, `--ignore-scripts`…) | `node node_modules/electron/install.js` (o borrar `node_modules` y repetir `npm install`) |
| `node-gyp failed to rebuild ... node-pty` | Se forzó `npmRebuild: true` (intenta recompilar y no hay Visual Studio) | Dejar `npmRebuild: false` o pasar `-c.npmRebuild=false` |
| `Unable to move the cache: Acceso denegado (0x5)` al abrir en desarrollo | Versión antigua: la app instalada y `npm run dev` compartían perfil | Corregido: el modo desarrollo usa el perfil `Marea-dev` |
| SmartScreen bloquea el instalador | Ejecutable sin firma de código | «Más información» → «Ejecutar de todas formas» |

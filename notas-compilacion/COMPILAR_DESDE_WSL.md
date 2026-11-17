# Notas de compilación de Marea desde WSL

> **Estado actual (17-11-2026, 0.2.2):** los comandos exactos y probados
> están en [PASOS-EXACTOS-DEB-APPIMAGE-UBUNTU.md](PASOS-EXACTOS-DEB-APPIMAGE-UBUNTU.md).
> `electron-builder.yml` mantiene `npmRebuild: false` (lo que necesita el
> `.exe` de Windows); para Linux se pasa en la línea de comandos:
> `npx electron-builder --linux -c.npmRebuild=true`, **siempre dentro de Linux**
> (en WSL, en un clon en `~`, no en `/mnt/e`). Ya están en el repo
> `desktopName: "marea.desktop"` (package.json), `linux.syncDesktopName: true`
> y la dependencia `libasound2` del `.deb`. Lo que sigue es el registro de lo
> que se probó en su momento.

Este documento resume lo que pasó al compilar Marea para Linux, los errores
que aparecieron, cómo se solucionaron y qué comandos usar si vuelves a generar
los binarios desde Windows con WSL.

## Resumen corto

La compilación final quedó correcta. Se generaron estos artefactos en `release/`:

- `Marea-0.2.2-linux-x86_64.AppImage`
- `Marea-0.2.2-linux-amd64.deb`

El problema principal no era Ubuntu, sino el empaquetado de `node-pty` y una
configuración de `electron-builder` que necesitaba ajustes para Linux.

## Qué errores aparecieron

### 1) `node-pty` no encontraba el binario Linux

Síntoma observado dentro de la app instalada:

```text
Cannot find module './prebuilds/linux-x64/pty.node'
```

También se vio que dentro del paquete había binarios para macOS y Windows, pero
no el binario correcto para Linux.

#### Solución

- Se dejó `asarUnpack` para `node-pty` en `electron-builder.yml`.
- Se activó `npmRebuild: true` para que los módulos nativos se recompilen para
  Electron/Linux durante el empaquetado.

### 2) `desktopName` estaba en el sitio incorrecto

Se intentó poner `desktopName` dentro de la sección `linux` de
`electron-builder.yml`, pero eso rompió la validación del schema.

Síntoma:

```text
Invalid configuration object. electron-builder ...
configuration.linux should be one of these: null
```

#### Solución

- Se movió `desktopName` a `package.json`.
- Se dejó `syncDesktopName: true` dentro de `linux` en `electron-builder.yml`.

### 3) `npm run typecheck` falló en el entorno temporal

El chequeo tipo falló en una ejecución intermedia porque `tsc` no estaba
disponible en ese entorno aislado:

```text
sh: 1: tsc: not found
```

#### Solución

- Se validó en el proyecto real con `npm install` seguido de `npm run build`.
- La compilación completa sí funcionó después de instalar dependencias.

### 4) El AppImage no abría por falta de FUSE

En la primera prueba del AppImage apareció este error:

```text
dlopen(): error loading libfuse.so.2
```

#### Solución

Instalar FUSE 2 en el sistema:

```bash
sudo apt update
sudo apt install libfuse2
```

En algunas versiones recientes de Ubuntu/Debian el paquete puede llamarse:

```bash
sudo apt install libfuse2t64
```

### 5) Aparecieron avisos al abrir el AppImage

Se vieron mensajes como estos:

```text
Schema org.gnome.desktop.interface does not have key font-antialiasing
--ozone-platform=wayland is not compatible with Vulkan
(node:...) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated
```

#### Solución / interpretación

- No bloquearon el arranque.
- Son advertencias del entorno gráfico o de Electron, no un fallo fatal.
- Si la ventana abre y la app funciona, se pueden considerar mensajes
  informativos.

## Cambios que quedaron en el repo

- `electron-builder.yml`: `asarUnpack` para `node-pty`, `npmRebuild: false`
  (Windows) y, en Linux, `syncDesktopName: true` y `deb.depends` con
  `libasound2` (sin ella `marea` no arrancaba en Ubuntu mínimo ni en WSL:
  `libasound.so.2: cannot open shared object file`).
- `package.json`: `desktopName: "marea.desktop"`.
- Manual de usuario: permisos del AppImage, `libfuse2` / `libfuse2t64` y
  avisos que no son errores.

## Cómo repetir la compilación desde WSL

**No uses `npm run dist` para Linux**: aplica `npmRebuild: false` y el paquete
sale sin el `pty.node` de Linux (justo el error del punto 1). Sigue
[PASOS-EXACTOS-DEB-APPIMAGE-UBUNTU.md](PASOS-EXACTOS-DEB-APPIMAGE-UBUNTU.md);
en resumen:

```bash
git clone --branch main https://github.com/AngelMendoz/marea.git ~/marea
cd ~/marea
npm ci
npm run build
npx electron-builder --linux -c.npmRebuild=true
cp release/Marea-*-linux-* /mnt/c/ruta/a/marea/release/
```

## Instalación en Linux

### Desinstalar el `.deb`

```bash
sudo apt remove --purge marea
sudo apt autoremove --purge
```

### Ejecutar el AppImage

```bash
chmod +x Marea-0.2.2-linux-x86_64.AppImage
./Marea-0.2.2-linux-x86_64.AppImage
```

Si falta FUSE:

```bash
sudo apt install libfuse2
```

## Nota final

Si vuelves a compilar desde WSL y algo falla, el orden correcto de verificación
es:

1. `npm install`
2. `npm run build`
3. `npx electron-builder --linux -c.npmRebuild=true`
4. Probar primero el `.deb`
5. Probar luego el AppImage

El `.deb` fue la prueba más estable; el AppImage depende de FUSE en el equipo
donde se ejecuta.
# Pasos exactos para generar .deb y AppImage en Ubuntu

Comandos probados el 17-11-2026 con Marea 0.2.2 en **Ubuntu 26.04 dentro de
WSL2** (Node 22.22 y npm 9.2 de apt, electron-builder 26.15, Electron 43.1).
El `.deb` se instaló con apt y el AppImage se ejecutó; en los dos funcionaron
abrir un repo, hacer un commit, la terminal integrada (bash vía node-pty) y la
vista previa de imágenes y PDF. En Ubuntu nativo los comandos son los mismos.

## La regla que importa: compilar DENTRO de Linux

`node-pty` (la terminal integrada) es un módulo nativo y **no trae binario
precompilado para Linux** (solo Windows y macOS). Hay que compilarlo en Linux
con `-c.npmRebuild=true`. Si se empaqueta desde Windows, o desde `/mnt/c` o
`/mnt/e` con los `node_modules` de Windows, el `.deb` sale sin `pty.node` de
Linux y la terminal falla con:

```text
Cannot find module './prebuilds/linux-x64/pty.node'
```

Por eso `npm run dist` **no sirve para Linux**: usa `npmRebuild: false` de
`electron-builder.yml`, que es lo correcto para el `.exe` de Windows (allí
node-pty sí trae binario y recompilar pediría Visual Studio).

## 1) Requisitos (una sola vez)

```bash
sudo apt update
sudo apt install -y build-essential python3 git nodejs npm libfuse2t64
```

- Node 20.19 o superior (Ubuntu 26.04 trae Node 22 en apt; en Ubuntu 22.04
  instala Node 20+ desde NodeSource o nvm).
- `libfuse2t64` (en Ubuntu 22.04: `libfuse2`) solo hace falta para ejecutar
  el AppImage, no para compilarlo.
- En WSL, si `sudo` pide una contraseña que no recuerdas, desde PowerShell
  puedes entrar como root: `wsl -d Ubuntu -u root`.

## 2) Copia del proyecto en el disco de Linux

En WSL, **no** compiles en `/mnt/e/...`: clona el repo en `~` (más rápido y
sin `node_modules` de Windows).

```bash
rm -rf ~/marea
git clone --branch main https://github.com/AngelMendoz/marea.git ~/marea
cd ~/marea
```

(Desde WSL también puedes clonar tu copia local de Windows, p. ej.
`git clone /mnt/c/ruta/a/marea ~/marea`, para compilar cambios sin subir.)

## 3) Compilar y empaquetar

```bash
cd ~/marea
npm ci
npm run build
npx electron-builder --linux -c.npmRebuild=true
ls -lh release/Marea-*-linux-*
```

Resultado:

- `release/Marea-0.2.4-linux-amd64.deb` (~100 MB)
- `release/Marea-0.2.4-linux-x86_64.AppImage` (~130 MB)

En el log debe aparecer `preparing moduleName=node-pty` y
`finished moduleName=node-pty`. Comprobación rápida de que el `.deb` lleva el
binario Linux:

```bash
dpkg-deb -c release/Marea-*-linux-amd64.deb | grep build/Release/pty.node
```

## 4) Copiar los instaladores a Windows (solo WSL)

```bash
cp ~/marea/release/Marea-*-linux-* /mnt/c/ruta/a/marea/release/
```

## 5) Instalar y probar el .deb

```bash
cd ~/marea/release
sudo apt install ./Marea-0.2.4-linux-amd64.deb
marea
```

- Usa `apt install ./archivo.deb` (no `dpkg -i`): apt instala las
  dependencias que falten. El paquete declara `libasound2`; en Ubuntu 24.04+
  la cubre `libasound2t64`. Sin ella `marea` no arranca
  (`libasound.so.2: cannot open shared object file`), cosa que pasaba en
  Ubuntu mínimo y en WSL con paquetes anteriores a este ajuste.
- En Ubuntu 24.04+ el `.deb` instala además un perfil de AppArmor
  (`/etc/apparmor.d/marea`) para que el sandbox de Chromium funcione.
- Desinstalar: `sudo apt remove --purge marea`.

## 6) Probar el AppImage

```bash
cd ~/marea/release
chmod +x Marea-0.2.4-linux-x86_64.AppImage
./Marea-0.2.4-linux-x86_64.AppImage
```

- `dlopen(): error loading libfuse.so.2` → falta FUSE 2:
  `sudo apt install libfuse2t64` (Ubuntu 24.04+) o `libfuse2` (22.04).
- En Ubuntu 24.04+ con escritorio, AppArmor limita los *user namespaces* y un
  AppImage de Electron puede cerrarse con
  `The SUID sandbox helper binary was found, but is not configured correctly`.
  El AppImage no instala perfil de AppArmor (el `.deb` sí). Soluciones: usar
  el `.deb`, o lanzar con `./Marea-0.2.4-linux-x86_64.AppImage --no-sandbox`.
  En WSL no pasa (su kernel no activa AppArmor), así que esto **no** se ha
  podido comprobar aquí.

## Avisos que no son errores

Al arrancar pueden salir mensajes de GTK, Wayland/Vulkan, `dbus` o
`DeprecationWarning` de Node. Si la ventana abre y funciona, se pueden
ignorar.

## Prueba automatizada (opcional)

Para probar sin tocar tu perfil: `marea --user-data-dir=/tmp/marea-prueba
--remote-debugging-port=9335`. En WSL el puerto es accesible desde Windows
en `http://127.0.0.1:9335`.

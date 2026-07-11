import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { disposeAllTerminals } from './terminal'

// En desarrollo se aísla el perfil: la app instalada y `npm run dev` comparten
// %APPDATA%/Marea, y con las dos abiertas la caché de disco/GPU falla con
// "Unable to move the cache: Acceso denegado (0x5)".
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#1a2530',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Las ventanas nuevas se delegan al navegador (solo URLs web) y el renderer
  // no puede navegar fuera de la app.
  win.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  // En desarrollo electron-vite sirve el renderer por HTTP; en producción se
  // carga el HTML compilado.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Sin shells huérfanos al salir de la app.
app.on('will-quit', () => disposeAllTerminals())

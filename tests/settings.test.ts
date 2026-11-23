import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `settings.ts` lee y persiste en localStorage al cargarse: se simula uno en
// memoria y se importa el módulo de nuevo en cada test para partir de cero.
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v))
  }
}

async function loadSettings(saved?: object) {
  const storage = memoryStorage(saved ? { 'marea-settings': JSON.stringify(saved) } : {})
  vi.stubGlobal('localStorage', storage)
  vi.resetModules()
  const mod = await import('@/settings')
  return { useSettings: mod.useSettings, storage }
}

const persisted = (storage: Storage) => JSON.parse(storage.getItem('marea-settings') ?? '{}')

describe('ancho del panel derecho', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('por defecto es fluido (0) y el panel está visible', async () => {
    const { useSettings } = await loadSettings()
    expect(useSettings.getState().detailWidth).toBe(0)
    expect(useSettings.getState().showRightPanel).toBe(true)
  })

  it('limita el ancho entre 260 y 900 px y redondea', async () => {
    const { useSettings } = await loadSettings()
    const { setDetailWidth } = useSettings.getState()
    setDetailWidth(100)
    expect(useSettings.getState().detailWidth).toBe(260)
    setDetailWidth(5000)
    expect(useSettings.getState().detailWidth).toBe(900)
    setDetailWidth(512.6)
    expect(useSettings.getState().detailWidth).toBe(513)
  })

  it('0 vuelve al ancho por defecto (doble clic en el borde)', async () => {
    const { useSettings } = await loadSettings()
    useSettings.getState().setDetailWidth(600)
    useSettings.getState().setDetailWidth(0)
    expect(useSettings.getState().detailWidth).toBe(0)
  })

  it('persiste el ancho junto al resto de preferencias', async () => {
    const { useSettings, storage } = await loadSettings()
    useSettings.getState().setDetailWidth(640)
    expect(persisted(storage).detailWidth).toBe(640)
    // Se conserva al recargar la app.
    const again = await loadSettings(persisted(storage))
    expect(again.useSettings.getState().detailWidth).toBe(640)
  })

  it('preferencias guardadas por versiones anteriores (sin detailWidth) siguen cargando', async () => {
    const { useSettings } = await loadSettings({
      zoom: 1.25,
      showSidebar: false,
      showRightPanel: true,
      sidebarWidth: 300,
      pullMode: 'rebase'
    })
    const s = useSettings.getState()
    expect(s.detailWidth).toBe(0)
    expect(s.zoom).toBe(1.25)
    expect(s.showSidebar).toBe(false)
    expect(s.sidebarWidth).toBe(300)
    expect(s.pullMode).toBe('rebase')
  })
})

describe('paneles: comportamiento previo intacto', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('mostrar/ocultar el panel derecho alterna y persiste', async () => {
    const { useSettings, storage } = await loadSettings()
    useSettings.getState().toggleRightPanel()
    expect(useSettings.getState().showRightPanel).toBe(false)
    expect(persisted(storage).showRightPanel).toBe(false)
    useSettings.getState().toggleRightPanel()
    expect(useSettings.getState().showRightPanel).toBe(true)
  })

  it('el ancho del panel derecho no altera el del sidebar', async () => {
    const { useSettings } = await loadSettings()
    useSettings.getState().setSidebarWidth(300)
    useSettings.getState().setDetailWidth(700)
    expect(useSettings.getState().sidebarWidth).toBe(300)
    expect(useSettings.getState().detailWidth).toBe(700)
  })

  it('el sidebar mantiene sus límites de 170 a 420 px', async () => {
    const { useSettings } = await loadSettings()
    useSettings.getState().setSidebarWidth(50)
    expect(useSettings.getState().sidebarWidth).toBe(170)
    useSettings.getState().setSidebarWidth(1000)
    expect(useSettings.getState().sidebarWidth).toBe(420)
    useSettings.getState().setSidebarWidth(0)
    expect(useSettings.getState().sidebarWidth).toBe(0)
  })

  it('el atajo del panel derecho sigue siendo Ctrl+J', async () => {
    const { useSettings } = await loadSettings()
    expect(useSettings.getState().shortcuts.toggleRightPanel).toBe('Ctrl+J')
  })
})

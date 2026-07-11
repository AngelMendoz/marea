import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Configuración de pruebas (vitest). Los tests corren en Node puro: cubren la
// lógica pura de `src/shared` y `src/renderer/src/lib`, y la integración de
// `gitService` contra repositorios Git reales creados en carpetas temporales.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // La integración Git arranca procesos reales; margen amplio por si el
    // sistema de archivos temporal va lento (Windows, antivirus…).
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
})

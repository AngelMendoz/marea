import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll } from 'vitest'
import { gitService } from '../src/main/git/gitService'

// Utilidades compartidas por los tests de integración de gitService: crean
// repos Git reales en carpetas temporales, aislados de la config global del
// usuario, y los limpian al terminar.

const created: string[] = []

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

/** Crea una carpeta temporal registrada para limpieza automática. */
export function tmp(prefix = 'marea-test-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

/** git directo (sin pasar por gitService) para preparar escenarios. */
export function raw(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' })
}

/** Fija identidad y desactiva firma/hooks para commits deterministas. */
export function configureRepo(repo: string): void {
  raw(repo, ['config', 'user.name', 'Test User'])
  raw(repo, ['config', 'user.email', 'test@example.com'])
  raw(repo, ['config', 'commit.gpgsign', 'false'])
  raw(repo, ['config', 'tag.gpgsign', 'false'])
  // Sin conversión de fin de línea: los tests comparan contenido byte a byte
  // y no deben depender de core.autocrlf del sistema (Windows).
  raw(repo, ['config', 'core.autocrlf', 'false'])
  raw(repo, ['config', 'core.eol', 'lf'])
  raw(repo, ['config', 'core.hooksPath', join(repo, '.git', 'no-hooks')])
}

/** Repo inicializado y configurado, listo para operar. */
export async function newRepo(): Promise<string> {
  const dir = tmp()
  await gitService.init(dir)
  configureRepo(dir)
  return dir
}

/** Escribe un archivo (crea directorios intermedios si hace falta). */
export function write(repo: string, file: string, content: string): void {
  writeFileSync(join(repo, file), content)
}

/** Escribe, stagea y commitea; devuelve el SHA del commit creado. */
export async function commitFile(
  repo: string,
  file: string,
  content: string,
  message: string
): Promise<string> {
  write(repo, file, content)
  await gitService.stage(repo, [file])
  await gitService.commit(repo, message)
  return raw(repo, ['rev-parse', 'HEAD']).trim()
}

export { gitService }

import { describe, expect, it } from 'vitest'
import { bisectCulprit } from '../src/shared/bisect'

const SHA = 'd81fbb1fb9d50e2f8ef9719fae7e86ae2be26d43'

describe('bisectCulprit', () => {
  it('reconoce el formato de git anterior a 2.56', () => {
    expect(bisectCulprit(`${SHA} is the first bad commit\ncommit ${SHA}\n`)).toBe(SHA)
  })

  it("reconoce el formato de git 2.56+ (término entre comillas)", () => {
    expect(bisectCulprit(`${SHA} is the first 'bad' commit\ncommit ${SHA}\n`)).toBe(SHA)
  })

  it('devuelve null mientras la búsqueda sigue', () => {
    expect(bisectCulprit('Bisecting: 1 revision left to test after this (roughly 1 step)\n')).toBeNull()
  })
})

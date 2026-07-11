import { describe, expect, it } from 'vitest'
import { fullDate, initials, relativeTime } from '@/lib/time'

describe('relativeTime', () => {
  const now = () => Date.now() / 1000

  it('umbral de segundos, minutos, horas, días', () => {
    expect(relativeTime(now() - 10)).toBe('hace un momento')
    expect(relativeTime(now() - 120)).toBe('hace 2 min')
    expect(relativeTime(now() - 3600 * 5)).toBe('hace 5 h')
    expect(relativeTime(now() - 86400 * 3)).toBe('hace 3 d')
  })

  it('semanas, meses y años', () => {
    expect(relativeTime(now() - 86400 * 14)).toBe('hace 2 sem')
    expect(relativeTime(now() - 86400 * 60)).toBe('hace 2 mes')
    expect(relativeTime(now() - 86400 * 365 * 2)).toBe('hace 2 a')
  })
})

describe('initials', () => {
  it('nombre y apellido → dos iniciales', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
  })
  it('un solo nombre → dos primeras letras', () => {
    expect(initials('Linus')).toBe('LI')
  })
  it('varios espacios → primera y última palabra', () => {
    expect(initials('  Grace  Brewster  Hopper ')).toBe('GH')
  })
})

describe('fullDate', () => {
  it('devuelve una cadena no vacía', () => {
    expect(fullDate(1_700_000_000)).toBeTypeOf('string')
    expect(fullDate(1_700_000_000).length).toBeGreaterThan(0)
  })
})

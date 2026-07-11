// Color estable por autor para los avatares del grafo: cada persona conserva
// su color en todo el historial.

const AVATAR_COLORS = [
  '#41b9d6', // teal
  '#a87ddb', // purple
  '#5bc873', // green
  '#e8a33d', // orange
  '#e2607b', // pink
  '#5c8df0', // blue
  '#56c2b0', // cian verdoso
  '#df6b4f', // red-orange
  '#c9a227', // gold
  '#9a8cff', // violet
  '#e0699e', // magenta
  '#4bb58f' // emerald
]

/** Hash djb2 → color determinista de la paleta. Se usa el email cuando está
 *  disponible: es más estable que el nombre visible. */
export function authorColor(key: string): string {
  const s = key.toLowerCase().trim()
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

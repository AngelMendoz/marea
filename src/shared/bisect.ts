/** SHA del commit culpable en la salida de `git bisect good|bad`, o null si la
 *  búsqueda no ha terminado. Git 2.56+ pone el término entre comillas
 *  («<sha> is the first 'bad' commit»); las versiones anteriores, no. */
export function bisectCulprit(output: string): string | null {
  return output.match(/([0-9a-f]{7,40}) is the first '?bad'? commit/)?.[1] ?? null
}

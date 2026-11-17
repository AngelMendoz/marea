/** Clasificación de archivos por extensión: permite saber, sin leerlos, cuáles
 *  no tiene sentido cargar como texto (diff, vista Archivo, blame). */

export type FileKind = 'text' | 'image' | 'pdf' | 'binary'

/** Imágenes que Chromium muestra directamente (las demás van como binario). */
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif'])

/** Binarios habituales en repos: documentos de Office, comprimidos, ejecutables,
 *  multimedia, fuentes, bases de datos… (los PDF a menudo no tienen bytes NUL al
 *  principio y git los diferenciaría como texto gigante). */
const BINARY = new Set([
  // Office / documentos
  'doc', 'docx', 'docm', 'dot', 'dotx', 'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ppt', 'pptx',
  'pptm', 'pps', 'ppsx', 'pot', 'potx', 'odt', 'ods', 'odp', 'odg', 'pages', 'numbers',
  'epub', 'mobi', 'vsd', 'vsdx', 'mpp', 'pub', 'one', 'msg', 'xps',
  // Imágenes no previsualizables / diseño
  'tif', 'tiff', 'psd', 'ai', 'eps', 'heic', 'heif', 'raw', 'cr2', 'nef', 'dng', 'xcf', 'sketch',
  'fig', 'blend', 'fbx', 'stl', '3ds', 'max', 'dwg', 'skp',
  // Comprimidos / paquetes
  'zip', '7z', 'rar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'tar', 'jar', 'war', 'ear', 'apk', 'aab',
  'ipa', 'nupkg', 'whl', 'deb', 'rpm', 'dmg', 'iso', 'img', 'msi', 'msix', 'appx', 'cab', 'vsix',
  // Ejecutables / objetos
  'exe', 'dll', 'so', 'dylib', 'lib', 'a', 'o', 'obj', 'pdb', 'class', 'pyc', 'pyo', 'wasm', 'bin',
  'dat', 'node', 'sys', 'ko', 'elf',
  // Multimedia
  'mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wma', 'aif', 'aiff', 'mid', 'midi',
  'mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'swf',
  // Fuentes
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // Bases de datos / datos binarios
  'db', 'sqlite', 'sqlite3', 'mdb', 'accdb', 'parquet', 'avro', 'orc', 'feather', 'npy', 'npz',
  'pkl', 'pickle', 'h5', 'hdf5', 'mat', 'sav', 'onnx', 'pt', 'pth', 'ckpt', 'safetensors', 'tflite',
  'keystore', 'jks', 'p12', 'pfx', 'der'
])

export function fileExt(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Tipo según la extensión. `text` también cubre extensiones desconocidas: esas
 *  se confirman mirando su contenido (bytes NUL) en el proceso principal. */
export function kindByExt(path: string): FileKind {
  const ext = fileExt(path)
  if (ext === 'pdf') return 'pdf'
  if (IMAGE.has(ext)) return 'image'
  if (BINARY.has(ext)) return 'binary'
  return 'text'
}

/** Mismo criterio que git: hay un byte NUL en los primeros 8000 bytes. */
export function looksBinary(head: Uint8Array): boolean {
  const n = Math.min(head.length, 8000)
  for (let i = 0; i < n; i++) if (head[i] === 0) return true
  return false
}

/** Versión de un archivo a un lado del cambio (antes/después). */
export interface FileSideInfo {
  /** Bytes, o null si en ese lado el archivo no existe (nuevo/eliminado). */
  size: number | null
  /** Identidad del contenido (oid del blob, o tamaño+mtime en el working tree):
   *  si no cambia, la vista previa no se vuelve a descargar. */
  sig: string
}

export interface FileInfo {
  kind: FileKind
  old: FileSideInfo
  new: FileSideInfo
}

/** Límite para cargar un archivo entero en la vista previa. */
export const PREVIEW_MAX_BYTES = 64 * 1024 * 1024

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toLocaleString('es', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[u]}`
}

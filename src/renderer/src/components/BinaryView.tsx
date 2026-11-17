import { ExternalLink, FileArchive, FileImage, FileText, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fileExt, formatBytes, PREVIEW_MAX_BYTES, type FileInfo } from '@shared/fileKinds'
import { bridge } from '../bridge'
import { useStore } from '../store'

type Side = 'old' | 'new'

export interface FileRef {
  file: string
  staged?: boolean
  commit?: string
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  pdf: 'application/pdf'
}

/** Descarga los bytes de un lado del cambio y los expone como URL `blob:`.
 *  Solo se vuelve a pedir si cambia la versión (`sig`), no en cada refresco. */
function useBlobUrl(repoPath: string | undefined, ref: FileRef, side: Side, sig: string, enabled: boolean) {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({ url: null, error: null })
  useEffect(() => {
    if (!repoPath || !enabled) return
    let cancelled = false
    let url: string | null = null
    setState({ url: null, error: null })
    bridge
      .fileBlob(repoPath, ref, side)
      .then((bytes) => {
        if (cancelled) return
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[fileExt(ref.file)] ?? 'application/octet-stream' }))
        setState({ url, error: null })
      })
      .catch((e) => !cancelled && setState({ url: null, error: e instanceof Error ? e.message : String(e) }))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [repoPath, ref.file, ref.staged, ref.commit, side, sig, enabled])
  return state
}

function ImagePane({ repoPath, fileRef, side, info, label }: {
  repoPath: string | undefined
  fileRef: FileRef
  side: Side
  info: FileInfo
  label?: string
}): JSX.Element {
  const s = info[side]
  const tooBig = (s.size ?? 0) > PREVIEW_MAX_BYTES
  const { url, error } = useBlobUrl(repoPath, fileRef, side, s.sig, !tooBig)
  const [dims, setDims] = useState<string | null>(null)
  return (
    <div className={`bin-image-pane ${side}`}>
      <div className="bin-pane-label">
        {[label, dims, s.size != null ? formatBytes(s.size) : null].filter(Boolean).join(' · ')}
      </div>
      <div className="bin-image-stage">
        {tooBig ? (
          <div className="empty">Demasiado grande para la vista previa</div>
        ) : error ? (
          <div className="empty">No se pudo cargar: {error}</div>
        ) : url ? (
          <img
            src={url}
            alt={fileRef.file}
            onLoad={(e) => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
          />
        ) : (
          <div className="empty">Cargando…</div>
        )}
      </div>
    </div>
  )
}

function PdfPane({ repoPath, fileRef, side, info }: {
  repoPath: string | undefined
  fileRef: FileRef
  side: Side
  info: FileInfo
}): JSX.Element {
  const tooBig = (info[side].size ?? 0) > PREVIEW_MAX_BYTES
  const { url, error } = useBlobUrl(repoPath, fileRef, side, info[side].sig, !tooBig)
  if (tooBig) return <div className="empty">Demasiado grande para la vista previa</div>
  if (error) return <div className="empty">No se pudo cargar: {error}</div>
  if (!url) return <div className="empty">Cargando…</div>
  return <iframe className="bin-pdf" src={url} title={fileRef.file} />
}

/** Vista de archivos que no se muestran como texto: imágenes (antes/después),
 *  PDF con el visor integrado y, para el resto (Office, comprimidos…), sus
 *  datos y accesos para abrirlos fuera. Nunca carga el contenido como texto. */
export function BinaryView({ fileRef, info: given }: { fileRef: FileRef; info?: FileInfo | null }): JSX.Element {
  const repoPath = useStore((s) => s.repo?.path)
  const notify = useStore((s) => s.notify)
  const [loaded, setLoaded] = useState<FileInfo | null>(null)
  const [pdfSide, setPdfSide] = useState<Side>('new')

  // Sin `info` del padre (p. ej. historial de archivo): se pide aquí.
  useEffect(() => {
    if (given !== undefined || !repoPath) return
    let cancelled = false
    setLoaded(null)
    bridge.fileInfo(repoPath, fileRef).then(
      (i) => !cancelled && setLoaded(i),
      () => !cancelled && setLoaded(null)
    )
    return () => {
      cancelled = true
    }
  }, [given, repoPath, fileRef.file, fileRef.staged, fileRef.commit])

  const info = given ?? loaded
  if (!info) return <div className="empty">Cargando…</div>

  const hasOld = info.old.size != null
  const hasNew = info.new.size != null
  const both = hasOld && hasNew && info.old.sig !== info.new.sig
  const main: Side = hasNew ? 'new' : 'old'
  const ext = fileExt(fileRef.file).toUpperCase()
  const isWorkTree = !fileRef.commit && !fileRef.staged

  const open = (side: Side): void => {
    if (!repoPath) return
    bridge
      .openFileVersion(repoPath, fileRef, side)
      .catch((e) => notify('error', `No se pudo abrir: ${e instanceof Error ? e.message : String(e)}`))
  }

  const sizes = both
    ? `${formatBytes(info.old.size!)} → ${formatBytes(info.new.size!)}`
    : hasNew && !hasOld
      ? `Archivo nuevo · ${formatBytes(info.new.size!)}`
      : hasOld && !hasNew
        ? `Archivo eliminado · ${formatBytes(info.old.size!)}`
        : hasNew
          ? formatBytes(info.new.size!)
          : 'No disponible'

  const Icon = info.kind === 'image' ? FileImage : info.kind === 'pdf' ? FileText : FileArchive
  const kindLabel =
    info.kind === 'image' ? `Imagen ${ext}` : info.kind === 'pdf' ? 'Documento PDF' : `Archivo binario${ext ? ` .${ext.toLowerCase()}` : ''}`

  return (
    <div className="binary-view">
      <div className="bin-head">
        <Icon size={14} color="var(--accent)" />
        <span className="bin-kind">{kindLabel}</span>
        <span className="bin-size">{sizes}</span>
        {info.kind === 'pdf' && both && (
          <div className="seg small">
            <button className={pdfSide === 'old' ? 'active' : ''} onClick={() => setPdfSide('old')}>
              Antes
            </button>
            <button className={pdfSide === 'new' ? 'active' : ''} onClick={() => setPdfSide('new')}>
              Después
            </button>
          </div>
        )}
        <span className="bin-spacer" />
        {bridge.isElectron && (hasOld || hasNew) && (
          <>
            {both && (
              <button className="mini" title="Abrir la versión anterior con su aplicación" onClick={() => open('old')}>
                <ExternalLink size={13} /> Abrir anterior
              </button>
            )}
            <button className="mini" title="Abrir con la aplicación predeterminada del sistema" onClick={() => open(main)}>
              <ExternalLink size={13} /> Abrir
            </button>
            {isWorkTree && hasNew && repoPath && (
              <button className="mini" title="Mostrar en el explorador" onClick={() => bridge.showInFolder(repoPath, fileRef.file)}>
                <FolderOpen size={13} />
              </button>
            )}
          </>
        )}
      </div>

      {!hasOld && !hasNew ? (
        <div className="empty">El archivo no existe en esta versión</div>
      ) : info.kind === 'image' ? (
        <div className={`bin-images${both ? ' both' : ''}`}>
          {both ? (
            <>
              <ImagePane repoPath={repoPath} fileRef={fileRef} side="old" info={info} label="Antes" />
              <ImagePane repoPath={repoPath} fileRef={fileRef} side="new" info={info} label="Después" />
            </>
          ) : (
            <ImagePane key={main} repoPath={repoPath} fileRef={fileRef} side={main} info={info} />
          )}
        </div>
      ) : info.kind === 'pdf' ? (
        <PdfPane key={both ? pdfSide : main} repoPath={repoPath} fileRef={fileRef} side={both ? pdfSide : main} info={info} />
      ) : (
        <div className="bin-card">
          <FileArchive size={42} strokeWidth={1.3} />
          <div className="bin-card-title">Sin vista previa para este tipo de archivo</div>
          <div className="bin-card-text">
            Los archivos binarios no se cargan como texto para no trabar la aplicación.
            {bridge.isElectron ? ' Usa «Abrir» para verlo con su aplicación.' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

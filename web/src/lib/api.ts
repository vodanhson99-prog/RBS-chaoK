import type { BoothConfig as SharedBoothConfig } from '../../../packages/contracts/booth'
import type { ApiError as SharedApiError } from '../../../packages/contracts/errors'
import type { EditRecord as SharedEditRecord, SaveEditResponse as SharedSaveEditResponse } from '../../../packages/contracts/session'
import type { FrameManifest as SharedFrameManifest, FrameSlot as SharedFrameSlot } from '../../../packages/contracts/template'
import type { PrintConfig as SharedPrintConfig, PrintJobPublic as SharedPrintJob } from '../../../packages/contracts/print'

export type ApiError = SharedApiError
export type BoothConfig = SharedBoothConfig
export type PhotoMeta = import('../../../packages/contracts/session').PhotoMeta

export type FrameSlot = SharedFrameSlot

export type FrameManifest = SharedFrameManifest & {
  src: string
}

export async function fetchBoothConfig(signal?: AbortSignal): Promise<BoothConfig> {
  const res = await fetch('/api/booth/config', { signal, cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load booth config')
  return res.json() as Promise<BoothConfig>
}

export async function fetchFrames(signal?: AbortSignal): Promise<FrameManifest[]> {
  const res = await fetch('/api/frames', { signal, cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load frame library')
  const data = (await res.json()) as { frames?: FrameManifest[] }
  return data.frames ?? []
}

export async function createFrame(
  asset: Blob,
  manifest: Omit<FrameManifest, 'src' | 'asset' | 'thumbnailSrc' | 'source' | 'deletable'>,
  signal?: AbortSignal,
): Promise<FrameManifest> {
  const res = await fetch('/api/internal/frames', {
    method: 'POST',
    headers: {
      'Content-Type': asset.type || 'application/octet-stream',
      'X-Frame-Manifest': JSON.stringify(manifest),
    },
    body: asset,
    signal,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Could not save frame (${res.status})`)
  }
  return res.json() as Promise<FrameManifest>
}

export async function deleteFrame(id: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`/api/internal/frames/${encodeURIComponent(id)}`, { method: 'DELETE', signal })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Could not delete frame (${res.status})`)
  }
}

export async function fetchLanHost(): Promise<string | null> {
  try {
    const res = await fetch('/api/lan')
    if (!res.ok) return null
    const data = (await res.json()) as { host?: string | null }
    return data.host || null
  } catch {
    return null
  }
}

/** Phone-reachable origin. localhost in a QR is useless on iPhone. */
export async function shareOrigin(): Promise<string> {
  const { protocol, hostname, port } = window.location
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1'
  if (!isLoopback) return window.location.origin
  const lan = await fetchLanHost()
  if (!lan) return window.location.origin
  const p = port ? `:${port}` : ''
  return `${protocol}//${lan}${p}`
}

export type UploadPhotoOptions = {
  frameId: string
  frameVersion: number
  captureMode: string
  idempotencyKey?: string
  signal?: AbortSignal
}

export async function uploadPhoto(blob: Blob, options: UploadPhotoOptions): Promise<PhotoMeta> {
  const res = await fetch('/api/photos', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'image/jpeg',
      'X-Frame-Id': options.frameId,
      'X-Template-Id': options.frameId,
      'X-Template-Version': String(options.frameVersion),
      'X-Capture-Mode': options.captureMode,
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: blob,
    signal: options.signal,
  })
  if (!res.ok) {
    const text = await res.text()
    const error = new Error(text || `Upload failed (${res.status})`) as Error & { status?: number; retryAfterSeconds?: number }
    error.status = res.status
    const retryAfter = Number(res.headers.get('Retry-After'))
    if (Number.isFinite(retryAfter)) error.retryAfterSeconds = retryAfter
    throw error
  }
  return res.json() as Promise<PhotoMeta>
}

export async function fetchPhoto(token: string, signal?: AbortSignal): Promise<PhotoMeta> {
  const res = await fetch(`/api/photos/${token}`, { signal })
  if (res.status === 404) throw new Error('Link expired or not found')
  if (!res.ok) throw new Error(`Failed to load photo (${res.status})`)
  return res.json() as Promise<PhotoMeta>
}

export function photoImageUrl(token: string, options?: { original?: boolean }): string {
  const base = `/api/photos/${token}/image`
  return options?.original ? `${base}?original=1` : base
}

export type EditRecord = SharedEditRecord

export type SaveEditResponse = SharedSaveEditResponse

export async function fetchLatestEdit(token: string, signal?: AbortSignal): Promise<EditRecord> {
  const res = await fetch(`/api/photos/${token}/edits/latest`, { signal })
  if (res.status === 404) throw new Error('No edit saved yet')
  if (!res.ok) throw new Error(`Failed to load edit (${res.status})`)
  return res.json() as Promise<EditRecord>
}

const MAX_EDIT_RENDER_BYTES = 4 * 1024 * 1024

export async function savePhotoEdit(
  token: string,
  recipe: EditRecord['recipe'],
  rendered: Blob,
): Promise<SaveEditResponse> {
  if (rendered.size > MAX_EDIT_RENDER_BYTES) {
    throw new Error(`Rendered edit is too large (maximum ${MAX_EDIT_RENDER_BYTES} bytes)`)
  }
  // Keep the JSON transport for compatibility; the size guard prevents
  // accidental unbounded base64 payloads while the editor remains unchanged.
  const renderedBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.replace(/^data:image\/\w+;base64,/, ''))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read rendered image'))
    reader.readAsDataURL(rendered)
  })

  const res = await fetch(`/api/photos/${token}/edits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe, renderedBase64 }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Save failed (${res.status})`)
  }
  return res.json() as Promise<SaveEditResponse>
}

export type PrintJob = SharedPrintJob

export type PrintConfig = SharedPrintConfig

export async function fetchPrintConfig(signal?: AbortSignal): Promise<PrintConfig> {
  const res = await fetch('/api/print/config', { signal, cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load print config')
  return res.json() as Promise<PrintConfig>
}

export async function createPrintJob(
  token: string,
  body: { quantity: number; size: '4x6' | '6x8' },
): Promise<PrintJob> {
  const res = await fetch(`/api/photos/${token}/print-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Could not create print job (${res.status})`)
  }
  return res.json() as Promise<PrintJob>
}

export async function fetchPrintJob(jobId: string, signal?: AbortSignal): Promise<PrintJob> {
  const res = await fetch(`/api/print-jobs/${jobId}`, { signal })
  if (!res.ok) throw new Error(`Could not load print job (${res.status})`)
  return res.json() as Promise<PrintJob>
}

export async function payPrintJobMock(jobId: string): Promise<PrintJob> {
  const res = await fetch(`/api/print-jobs/${jobId}/pay`, { method: 'POST' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Payment failed (${res.status})`)
  }
  return res.json() as Promise<PrintJob>
}

export function formatMoney(amountCents: number, currency: string): string {
  if (currency === 'VND') return `${amountCents.toLocaleString('vi-VN')} ₫`
  return `${(amountCents / 100).toFixed(2)} ${currency}`
}

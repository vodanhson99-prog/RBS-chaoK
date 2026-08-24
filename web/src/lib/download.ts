import { photoImageUrl } from './api'

export function photoDownloadFilename(token: string, hasEdit = false): string {
  const suffix = hasEdit ? '-edit' : ''
  return `rbs-${token}${suffix}.jpg`
}

export async function fetchPhotoBlob(token: string, options?: { original?: boolean }): Promise<Blob> {
  const res = await fetch(photoImageUrl(token, options))
  if (!res.ok) throw new Error(`Could not load image (${res.status})`)
  return res.blob()
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadPhotoFile(token: string, hasEdit = false): Promise<void> {
  const blob = await fetchPhotoBlob(token)
  triggerBlobDownload(blob, photoDownloadFilename(token, hasEdit))
}

export async function sharePhotoFile(token: string, hasEdit = false): Promise<'shared' | 'downloaded'> {
  const blob = await fetchPhotoBlob(token)
  const filename = photoDownloadFilename(token, hasEdit)
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'RBS Photobooth' })
    return 'shared'
  }

  triggerBlobDownload(blob, filename)
  return 'downloaded'
}

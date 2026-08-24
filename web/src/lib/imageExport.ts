/** Shared JPEG + canvas settings for capture, compose, and edit export. */

export const JPEG_EXPORT_QUALITY = 0.94
export const JPEG_PREVIEW_QUALITY = 0.88
export const JPEG_THUMB_QUALITY = 0.62

/** QHD 2K — 16:9 photobooth export size. */
export const EXPORT_2K = { width: 2560, height: 1440 } as const

const STRIP_NATIVE_H = 1024
/** Strip frame scaled so long edge matches 2K (2560px tall). */
export const EXPORT_2K_STRIP = {
  width: Math.round((672 / STRIP_NATIVE_H) * 2560),
  height: 2560,
} as const

export function configureCanvasQuality(
  ctx: CanvasRenderingContext2D,
  mode: 'photo' | 'crisp' = 'photo',
): void {
  ctx.imageSmoothingEnabled = mode === 'photo'
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = 'high'
  }
}

export function scaleCanvasToFit(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  mode: 'photo' | 'crisp' = 'photo',
): HTMLCanvasElement {
  if (source.width === width && source.height === height) return source
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')!
  configureCanvasQuality(ctx, mode)
  ctx.drawImage(source, 0, 0, width, height)
  return out
}

export function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality = JPEG_EXPORT_QUALITY,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality,
    )
  })
}

export function canvasToPreviewDataUrl(
  canvas: HTMLCanvasElement,
  quality = JPEG_PREVIEW_QUALITY,
): string {
  return canvas.toDataURL('image/jpeg', quality)
}

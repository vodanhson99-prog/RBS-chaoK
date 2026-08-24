import { coverDraw } from './geom'
import { configureCanvasQuality } from './imageExport'
import {
  applyOverlay,
  buildOverlayCanvas,
  detectGreySlots,
  isVectorSrc,
  loadImage,
  overlayFromGreySlots,
  overlayFromSlots,
  rasterizeImage,
  rasterizeImageAtSize,
  type Rect,
} from './overlay'
import type { Template } from './templates'

const cache = new Map<
  string,
  { art: HTMLCanvasElement; overlay: HTMLCanvasElement; slots: Rect[] }
>()
const pending = new Map<string, Promise<{ art: HTMLCanvasElement; overlay: HTMLCanvasElement; slots: Rect[] }>>()

function scaleSlots(slots: Rect[], fromW: number, fromH: number, toW: number, toH: number): Rect[] {
  if (fromW === toW && fromH === toH) return slots
  const sx = toW / fromW
  const sy = toH / fromH
  return slots.map((slot) => ({
    x: Math.round(slot.x * sx),
    y: Math.round(slot.y * sy),
    w: Math.round(slot.w * sx),
    h: Math.round(slot.h * sy),
  }))
}

export async function loadTemplateAssets(template: Template) {
  const cacheKey = `${template.id}@${template.version}@${template.output.width}x${template.output.height}@${template.src}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const inflight = pending.get(cacheKey)
  if (inflight) return inflight

  const loading = (async () => {
    const img = await loadImage(template.src)
    const targetW = template.output.width
    const targetH = template.output.height
    const vector = isVectorSrc(template.src)
    const nativeArt = vector ? null : rasterizeImage(img)
    const nativeW = nativeArt?.width ?? targetW
    const nativeH = nativeArt?.height ?? targetH
    const art = rasterizeImageAtSize(img, targetW, targetH, vector ? 'crisp' : 'photo')

    let overlay: HTMLCanvasElement
    let slots: Rect[] = []

    if (template.slots.length > 0) {
      const nativeSlots = template.slots
      const sourceW = vector ? targetW : nativeW
      const sourceH = vector ? targetH : nativeH
      slots = scaleSlots(nativeSlots, sourceW, sourceH, targetW, targetH)
      overlay = overlayFromSlots(art, slots)
    } else if (template.kind === 'strip6') {
      const slotSource = nativeArt ?? art
      const nativeSlots = detectGreySlots(slotSource, 6)
      slots = scaleSlots(nativeSlots, nativeW, nativeH, targetW, targetH)
      overlay = overlayFromGreySlots(art, slots)
    } else {
      overlay = buildOverlayCanvas(art, template.keepBottom ?? 0)
    }

    const packed = { art, overlay, slots }
    cache.set(cacheKey, packed)
    return packed
  })()
  pending.set(cacheKey, loading)
  try {
    return await loading
  } finally {
    pending.delete(cacheKey)
  }
}

export function composeSingle(
  source: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  output?: { width: number; height: number },
) {
  const outW = output?.width ?? overlay.width
  const outH = output?.height ?? overlay.height
  return applyOverlay(source, overlay, outW, outH)
}

export function composeStrip(
  shots: HTMLCanvasElement[],
  overlay: HTMLCanvasElement,
  slots: Rect[],
  output?: { width: number; height: number },
): HTMLCanvasElement {
  const outW = output?.width ?? overlay.width
  const outH = output?.height ?? overlay.height
  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')!
  configureCanvasQuality(ctx)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, outW, outH)

  slots.forEach((slot, i) => {
    const shot = shots[i]
    if (!shot) return
    coverDraw(ctx, shot, slot.x, slot.y, slot.w, slot.h, shot.width, shot.height)
  })
  ctx.drawImage(overlay, 0, 0, outW, outH)
  return out
}

export {
  canvasToJpegBlob,
  canvasToPreviewDataUrl,
  JPEG_EXPORT_QUALITY,
  JPEG_PREVIEW_QUALITY,
  JPEG_THUMB_QUALITY,
} from './imageExport'

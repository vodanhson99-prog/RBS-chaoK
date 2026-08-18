import { coverDraw, warpQuad, type Pt } from './geom'
import {
  applyOverlay,
  buildOverlayCanvas,
  detectGreySlots,
  loadImage,
  overlayFromGreySlots,
  rasterizeImage,
  type Rect,
} from './overlay'
import type { Template } from './templates'

const cache = new Map<
  string,
  { art: HTMLCanvasElement; overlay: HTMLCanvasElement; slots: Rect[] }
>()

export async function loadTemplateAssets(template: Template) {
  const hit = cache.get(template.id)
  if (hit) return hit

  const img = await loadImage(template.src)
  const art = rasterizeImage(img)
  let overlay: HTMLCanvasElement
  let slots: Rect[] = []

  if (template.kind === 'strip6') {
    slots = detectGreySlots(art, 6)
    overlay = overlayFromGreySlots(art, slots)
  } else {
    overlay = buildOverlayCanvas(art, template.keepBottom ?? 0)
  }

  const packed = { art, overlay, slots }
  cache.set(template.id, packed)
  return packed
}

export function composeSingle(source: HTMLCanvasElement, quad: Pt[], overlay: HTMLCanvasElement) {
  const warped = warpQuad(source, quad)
  return applyOverlay(warped, overlay)
}

export function composeStrip(
  shots: HTMLCanvasElement[],
  overlay: HTMLCanvasElement,
  slots: Rect[],
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = overlay.width
  out.height = overlay.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, out.width, out.height)

  slots.forEach((slot, i) => {
    const shot = shots[i]
    if (!shot) return
    coverDraw(ctx, shot, slot.x, slot.y, slot.w, slot.h, shot.width, shot.height)
  })
  ctx.drawImage(overlay, 0, 0)
  return out
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality,
    )
  })
}

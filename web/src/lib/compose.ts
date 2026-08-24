import { coverDraw, MIN_OUTPUT_LONG_EDGE, warpQuad, type Pt } from './geom'
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

function resolvePhotoArea(template: Template, art: HTMLCanvasElement): Rect | undefined {
  if (!template.photoArea) return undefined
  return {
    x: Math.round(template.photoArea.x * art.width),
    y: Math.round(template.photoArea.y * art.height),
    w: Math.round(template.photoArea.w * art.width),
    h: Math.round(template.photoArea.h * art.height),
  }
}

function resolveTemplateSlots(template: Template, art: HTMLCanvasElement): Rect[] {
  if (!template.photoSlots) return detectGreySlots(art, 6)
  return template.photoSlots.map((slot) => ({
    x: Math.round(slot.x * art.width),
    y: Math.round(slot.y * art.height),
    w: Math.round(slot.w * art.width),
    h: Math.round(slot.h * art.height),
    radius: slot.radius ? slot.radius * art.width : undefined,
  }))
}

const cache = new Map<
  string,
  { art: HTMLCanvasElement; overlay: HTMLCanvasElement; slots: Rect[] }
>()

export async function loadTemplateAssets(template: Template) {
  const hit = cache.get(template.id)
  if (hit) return hit

  const img = await loadImage(template.src)
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = Math.max(1, MIN_OUTPUT_LONG_EDGE / longEdge)
  const art = rasterizeImage(img, scale)
  let overlay: HTMLCanvasElement
  let slots: Rect[] = []

  if (template.kind === 'strip') {
    slots = resolveTemplateSlots(template, art)
    overlay = overlayFromGreySlots(art, slots, template.photoSlotMode)
  } else {
    overlay = buildOverlayCanvas(
      art,
      template.keepBottom ?? 0,
      resolvePhotoArea(template, art),
      template.photoAreaMode,
    )
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
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, out.width, out.height)

  slots.forEach((slot, i) => {
    const shot = shots[i]
    if (!shot) return
    coverDraw(ctx, shot, slot.x, slot.y, slot.w, slot.h, shot.width, shot.height, slot.radius)
  })
  ctx.drawImage(overlay, 0, 0)
  return out
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.96): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality,
    )
  })
}

import { filterCss, type PhotoFilterId } from './filters'
import {
  canvasToJpegBlob,
  configureCanvasQuality,
  JPEG_EXPORT_QUALITY,
} from '../imageExport'
import { isVectorSrc, rasterizeImageAtSize } from '../overlay'
import { MOCK_STICKERS, stickerById } from './mockStickers'
import type { EditRecipe, StickerPlacement } from './types'

const imageCache = new Map<string, HTMLImageElement>()

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached?.complete) return Promise.resolve(cached)

  return new Promise((resolve, reject) => {
    const img = cached ?? new Image()
    if (!cached) imageCache.set(src, img)
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load sticker: ${src}`))
    img.src = src
  })
}

export async function loadPhotoImage(src: string): Promise<HTMLImageElement> {
  return loadImage(src)
}

export async function renderEditedPhoto(
  photoSrc: string,
  recipe: EditRecipe,
  quality = JPEG_EXPORT_QUALITY,
): Promise<{ blob: Blob; width: number; height: number }> {
  const photo = await loadPhotoImage(photoSrc)
  const canvas = document.createElement('canvas')
  canvas.width = photo.naturalWidth
  canvas.height = photo.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  configureCanvasQuality(ctx)
  const filterId: PhotoFilterId = recipe.filter ?? 'none'
  ctx.filter = filterCss(filterId)
  ctx.drawImage(photo, 0, 0)
  ctx.filter = 'none'

  const sorted = [...recipe.stickers].sort((a, b) => a.zIndex - b.zIndex)
  const shortEdge = Math.min(canvas.width, canvas.height)

  for (const placement of sorted) {
    const def = stickerById(placement.stickerId)
    if (!def) continue
    const sticker = await loadImage(def.src)
    const size = def.baseSize * shortEdge * placement.scale
    const cx = placement.x * canvas.width
    const cy = placement.y * canvas.height
    const stickerRaster = rasterizeImageAtSize(
      sticker,
      Math.ceil(size),
      Math.ceil(size),
      isVectorSrc(def.src) ? 'crisp' : 'photo',
    )

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((placement.rotation * Math.PI) / 180)
    ctx.drawImage(stickerRaster, -size / 2, -size / 2, size, size)
    ctx.restore()
  }

  const blob = await canvasToJpegBlob(canvas, quality)

  return { blob, width: canvas.width, height: canvas.height }
}

export function cloneRecipe(recipe: EditRecipe): EditRecipe {
  return {
    filter: recipe.filter ?? 'none',
    stickers: recipe.stickers.map((s) => ({ ...s })),
  }
}

export function clonePlacements(list: StickerPlacement[]): StickerPlacement[] {
  return list.map((s) => ({ ...s }))
}

export function buildRecipe(stickers: StickerPlacement[], filter: PhotoFilterId = 'none'): EditRecipe {
  return { stickers: stickers.map((s) => ({ ...s })), filter }
}

export function recipeFromPlacements(stickers: StickerPlacement[], filter: PhotoFilterId = 'none'): EditRecipe {
  return buildRecipe(stickers, filter)
}

export function emptyRecipe(): EditRecipe {
  return { stickers: [], filter: 'none' }
}

/** Warm sticker assets so first save feels instant. */
export function preloadStickerAssets(): void {
  for (const sticker of MOCK_STICKERS) {
    void loadImage(sticker.src).catch(() => {})
  }
}

export type Rect = { x: number; y: number; w: number; h: number }

const BLACK_KEY = 16

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function connectedComponents(
  mask: Uint8Array,
  w: number,
  h: number,
): { labels: Int32Array; count: number; areas: number[] } {
  const labels = new Int32Array(w * h)
  const areas = [0]
  let current = 0
  const stack: number[] = []

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (!mask[i] || labels[i]) return
    labels[i] = current
    stack.push(i)
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i] || labels[i]) continue
      current += 1
      areas[current] = 0
      labels[i] = current
      stack.length = 0
      stack.push(i)
      while (stack.length) {
        const idx = stack.pop()!
        areas[current] += 1
        const cx = idx % w
        const cy = (idx / w) | 0
        push(cx + 1, cy)
        push(cx - 1, cy)
        push(cx, cy + 1)
        push(cx, cy - 1)
        push(cx + 1, cy + 1)
        push(cx - 1, cy + 1)
        push(cx + 1, cy - 1)
        push(cx - 1, cy - 1)
      }
    }
  }
  return { labels, count: current, areas }
}

function bboxForLabel(
  labels: Int32Array,
  label: number,
  w: number,
  h: number,
): Rect {
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (labels[y * w + x] !== label) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  await img.decode()
  return img
}

export function rasterizeImage(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  c.getContext('2d')!.drawImage(img, 0, 0)
  return c
}

/** Rasterize directly at export size — critical for SVG (avoids tiny default decode). */
export function rasterizeImageAtSize(
  img: HTMLImageElement,
  width: number,
  height: number,
  mode: 'photo' | 'crisp' = 'photo',
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = mode === 'photo'
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  return c
}

export function isVectorSrc(src: string): boolean {
  return src.endsWith('.svg')
}

/** Overlay canvas with premultiplied-style alpha: 0 = photo shows through. */
export function buildOverlayCanvas(
  art: HTMLCanvasElement,
  keepBottom = 0,
): HTMLCanvasElement {
  const { width: w, height: h } = art
  const ctx = art.getContext('2d', { willReadFrequently: true })!
  const src = ctx.getImageData(0, 0, w, h)
  const data = src.data

  let hasAlpha = false
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      hasAlpha = true
      break
    }
  }

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  const dest = octx.createImageData(w, h)
  dest.data.set(data)

  if (!hasAlpha) {
    const mask = new Uint8Array(w * h)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const mx = Math.max(data[i], data[i + 1], data[i + 2])
      mask[p] = mx <= BLACK_KEY ? 1 : 0
    }
    const { labels, count, areas } = connectedComponents(mask, w, h)
    let best = 0
    let bestArea = 0
    for (let lab = 1; lab <= count; lab++) {
      if (areas[lab] > bestArea) {
        bestArea = areas[lab]
        best = lab
      }
    }
    for (let p = 0; p < labels.length; p++) {
      dest.data[p * 4 + 3] = labels[p] === best ? 0 : 255
    }
    if (keepBottom > 0) {
      const bandTop = Math.round(h * (1 - keepBottom))
      for (let y = bandTop; y < h; y++) {
        for (let x = 0; x < w; x++) dest.data[(y * w + x) * 4 + 3] = 255
      }
    }
  }

  octx.putImageData(dest, 0, 0)
  return out
}

export function detectGreySlots(art: HTMLCanvasElement, want = 6): Rect[] {
  const { width: w, height: h } = art
  const ctx = art.getContext('2d', { willReadFrequently: true })!
  const { data } = ctx.getImageData(0, 0, w, h)
  const mask = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    const lum = luminance(r, g, b)
    mask[p] = spread < 28 && lum >= 145 && lum <= 235 ? 1 : 0
  }

  const { labels, count, areas } = connectedComponents(mask, w, h)
  const minArea = w * h * 0.015
  const candidates: { lab: number; area: number; rect: Rect }[] = []
  for (let lab = 1; lab <= count; lab++) {
    if (areas[lab] < minArea) continue
    const rect = bboxForLabel(labels, lab, w, h)
    const fill = areas[lab] / (rect.w * rect.h)
    const aspect = rect.w / rect.h
    if (fill < 0.7 || aspect < 0.9 || aspect > 2.4) continue
    candidates.push({ lab, area: areas[lab], rect })
  }

  candidates.sort((a, b) => b.area - a.area)
  const slots = candidates.slice(0, want).map((c) => c.rect)
  slots.sort((a, b) => {
    const row = a.y - b.y
    if (Math.abs(row) > Math.min(a.h, b.h) * 0.4) return row
    return a.x - b.x
  })
  if (slots.length === want) return slots
  return fallbackGrid(art.width, art.height, want)
}

function fallbackGrid(w: number, h: number, want: number): Rect[] {
  const cols = 2
  const rows = Math.ceil(want / cols)
  const padX = w * 0.08
  const padY = h * 0.1
  const gapX = w * 0.04
  const gapY = h * 0.03
  const slotW = (w - padX * 2 - gapX) / cols
  const slotH = (h - padY * 2 - gapY * (rows - 1)) / rows
  const out: Rect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (out.length >= want) break
      out.push({
        x: Math.round(padX + c * (slotW + gapX)),
        y: Math.round(padY + r * (slotH + gapY)),
        w: Math.round(slotW),
        h: Math.round(slotH),
      })
    }
  }
  return out
}

export function overlayFromSlots(art: HTMLCanvasElement, slots: Rect[]): HTMLCanvasElement {
  const { width: w, height: h } = art
  const ctx = art.getContext('2d', { willReadFrequently: true })!
  const src = ctx.getImageData(0, 0, w, h)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  const dest = octx.createImageData(w, h)
  dest.data.set(src.data)
  for (const slot of slots) {
    const left = Math.max(0, Math.floor(slot.x))
    const top = Math.max(0, Math.floor(slot.y))
    const right = Math.min(w, Math.ceil(slot.x + slot.w))
    const bottom = Math.min(h, Math.ceil(slot.y + slot.h))
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) dest.data[(y * w + x) * 4 + 3] = 0
    }
  }
  octx.putImageData(dest, 0, 0)
  return out
}

export function overlayFromGreySlots(art: HTMLCanvasElement, slots: Rect[]): HTMLCanvasElement {
  const { width: w, height: h } = art
  const ctx = art.getContext('2d', { willReadFrequently: true })!
  const src = ctx.getImageData(0, 0, w, h)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  const dest = octx.createImageData(w, h)
  dest.data.set(src.data)

  const mask = new Uint8Array(w * h)
  const { data } = src
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    const lum = luminance(r, g, b)
    mask[p] = spread < 28 && lum >= 145 && lum <= 235 ? 1 : 0
  }

  for (const slot of slots) {
    for (let y = slot.y; y < slot.y + slot.h; y++) {
      for (let x = slot.x; x < slot.x + slot.w; x++) {
        const p = y * w + x
        if (mask[p]) dest.data[p * 4 + 3] = 0
      }
    }
  }
  octx.putImageData(dest, 0, 0)
  return out
}

export function applyOverlay(
  photo: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  outW = overlay.width,
  outH = overlay.height,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(photo, 0, 0, outW, outH)
  ctx.drawImage(overlay, 0, 0, outW, outH)
  return out
}

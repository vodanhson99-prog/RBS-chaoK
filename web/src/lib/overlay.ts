export type Rect = { x: number; y: number; w: number; h: number; radius?: number }

const BLACK_KEY = 16

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Grey or near-black photo windows on a strip template. */
function isSlotPixel(r: number, g: number, b: number): boolean {
  const spread = Math.max(r, g, b) - Math.min(r, g, b)
  if (spread >= 32) return false
  const lum = luminance(r, g, b)
  return lum <= 42 || (lum >= 145 && lum <= 235)
}

const SLOT_COLOR_TOLERANCE = 30

function medianFromHistogram(histogram: Uint32Array, total: number): number {
  const target = Math.ceil(total / 2)
  let seen = 0
  for (let value = 0; value < histogram.length; value++) {
    seen += histogram[value]
    if (seen >= target) return value
  }
  return 0
}

function estimateSlotColor(
  data: Uint8ClampedArray,
  w: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): [number, number, number] {
  const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  const insetX = Math.floor((right - left) * 0.2)
  const insetY = Math.floor((bottom - top) * 0.2)
  const sampleLeft = left + insetX
  const sampleTop = top + insetY
  const sampleRight = Math.max(sampleLeft + 1, right - insetX)
  const sampleBottom = Math.max(sampleTop + 1, bottom - insetY)
  let total = 0

  for (let y = sampleTop; y < sampleBottom; y += 2) {
    for (let x = sampleLeft; x < sampleRight; x += 2) {
      const i = (y * w + x) * 4
      histograms[0][data[i]] += 1
      histograms[1][data[i + 1]] += 1
      histograms[2][data[i + 2]] += 1
      total += 1
    }
  }

  return [
    medianFromHistogram(histograms[0], total),
    medianFromHistogram(histograms[1], total),
    medianFromHistogram(histograms[2], total),
  ]
}

function insideRoundedSlot(
  slot: Rect,
  x: number,
  y: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  if (!slot.radius) return true
  const radius = Math.min(slot.radius, (right - left) / 2, (bottom - top) / 2)
  const dx = Math.min(x - left, right - 1 - x)
  const dy = Math.min(y - top, bottom - 1 - y)
  if (dx >= radius || dy >= radius) return true
  const cornerX = radius - dx
  const cornerY = radius - dy
  return cornerX * cornerX + cornerY * cornerY <= radius * radius
}

function markSlotBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  slot: Rect,
  mask: Uint8Array,
): void {
  const left = Math.max(0, Math.floor(slot.x))
  const top = Math.max(0, Math.floor(slot.y))
  const right = Math.min(w, Math.ceil(slot.x + slot.w))
  const bottom = Math.min(h, Math.ceil(slot.y + slot.h))
  if (right <= left || bottom <= top) return

  const localW = right - left
  const localH = bottom - top
  const candidates = new Uint8Array(localW * localH)
  const visited = new Uint8Array(localW * localH)
  const key = estimateSlotColor(data, w, left, top, right, bottom)
  const toleranceSquared = SLOT_COLOR_TOLERANCE * SLOT_COLOR_TOLERANCE

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      if (!insideRoundedSlot(slot, x, y, left, top, right, bottom)) continue
      const i = (y * w + x) * 4
      const dr = data[i] - key[0]
      const dg = data[i + 1] - key[1]
      const db = data[i + 2] - key[2]
      if (dr * dr + dg * dg + db * db <= toleranceSquared) {
        candidates[(y - top) * localW + (x - left)] = 1
      }
    }
  }

  let largest: number[] = []
  for (let y = 0; y < localH; y++) {
    for (let x = 0; x < localW; x++) {
      const start = y * localW + x
      if (!candidates[start] || visited[start]) continue
      visited[start] = 1
      const component: number[] = [start]
      const queue = [start]
      while (queue.length) {
        const local = queue.pop()!
        const cx = local % localW
        const cy = Math.floor(local / localW)
        const neighbors = [local - 1, local + 1, local - localW, local + localW]
        for (const next of neighbors) {
          const nx = next % localW
          const ny = Math.floor(next / localW)
          if (nx < 0 || nx >= localW || ny < 0 || ny >= localH || !candidates[next] || visited[next]) continue
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue
          visited[next] = 1
          component.push(next)
          queue.push(next)
        }
      }
      if (component.length > largest.length) largest = component
    }
  }

  for (const local of largest) {
    const x = left + (local % localW)
    const y = top + Math.floor(local / localW)
    mask[y * w + x] = 1
  }
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

export function rasterizeImage(img: HTMLImageElement, scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.naturalWidth * scale))
  c.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c
}

/** Overlay canvas with premultiplied-style alpha: 0 = photo shows through. */
export function buildOverlayCanvas(
  art: HTMLCanvasElement,
  keepBottom = 0,
  photoArea?: Rect,
  photoAreaMode: 'dark' | 'light' = 'dark',
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
    if (photoArea) {
      const left = Math.max(0, photoArea.x)
      const top = Math.max(0, photoArea.y)
      const right = Math.min(w, photoArea.x + photoArea.w)
      const bottom = Math.min(h, photoArea.y + photoArea.h)
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const p = y * w + x
          const i = p * 4
          const lum = luminance(data[i], data[i + 1], data[i + 2])
          mask[p] = photoAreaMode === 'light' ? (lum >= 210 ? 1 : 0) : (Math.max(data[i], data[i + 1], data[i + 2]) <= BLACK_KEY ? 1 : 0)
        }
      }
    } else {
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const mx = Math.max(data[i], data[i + 1], data[i + 2])
        mask[p] = mx <= BLACK_KEY ? 1 : 0
      }
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
      dest.data[p * 4 + 3] = labels[p] === best && best !== 0 ? 0 : 255
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
    mask[p] = isSlotPixel(data[i], data[i + 1], data[i + 2]) ? 1 : 0
  }

  const { labels, count, areas } = connectedComponents(mask, w, h)
  const minArea = w * h * 0.008
  const candidates: { lab: number; area: number; rect: Rect }[] = []
  for (let lab = 1; lab <= count; lab++) {
    if (areas[lab] < minArea) continue
    const rect = bboxForLabel(labels, lab, w, h)
    const fill = areas[lab] / (rect.w * rect.h)
    const aspect = rect.w / rect.h
    if (fill < 0.62 || aspect < 0.72 || aspect > 2.6) continue
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

export function overlayFromGreySlots(art: HTMLCanvasElement, slots: Rect[], mode: 'dark' | 'cutout' = 'dark'): HTMLCanvasElement {
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
  if (mode === 'cutout') {
    for (const slot of slots) markSlotBackground(data, w, h, slot, mask)
  } else {
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      mask[p] = isSlotPixel(data[i], data[i + 1], data[i + 2]) ? 1 : 0
    }
  }

  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) dest.data[p * 4 + 3] = 0
  }
  octx.putImageData(dest, 0, 0)
  return out
}

export function applyOverlay(
  photo: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = overlay.width
  out.height = overlay.height
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(photo, 0, 0, out.width, out.height)
  ctx.drawImage(overlay, 0, 0)
  return out
}

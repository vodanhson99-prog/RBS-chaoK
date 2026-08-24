export type Pt = { x: number; y: number }

export const OUTPUT_W = 1920
export const OUTPUT_H = 1080
export const MIN_AREA_RATIO = 0.03
export const MAX_AREA_RATIO = 0.9
export const MIN_SIDE_PX = 50

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function orderQuad(points: Pt[]): Pt[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  const ordered = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  )
  const sums = ordered.map((p) => p.x + p.y)
  const start = sums.indexOf(Math.min(...sums))
  const rot = [...ordered.slice(start), ...ordered.slice(0, start)]
  const v1x = rot[1].x - rot[0].x
  const v1y = rot[1].y - rot[0].y
  const v2x = rot[2].x - rot[1].x
  const v2y = rot[2].y - rot[1].y
  if (v1x * v2y - v1y * v2x < 0) return [rot[0], rot[3], rot[2], rot[1]]
  return rot
}

export function polygonArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a) / 2
}

export function quadIsValid(quad: Pt[], w: number, h: number): boolean {
  const area = polygonArea(quad)
  const frameArea = w * h
  if (area < MIN_AREA_RATIO * frameArea || area > MAX_AREA_RATIO * frameArea) return false
  for (let i = 0; i < 4; i++) {
    if (dist(quad[i], quad[(i + 1) % 4]) < MIN_SIDE_PX) return false
  }
  return true
}

function solveHomography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x: xs, y: ys } = src[i]
    const { x: xd, y: yd } = dst[i]
    A.push([xs, ys, 1, 0, 0, 0, -xd * xs, -xd * ys])
    b.push(xd)
    A.push([0, 0, 0, xs, ys, 1, -yd * xs, -yd * ys])
    b.push(yd)
  }
  const h = gaussianSolve(A, b)
  h.push(1)
  return h
}

function gaussianSolve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    const div = M[col][col] || 1e-12
    for (let c = col; c <= n; c++) M[col][c] /= div
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row) => row[n])
}

function applyH(h: number[], x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + h[8]
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  }
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1
  if (x0 < 0 || y0 < 0 || x1 >= w || y1 >= h) {
    const cx = Math.max(0, Math.min(w - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(h - 1, Math.round(y)))
    const i = (cy * w + cx) * 4
    return [data[i], data[i + 1], data[i + 2], data[i + 3]]
  }
  const fx = x - x0
  const fy = y - y0
  const i00 = (y0 * w + x0) * 4
  const i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4
  const i11 = (y1 * w + x1) * 4
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const v =
      data[i00 + c] * (1 - fx) * (1 - fy) +
      data[i10 + c] * fx * (1 - fy) +
      data[i01 + c] * (1 - fx) * fy +
      data[i11 + c] * fx * fy
    out[c] = v
  }
  return out
}

export function warpQuad(
  source: HTMLCanvasElement,
  quad: Pt[],
  outW = OUTPUT_W,
  outH = OUTPUT_H,
): HTMLCanvasElement {
  const ordered = orderQuad(quad)
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ]
  const h = solveHomography(dst, ordered)
  const ctx = source.getContext('2d', { willReadFrequently: true })!
  const srcData = ctx.getImageData(0, 0, source.width, source.height)
  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const octx = out.getContext('2d')!
  const dest = octx.createImageData(outW, outH)
  const sw = source.width
  const sh = source.height
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const p = applyH(h, x, y)
      const [r, g, b, a] = sampleBilinear(srcData.data, sw, sh, p.x, p.y)
      const i = (y * outW + x) * 4
      dest.data[i] = r
      dest.data[i + 1] = g
      dest.data[i + 2] = b
      dest.data[i + 3] = a
    }
  }
  octx.putImageData(dest, 0, 0)
  return out
}

function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.min(Math.max(radius, 0), w / 2, h / 2)
  if (r === 0) {
    ctx.rect(x, y, w, h)
    return
  }

  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

export function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  srcW: number,
  srcH: number,
  radius = 0,
): void {
  const scale = Math.max(dw / srcW, dh / srcH)
  const w = srcW * scale
  const h = srcH * scale
  const x = dx + (dw - w) / 2
  const y = dy + (dh - h) / 2
  ctx.save()
  ctx.beginPath()
  clipRoundedRect(ctx, dx, dy, dw, dh, radius)
  ctx.clip()
  ctx.drawImage(img, x, y, w, h)
  ctx.restore()
}

export function cropTo169(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = OUTPUT_W
  out.height = OUTPUT_H
  const ctx = out.getContext('2d')!
  coverDraw(ctx, source, 0, 0, OUTPUT_W, OUTPUT_H, source.width, source.height)
  return out
}

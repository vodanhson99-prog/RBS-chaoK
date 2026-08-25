const SPARK = '#ff6117'
const INK = '#f7f8f5'
const CHARCOAL = '#252525'

function drawPixelBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  progress: number,
): void {
  const blocks = Math.max(1, Math.floor(w / 8))
  const filled = Math.floor(blocks * progress)
  for (let i = 0; i < blocks; i++) {
    ctx.fillStyle = i < filled ? SPARK : 'rgba(58, 58, 58, 0.85)'
    ctx.fillRect(x + i * 8, y, 6, h)
  }
}

function drawPixelCountdown(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  digit: number,
  remainingMs: number,
): void {
  const fontSize = Math.round(Math.min(w, h) * 0.11)
  const cx = w / 2
  const cy = h * 0.46

  ctx.font = `${fontSize}px "Press Start 2P", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const text = String(digit)
  const textW = ctx.measureText(text).width
  const padX = Math.round(fontSize * 0.45)
  const padY = Math.round(fontSize * 0.28)
  const boxW = Math.ceil(textW + padX * 2)
  const boxH = Math.ceil(fontSize + padY * 2)
  const left = Math.round(cx - boxW / 2)
  const top = Math.round(cy - boxH / 2)

  ctx.fillStyle = '#000'
  ctx.fillRect(left + 4, top + 4, boxW, boxH)

  ctx.fillStyle = CHARCOAL
  ctx.fillRect(left, top, boxW, boxH)

  const blink = Math.floor(remainingMs / 220) % 2 === 0
  ctx.strokeStyle = blink ? SPARK : INK
  ctx.lineWidth = 4
  ctx.strokeRect(left, top, boxW, boxH)

  ctx.strokeStyle = '#3a3a3a'
  ctx.lineWidth = 2
  ctx.strokeRect(left + 3, top + 3, boxW - 6, boxH - 6)

  ctx.fillStyle = SPARK
  ctx.fillText(text, cx, cy)

  const barY = top + boxH + 10
  const secondFrac = (remainingMs % 1000) / 1000
  drawPixelBar(ctx, left, barY, boxW, 8, secondFrac)

  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
}

export function drawBoothOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options: {
    holdProgress: number
    countdown: number | null
    countdownRemainingMs: number | null
    flash: number
    isLetterS: boolean
    showHoldBar: boolean
  },
): void {
  const { holdProgress, countdown, countdownRemainingMs, flash, isLetterS, showHoldBar } = options

  ctx.imageSmoothingEnabled = false

  if (countdown !== null && countdown > 0 && countdownRemainingMs !== null) {
    drawPixelCountdown(ctx, w, h, countdown, countdownRemainingMs)
  }

  if (showHoldBar && isLetterS && holdProgress > 0 && holdProgress < 1) {
    const barW = Math.min(220, w * 0.5)
    const barX = (w - barW) / 2
    const barY = h * 0.82
    const labelSize = Math.max(10, Math.round(w * 0.018))

    ctx.font = `${labelSize}px "Press Start 2P", monospace`
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('HOLD S', w / 2, barY - 8)
    drawPixelBar(ctx, barX, barY, barW, 12, holdProgress)
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`
    ctx.fillRect(0, 0, w, h)
  }
}

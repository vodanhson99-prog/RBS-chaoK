import type { TrackedHand } from './hands'
import type { SEval } from './sPose'

export function drawBoothOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hands: TrackedHand[],
  pose: SEval,
  dwell: number,
  countdown: number | null,
  flash: number,
): void {
  drawGuideS(ctx, w, h, pose.match || dwell > 0)

  for (const hand of hands) {
    ctx.fillStyle = pose.match ? '#3ddc84' : '#ff4d8d'
    ctx.beginPath()
    ctx.arc(hand.wrist.x, hand.wrist.y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(hand.wrist.x, hand.wrist.y)
    ctx.lineTo(hand.tipCentroid.x, hand.tipCentroid.y)
    ctx.stroke()
    for (const t of hand.tips) {
      ctx.fillStyle = '#ffe14d'
      ctx.beginPath()
      ctx.arc(t.x, t.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (pose.upper && pose.lower) {
    ctx.strokeStyle = pose.match ? '#3ddc84' : 'rgba(255,255,255,0.55)'
    ctx.lineWidth = pose.match ? 5 : 3
    ctx.beginPath()
    ctx.moveTo(pose.upper.tipCentroid.x, pose.upper.tipCentroid.y)
    ctx.bezierCurveTo(
      pose.upper.wrist.x - w * 0.12,
      pose.upper.wrist.y,
      pose.lower.wrist.x + w * 0.12,
      pose.lower.wrist.y,
      pose.lower.tipCentroid.x,
      pose.lower.tipCentroid.y,
    )
    ctx.stroke()
  }

  if (dwell > 0 && dwell < 1 && pose.upper && pose.lower) {
    const x = (pose.upper.wrist.x + pose.lower.wrist.x) / 2
    const y = (pose.upper.wrist.y + pose.lower.wrist.y) / 2
    ctx.strokeStyle = '#ffe14d'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(x, y, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dwell)
    ctx.stroke()
  }

  if (countdown && countdown > 0) {
    ctx.font = '800 160px "Press Start 2P", monospace'
    const t = String(countdown)
    const m = ctx.measureText(t)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 14
    ctx.strokeText(t, (w - m.width) / 2, h / 2 + 50)
    ctx.fillStyle = '#fff56a'
    ctx.fillText(t, (w - m.width) / 2, h / 2 + 50)
  }

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`
    ctx.fillRect(0, 0, w, h)
  }
}

function drawGuideS(ctx: CanvasRenderingContext2D, w: number, h: number, hot: boolean) {
  const cx = w * 0.18
  const cy = h * 0.5
  const r = Math.min(w, h) * 0.09
  ctx.save()
  ctx.strokeStyle = hot ? 'rgba(61,220,132,0.7)' : 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy - r * 0.55, r, Math.PI * 0.15, Math.PI * 1.15, true)
  ctx.arc(cx, cy + r * 0.55, r, -Math.PI * 0.85, Math.PI * 0.15, false)
  ctx.stroke()
  ctx.restore()
}

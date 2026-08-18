import type { Pt } from './geom'
import { QuadDrawer } from './quadDrawer'

export function drawBoothOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  drawer: QuadDrawer,
  tip: Pt | null,
  status: string,
  frameName: string,
  countdown: number | null,
  flash: number,
  shotLabel: string,
): void {
  if (drawer.trail.length >= 2) {
    ctx.strokeStyle = 'rgba(220,220,220,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(drawer.trail[0].x, drawer.trail[0].y)
    for (const p of drawer.trail) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  drawer.corners.forEach((c, i) => {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(c.x, c.y, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#50dc78'
    ctx.beginPath()
    ctx.arc(c.x, c.y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '700 22px sans-serif'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#000'
    ctx.fillStyle = '#fff'
    ctx.strokeText(String(i + 1), c.x + 12, c.y - 8)
    ctx.fillText(String(i + 1), c.x + 12, c.y - 8)
  })

  if (drawer.corners.length >= 2) {
    const pts = drawer.readyQuad ?? drawer.corners
    ctx.strokeStyle = countdown ? '#28b4ff' : '#50dc78'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    if (drawer.readyQuad) ctx.closePath()
    ctx.stroke()
    if (tip && !drawer.readyQuad) {
      const last = drawer.corners[drawer.corners.length - 1]
      ctx.strokeStyle = 'rgba(160,160,160,0.8)'
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(tip.x, tip.y)
      ctx.stroke()
    }
    if (drawer.readyQuad) {
      ctx.fillStyle = countdown ? 'rgba(40,180,255,0.12)' : 'rgba(80,220,120,0.12)'
      ctx.beginPath()
      ctx.moveTo(drawer.readyQuad[0].x, drawer.readyQuad[0].y)
      for (let i = 1; i < 4; i++) ctx.lineTo(drawer.readyQuad[i].x, drawer.readyQuad[i].y)
      ctx.closePath()
      ctx.fill()
    }
  }

  if (tip) {
    ctx.fillStyle = '#00c8ff'
    ctx.beginPath()
    ctx.arc(tip.x, tip.y, 8, 0, Math.PI * 2)
    ctx.fill()
    const progress = drawer.dwellProgress(performance.now() / 1000)
    if (progress > 0 && !drawer.readyQuad) {
      ctx.strokeStyle = '#00ffb4'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(tip.x, tip.y, 18 + 10 * progress, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
      ctx.stroke()
    }
  }

  ctx.fillStyle = 'rgba(12,12,14,0.55)'
  ctx.fillRect(0, 0, w, 88)
  ctx.fillRect(0, h - 52, w, 52)

  ctx.fillStyle = '#fff'
  ctx.font = '700 28px "Bebas Neue", sans-serif'
  ctx.fillText('INDEX FRAME CAPTURE', 16, 36)
  ctx.fillStyle = '#c8c8c8'
  ctx.font = '13px "IBM Plex Sans", sans-serif'
  ctx.fillText('Hold index tip to pin 4 corners  ·  M frame  ·  R reset  ·  Space snap', 16, 64)

  ctx.fillStyle = '#c8dcff'
  ctx.font = '14px "IBM Plex Sans", sans-serif'
  const ft = `Frame: ${frameName}`
  const tw = ctx.measureText(ft).width
  ctx.fillText(ft, w - tw - 16, 36)
  ctx.fillText(shotLabel, w - ctx.measureText(shotLabel).width - 16, 58)

  ctx.fillStyle = '#f0f0f0'
  ctx.font = '16px "IBM Plex Sans", sans-serif'
  ctx.fillText(status, 16, h - 18)

  if (countdown && countdown > 0) {
    ctx.font = '800 160px "Bebas Neue", sans-serif'
    const t = String(countdown)
    const m = ctx.measureText(t)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 12
    ctx.strokeText(t, (w - m.width) / 2, h / 2 + 50)
    ctx.fillStyle = '#fff'
    ctx.fillText(t, (w - m.width) / 2, h / 2 + 50)
  }

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`
    ctx.fillRect(0, 0, w, h)
  }
}

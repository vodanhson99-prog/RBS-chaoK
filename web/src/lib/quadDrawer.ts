import { dist, orderQuad, quadIsValid, type Pt } from './geom'

export const DWELL_SECONDS = 0.55
export const MOVE_TOLERANCE_PX = 28
export const MIN_CORNER_GAP_PX = 55
export const COUNTDOWN_SECONDS = 7

export class QuadDrawer {
  corners: Pt[] = []
  trail: Pt[] = []
  readyQuad: Pt[] | null = null
  invalidMessage: string | null = null
  private dwellAnchor: Pt | null = null
  private dwellStart: number | null = null

  reset(): void {
    this.corners = []
    this.trail = []
    this.dwellAnchor = null
    this.dwellStart = null
    this.readyQuad = null
    this.invalidMessage = null
  }

  dwellProgress(now: number): number {
    if (this.dwellStart === null || this.readyQuad) return 0
    return Math.min(1, (now - this.dwellStart) / DWELL_SECONDS)
  }

  update(tip: Pt | null, now: number, frameW: number, frameH: number): void {
    if (this.readyQuad) return
    if (!tip) {
      this.dwellAnchor = null
      this.dwellStart = null
      return
    }

    this.trail.push({ ...tip })
    if (this.trail.length > 120) this.trail = this.trail.slice(-120)

    if (!this.dwellAnchor) {
      this.dwellAnchor = { ...tip }
      this.dwellStart = now
      return
    }

    if (dist(tip, this.dwellAnchor) > MOVE_TOLERANCE_PX) {
      this.dwellAnchor = { ...tip }
      this.dwellStart = now
      return
    }

    if (now - (this.dwellStart ?? now) < DWELL_SECONDS) return

    const pinned = { ...this.dwellAnchor }
    this.dwellAnchor = null
    this.dwellStart = null

    const last = this.corners[this.corners.length - 1]
    if (last && dist(pinned, last) < MIN_CORNER_GAP_PX) return

    this.corners.push(pinned)
    this.invalidMessage = null

    if (this.corners.length >= 4) {
      const ordered = orderQuad(this.corners.slice(0, 4))
      if (quadIsValid(ordered, frameW, frameH)) {
        this.readyQuad = ordered
      } else {
        this.invalidMessage = 'Invalid frame — press R and redraw'
        this.corners = []
        this.trail = []
      }
    }
  }
}

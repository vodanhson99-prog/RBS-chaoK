import { dist } from './geom'
import type { TrackedHand } from './hands'

export const COUNTDOWN_SECONDS = 5
export const CAPTURE_INTERVAL_SECONDS = 3
export const POSE_DWELL_SECONDS = 0.65

export type SEval = {
  match: boolean
  score: number
  upper: TrackedHand | null
  lower: TrackedHand | null
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

/** Inverted S (Ƨ): upper hand curves left, lower hand curves right. */
export function evaluateInvertedS(
  hands: TrackedHand[],
  frameW: number,
  frameH: number,
): SEval {
  if (hands.length < 2) {
    return { match: false, score: hands.length * 0.2, upper: hands[0] ?? null, lower: null }
  }

  const sorted = [...hands].sort((a, b) => a.wrist.y - b.wrist.y)
  const upper = sorted[0]
  const lower = sorted[sorted.length - 1]
  const dy = (lower.wrist.y - upper.wrist.y) / frameH
  const dx = Math.abs(upper.wrist.x - lower.wrist.x) / frameW

  const span = Math.min(frameW, frameH)
  const upperReach = dist(upper.wrist, upper.tipCentroid) / span
  const lowerReach = dist(lower.wrist, lower.tipCentroid) / span
  const upperBias = (upper.tipCentroid.x - upper.wrist.x) / frameW
  const lowerBias = (lower.tipCentroid.x - lower.wrist.x) / frameW

  const vertical = dy >= 0.1 && dy <= 0.48 ? clamp01(1 - Math.abs(dy - 0.22) / 0.22) : 0
  const stacked = dx < 0.32 ? clamp01(1 - dx / 0.32) : 0
  const open = upperReach > 0.045 && lowerReach > 0.045 ? 1 : 0
  // Ƨ: top opens left, bottom opens right
  const upperLeft = upperBias < -0.025 ? clamp01((-upperBias - 0.025) / 0.08) : 0
  const lowerRight = lowerBias > 0.025 ? clamp01((lowerBias - 0.025) / 0.08) : 0
  const opposite = upperBias < 0 && lowerBias > 0 ? 1 : 0

  const score = vertical * 0.22 + stacked * 0.18 + open * 0.15 + upperLeft * 0.2 + lowerRight * 0.2 + opposite * 0.05
  const match = score >= 0.62 && opposite === 1 && open === 1 && dy >= 0.1 && dx < 0.32

  return { match, score, upper, lower }
}

export class STrigger {
  locked = false
  private dwellStart: number | null = null

  reset(): void {
    this.locked = false
    this.dwellStart = null
  }

  dwellProgress(now: number): number {
    if (this.locked || this.dwellStart === null) return this.locked ? 1 : 0
    return Math.min(1, (now - this.dwellStart) / POSE_DWELL_SECONDS)
  }

  update(match: boolean, now: number): void {
    if (this.locked) return
    if (!match) {
      this.dwellStart = null
      return
    }
    if (this.dwellStart === null) this.dwellStart = now
    if (now - this.dwellStart >= POSE_DWELL_SECONDS) this.locked = true
  }
}

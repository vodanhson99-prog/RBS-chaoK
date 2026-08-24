export type GestureTriggerConfig = {
  holdMs: number
  countdownSeconds: number
}

export type GestureTriggerUpdate = {
  phase: 'idle' | 'holding' | 'countdown'
  countdown: number | null
  countdownRemainingMs: number | null
  holdProgress: number
  shouldSnap: boolean
}

export class GestureCaptureTrigger {
  private holdStart: number | null = null
  private countdownEnd: number | null = null
  private armed = false

  reset(): void {
    this.holdStart = null
    this.countdownEnd = null
    this.armed = false
  }

  update(isS: boolean, nowMs: number, config: GestureTriggerConfig): GestureTriggerUpdate {
    if (this.armed && this.countdownEnd !== null) {
      const remaining = this.countdownEnd - nowMs
      if (remaining <= 0) {
        return {
          phase: 'countdown',
          countdown: 0,
          countdownRemainingMs: 0,
          holdProgress: 1,
          shouldSnap: true,
        }
      }
      return {
        phase: 'countdown',
        countdown: Math.max(1, Math.ceil(remaining / 1000)),
        countdownRemainingMs: remaining,
        holdProgress: 1,
        shouldSnap: false,
      }
    }

    if (isS) {
      if (this.holdStart === null) this.holdStart = nowMs
      const held = nowMs - this.holdStart
      if (held >= config.holdMs) {
        this.armed = true
        this.countdownEnd = nowMs + config.countdownSeconds * 1000
        return {
          phase: 'countdown',
          countdown: config.countdownSeconds,
          countdownRemainingMs: config.countdownSeconds * 1000,
          holdProgress: 1,
          shouldSnap: false,
        }
      }
      return {
        phase: 'holding',
        countdown: null,
        countdownRemainingMs: null,
        holdProgress: Math.min(1, held / config.holdMs),
        shouldSnap: false,
      }
    }

    this.holdStart = null
    return {
      phase: 'idle',
      countdown: null,
      countdownRemainingMs: null,
      holdProgress: 0,
      shouldSnap: false,
    }
  }

  afterSnap(): void {
    this.reset()
  }
}

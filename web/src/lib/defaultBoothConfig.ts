import type { BoothConfig } from './api'

export const DEFAULT_BOOTH_CONFIG: BoothConfig = {
  defaultTemplateId: 'blue',
  defaultTemplateVersion: 1,
  captureMode: 'gesture-s',
  gesture: {
    holdMs: 950,
    countdownSeconds: 3,
    poseGraceMs: 2500,
    minConfidence: 0.78,
    consecutiveFrames: 4,
  },
  features: {
    cornerPin: false,
    frameLibrary: false,
  },
}

import type { PrintConfig } from './print'

export type BoothGestureConfig = {
  holdMs: number
  countdownSeconds: number
  poseGraceMs: number
  minConfidence: number
  consecutiveFrames: number
}

export type BoothConfig = {
  defaultTemplateId: string
  defaultTemplateVersion: number
  captureMode: string
  gesture: BoothGestureConfig
  features: {
    cornerPin: boolean
    frameLibrary: boolean
  }
  print?: PrintConfig
}

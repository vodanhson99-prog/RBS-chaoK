import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Pt } from './geom'

const INDEX_TIP = 8
const TIPS = [8, 12, 16, 20]
const PALM = [0, 5, 9, 13, 17]
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let landmarker: HandLandmarker | null = null

export type TrackedHand = {
  label: string
  wrist: Pt
  tips: Pt[]
  tipCentroid: Pt
  palm: Pt
}

export async function createHandLandmarker(): Promise<HandLandmarker> {
  if (landmarker) return landmarker
  const vision = await FilesetResolver.forVisionTasks(WASM)
  const options = {
    runningMode: 'VIDEO' as const,
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
  }
  try {
    landmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    })
  } catch {
    landmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
    })
  }
  return landmarker
}

function mean(pts: Pt[]): Pt {
  const n = pts.length || 1
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  }
}

function lmToPt(
  hand: { x: number; y: number }[],
  i: number,
  width: number,
  height: number,
): Pt {
  return { x: hand[i].x * width, y: hand[i].y * height }
}

export function getTrackedHands(
  result: HandLandmarkerResult,
  width: number,
  height: number,
): TrackedHand[] {
  if (!result.landmarks?.length) return []
  const out: TrackedHand[] = []
  for (let i = 0; i < result.landmarks.length; i++) {
    const hand = result.landmarks[i]
    const wrist = lmToPt(hand, 0, width, height)
    const tips = TIPS.map((t) => lmToPt(hand, t, width, height))
    const palm = mean(PALM.map((t) => lmToPt(hand, t, width, height)))
    const raw = result.handedness?.[i]?.[0]?.categoryName ?? 'Hand'
    const label = raw === 'Left' ? 'Right' : raw === 'Right' ? 'Left' : raw
    out.push({ label, wrist, tips, tipCentroid: mean(tips), palm })
  }
  return out
}

export function getIndexTip(
  result: HandLandmarkerResult,
  width: number,
  height: number,
): { tip: Pt; label: string } | null {
  const hands = getTrackedHands(result, width, height)
  if (!hands.length) return null
  const top = hands.reduce((a, b) => (a.tips[0].y < b.tips[0].y ? a : b))
  return { tip: top.tips.find((_, i) => TIPS[i] === INDEX_TIP) ?? top.tips[0], label: top.label }
}

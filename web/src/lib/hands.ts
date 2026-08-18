import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Pt } from './geom'

const INDEX_TIP = 8
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let landmarker: HandLandmarker | null = null

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

export function getIndexTip(
  result: HandLandmarkerResult,
  width: number,
  height: number,
): { tip: Pt; label: string } | null {
  if (!result.landmarks?.length) return null
  let bestTip: Pt | null = null
  let bestLabel = 'Hand'
  let bestY = Infinity
  for (let i = 0; i < result.landmarks.length; i++) {
    const hand = result.landmarks[i]
    const lm = hand[INDEX_TIP]
    const tip = { x: lm.x * width, y: lm.y * height }
    const raw = result.handedness?.[i]?.[0]?.categoryName ?? 'Hand'
    const label = raw === 'Left' ? 'Right' : raw === 'Right' ? 'Left' : raw
    if (tip.y < bestY) {
      bestY = tip.y
      bestTip = tip
      bestLabel = label
    }
  }
  return bestTip ? { tip: bestTip, label: bestLabel } : null
}

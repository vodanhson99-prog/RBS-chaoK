import {
  GestureRecognizer,
  FilesetResolver,
  type GestureRecognizerResult,
} from '@mediapipe/tasks-vision'
import { markBoothStartup } from './performance'
import { analyzeLetterSResult, analyzeLetterSPair } from './letterSGesture'

export {
  analyzeLetterSResult,
  analyzeLetterSPair,
  analyzeLetterSGesture,
  createLetterSStreakGate,
  detectLetterS,
  HAND_CONNECTIONS,
  isLetterSGesture,
  scoreLetterSGesture,
} from './letterSGesture'
export type {
  HandLandmark,
  LetterSAnalysis,
  LetterSHandCandidate,
  LetterSPairAnalysis,
} from './letterSGesture'

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

/** Tunable via booth config — start strict, relax if manual testing says too hard. */
export const DEFAULT_GESTURE_MIN_CONFIDENCE = 0.78
export const DEFAULT_GESTURE_CONSECUTIVE_FRAMES = 4

let recognizer: GestureRecognizer | null = null
let recognizerPromise: Promise<GestureRecognizer> | null = null
let recognizerDelegate: 'GPU' | 'CPU' | null = null

export function prefetchGestureRecognizer(): void {
  if (typeof window === 'undefined' || recognizer || recognizerPromise) return
  void createGestureRecognizer().catch(() => undefined)
}

function isBenignMediaPipeInfo(args: Parameters<Console['error']>): boolean {
  return args.some((arg) => {
    if (typeof arg !== 'string') return false
    const message = arg.replace(/\s+/g, ' ').trim().toLowerCase()
    return message === 'info: created tensorflow lite xnnpack delegate for cpu.'
  })
}

let mediaPipeConsoleFilterInstalled = false

/**
 * MediaPipe's WASM runtime can emit this informational line asynchronously,
 * after recognizeForVideo returns. Keep the narrow filter installed for the
 * recognizer lifetime so delayed output does not become a Next.js console error.
 */
function installMediaPipeConsoleFilter(): void {
  if (mediaPipeConsoleFilterInstalled || typeof window === 'undefined') return

  const originalConsoleError = console.error
  console.error = (...args: Parameters<Console['error']>) => {
    if (!isBenignMediaPipeInfo(args)) originalConsoleError.apply(console, args)
  }
  mediaPipeConsoleFilterInstalled = true
}

export function recognizeForVideoSafely(
  instance: GestureRecognizer,
  input: HTMLVideoElement | HTMLCanvasElement,
  timestampMs: number,
): GestureRecognizerResult {
  installMediaPipeConsoleFilter()
  return instance.recognizeForVideo(input, timestampMs)
}

export function getGestureRecognizerDelegate(): 'GPU' | 'CPU' | null {
  return recognizerDelegate
}

export async function createGestureRecognizer(): Promise<GestureRecognizer> {
  installMediaPipeConsoleFilter()
  if (recognizer) return recognizer
  if (recognizerPromise) return recognizerPromise

  recognizerPromise = (async () => {
    markBoothStartup('mediapipe-loading')
    const vision = await FilesetResolver.forVisionTasks(WASM)
    const options = {
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.68,
      minHandPresenceConfidence: 0.68,
      minTrackingConfidence: 0.58,
    }
    try {
      recognizer = await GestureRecognizer.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      })
      recognizerDelegate = 'GPU'
    } catch {
      recognizer = await GestureRecognizer.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      })
      recognizerDelegate = 'CPU'
    }
    return recognizer
  })()

  try {
    return await recognizerPromise
  } catch (error) {
    recognizerPromise = null
    throw error
  }
}

/**
 * Runtime handoff for the booth. A single hand never passes; the two C hands
 * must also satisfy the vertical order, orientation, distance, and silhouette rules.
 */
export function detectLetterSPair(
  result: GestureRecognizerResult,
  minConfidence = DEFAULT_GESTURE_MIN_CONFIDENCE,
) {
  const candidates = analyzeLetterSResult(result, minConfidence)
  return {
    candidates,
    pair: analyzeLetterSPair(candidates, minConfidence),
  }
}

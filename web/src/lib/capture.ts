import { createGestureRecognizer, detectLetterSPair, recognizeForVideoSafely } from './gestures'
import { EXPORT_2K } from './imageExport'
import { describeCameraError, isAbortError } from './camera'
import { markBoothStartup, recordBoothDetection, recordBoothFrame } from './performance'

const DETECTION_INTERVAL_MS = 66
const RECOGNITION_MAX_WIDTH = 640

export type GestureDetectConfig = {
  minConfidence: number
  consecutiveFrames: number
}

export type LiveDetectConfig = { current: GestureDetectConfig }

export type GestureFrameInfo = {
  isLetterS: boolean
  now: number
  error?: CaptureLoopError
}

export type CaptureLoopHandle = {
  ready: Promise<void>
  stop: () => void
}

export type CaptureLoopError = {
  phase: 'camera' | 'tracking'
  error: unknown
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints[] = [
  {
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: EXPORT_2K.width },
      height: { ideal: EXPORT_2K.height },
      frameRate: { ideal: 30, max: 30 },
    },
  },
  {
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  },
  { audio: false, video: true },
]

export async function startCamera(
  video: HTMLVideoElement,
  signal?: AbortSignal,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API unavailable — use HTTPS or localhost and a supported browser.')
  }

  markBoothStartup('camera-requested')
  let lastError: unknown
  let stream: MediaStream | undefined
  for (const constraints of CAMERA_CONSTRAINTS) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints)
      break
    } catch (error) {
      lastError = error
      if (isAbortError(error) || (error instanceof DOMException && error.name === 'NotAllowedError')) {
        throw error
      }
    }
  }

  if (!stream) {
    const message = describeCameraError(lastError)
    throw new Error(message)
  }
  markBoothStartup('getUserMedia-resolved')
  if (signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop())
    throw new DOMException('Camera startup was cancelled', 'AbortError')
  }
  video.srcObject = stream
  await video.play()
  markBoothStartup('camera-playing')
  const onFirstFrame = () => {
    markBoothStartup('first-preview-frame')
    markBoothStartup('first-frame')
  }
  if ('requestVideoFrameCallback' in video) {
    video.requestVideoFrameCallback(onFirstFrame)
  } else {
    requestAnimationFrame(onFirstFrame)
  }
  if (signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop())
    video.srcObject = null
    throw new DOMException('Camera startup was cancelled', 'AbortError')
  }
  return stream
}

export function runGestureCaptureLoop(
  video: HTMLVideoElement,
  overlay: HTMLCanvasElement,
  onFrame: (info: GestureFrameInfo) => void,
  detectRef: LiveDetectConfig,
  signal?: AbortSignal,
): CaptureLoopHandle {
  let running = true
  let animationFrame = 0
  let lastTs = -1
  let lastDetectionAt = -Infinity
  let lastIsS = false
  let streak = 0
  let streakRequired = detectRef.current.consecutiveFrames
  let lastVideoTime = -1
  let lastOverlayAt = -Infinity
  let lastOverlayS = false
  const work = document.createElement('canvas')
  const workContext = work.getContext('2d')!
  const frameInfo: GestureFrameInfo = { isLetterS: false, now: 0 }

  const emitFrame = (now: number, error?: CaptureLoopError) => {
    frameInfo.isLetterS = error ? false : lastIsS
    frameInfo.now = now / 1000
    frameInfo.error = error
    onFrame(frameInfo)
    frameInfo.error = undefined
  }

  const stop = () => {
    running = false
    if (animationFrame) cancelAnimationFrame(animationFrame)
  }

  const ready = (async () => {
    let recognizer: Awaited<ReturnType<typeof createGestureRecognizer>>
    try {
      recognizer = await createGestureRecognizer()
      markBoothStartup('recognizer-ready')
    } catch (error) {
      emitFrame(performance.now(), { phase: 'tracking', error })
      return
    }
    if (!running || signal?.aborted) return

    const tick = (frameTime: number) => {
      if (!running || signal?.aborted) return
      const frameStartedAt = performance.now()
      if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        const width = Math.min(RECOGNITION_MAX_WIDTH, video.videoWidth)
        const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width))
        if (work.width !== width || work.height !== height) {
          work.width = width
          work.height = height
          overlay.width = video.videoWidth
          overlay.height = video.videoHeight
        }

        const now = frameTime
        if (now - lastDetectionAt >= DETECTION_INTERVAL_MS) {
          // CSS mirrors the preview only. Copy into the smaller work canvas
          // only when detection is due; the native video remains the preview.
          workContext.drawImage(video, 0, 0, work.width, work.height)
          const ts = Math.max(now, lastTs + 1)
          lastTs = ts
          let result: ReturnType<typeof recognizeForVideoSafely>
          const detectionStartedAt = performance.now()
          try {
            result = recognizeForVideoSafely(recognizer, work, ts)
          } catch (error) {
            emitFrame(now, { phase: 'tracking', error })
            recordBoothDetection(performance.now() - detectionStartedAt)
            lastDetectionAt = now
            recordBoothFrame(performance.now() - frameStartedAt)
            animationFrame = requestAnimationFrame(tick)
            return
          }
          const { minConfidence, consecutiveFrames } = detectRef.current
          if (consecutiveFrames !== streakRequired) {
            streakRequired = consecutiveFrames
            streak = 0
          }
          const { pair } = detectLetterSPair(result, minConfidence)
          const rawS = pair.pass
          streak = rawS ? streak + 1 : 0
          lastIsS = streak >= streakRequired
          lastDetectionAt = now
          recordBoothDetection(performance.now() - detectionStartedAt)
        }

        if (now - lastOverlayAt >= 1000 / 30 || lastOverlayS !== lastIsS) {
          lastOverlayAt = now
          lastOverlayS = lastIsS
          emitFrame(now)
        }
      }
      if (video.readyState >= 2) recordBoothFrame(performance.now() - frameStartedAt)
      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
  })()

  if (signal) {
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
  }

  return { ready, stop }
}

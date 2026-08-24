export type BoothPerformanceSnapshot = {
  marks: Record<string, number | null>
  startup: {
    mountedToCameraPlayingMs: number | null
    cameraPlayingToFirstFrameMs: number | null
    firstFrameToRecognizerReadyMs: number | null
    mountedToRecognizerReadyMs: number | null
  }
  runtime: {
    frameCount: number
    fps: number
    detectionCount: number
    detectionFps: number
    averageDetectionMs: number
    maxDetectionMs: number
    averageFrameCostMs: number
    maxFrameCostMs: number
  }
}

type RuntimeCounters = BoothPerformanceSnapshot['runtime'] & {
  frameWindowStartedAt: number
  detectionWindowStartedAt: number
  detectionTotalMs: number
  frameTotalMs: number
}

const enabled = process.env.NODE_ENV !== 'production'
const startupMarkNames = [
  'booth-mounted',
  'camera-requested',
  'getUserMedia-resolved',
  'camera-playing',
  'first-frame',
  'first-preview-frame',
  'recognizer-ready',
]
const counters: RuntimeCounters = {
  frameCount: 0,
  fps: 0,
  detectionCount: 0,
  detectionFps: 0,
  averageDetectionMs: 0,
  maxDetectionMs: 0,
  averageFrameCostMs: 0,
  maxFrameCostMs: 0,
  frameWindowStartedAt: 0,
  detectionWindowStartedAt: 0,
  detectionTotalMs: 0,
  frameTotalMs: 0,
}

function latestMark(name: string): number | null {
  if (!enabled || typeof performance === 'undefined') return null
  const entries = performance.getEntriesByName(`booth:${name}`)
  return entries.length > 0 ? entries[entries.length - 1].startTime : null
}

function durationBetween(start: number | null, end: number | null): number | null {
  if (start === null || end === null || end < start) return null
  return end - start
}

export function markBoothStartup(name: string): void {
  if (!enabled || typeof performance === 'undefined') return
  performance.mark(`booth:${name}`)
}

export function recordBoothFrame(costMs: number): void {
  if (!enabled || typeof performance === 'undefined') return
  const now = performance.now()
  if (counters.frameWindowStartedAt === 0) counters.frameWindowStartedAt = now
  counters.frameCount += 1
  counters.frameTotalMs += costMs
  counters.averageFrameCostMs = counters.frameTotalMs / counters.frameCount
  counters.maxFrameCostMs = Math.max(counters.maxFrameCostMs, costMs)
  const elapsed = now - counters.frameWindowStartedAt
  if (elapsed >= 1000) {
    counters.fps = (counters.frameCount * 1000) / elapsed
    counters.frameWindowStartedAt = now
  }
}

export function recordBoothDetection(latencyMs: number): void {
  if (!enabled || typeof performance === 'undefined') return
  const now = performance.now()
  if (counters.detectionWindowStartedAt === 0) counters.detectionWindowStartedAt = now
  counters.detectionCount += 1
  counters.detectionTotalMs += latencyMs
  counters.averageDetectionMs = counters.detectionTotalMs / counters.detectionCount
  counters.maxDetectionMs = Math.max(counters.maxDetectionMs, latencyMs)
  const elapsed = now - counters.detectionWindowStartedAt
  if (elapsed >= 1000) {
    counters.detectionFps = (counters.detectionCount * 1000) / elapsed
    counters.detectionWindowStartedAt = now
  }
}

export function resetBoothPerformance(): void {
  if (!enabled || typeof performance === 'undefined') return
  for (const name of startupMarkNames) performance.clearMarks(`booth:${name}`)
  Object.assign(counters, {
    frameCount: 0,
    fps: 0,
    detectionCount: 0,
    detectionFps: 0,
    averageDetectionMs: 0,
    maxDetectionMs: 0,
    averageFrameCostMs: 0,
    maxFrameCostMs: 0,
    frameWindowStartedAt: 0,
    detectionWindowStartedAt: 0,
    detectionTotalMs: 0,
    frameTotalMs: 0,
  })
}

export function measureBoothStartup(): void {
  if (!enabled || typeof performance === 'undefined') return
  const pairs: Array<[string, string, string]> = [
    ['booth:mounted-to-camera-playing', 'booth-mounted', 'camera-playing'],
    ['booth:camera-playing-to-first-frame', 'camera-playing', 'first-frame'],
    ['booth:first-frame-to-recognizer-ready', 'first-frame', 'recognizer-ready'],
    ['booth:mounted-to-recognizer-ready', 'booth-mounted', 'recognizer-ready'],
  ]
  for (const [name, start, end] of pairs) {
    performance.clearMeasures(name)
    if (latestMark(start) !== null && latestMark(end) !== null) {
      performance.measure(name, `booth:${start}`, `booth:${end}`)
    }
  }
}

export function getBoothPerformanceSnapshot(): BoothPerformanceSnapshot {
  measureBoothStartup()
  const mounted = latestMark('booth-mounted')
  const cameraPlaying = latestMark('camera-playing')
  const firstFrame = latestMark('first-frame') ?? latestMark('first-preview-frame')
  const recognizerReady = latestMark('recognizer-ready')
  return {
    marks: {
      mounted,
      cameraPlaying,
      firstFrame,
      recognizerReady,
    },
    startup: {
      mountedToCameraPlayingMs: durationBetween(mounted, cameraPlaying),
      cameraPlayingToFirstFrameMs: durationBetween(cameraPlaying, firstFrame),
      firstFrameToRecognizerReadyMs: durationBetween(firstFrame, recognizerReady),
      mountedToRecognizerReadyMs: durationBetween(mounted, recognizerReady),
    },
    runtime: {
      frameCount: counters.frameCount,
      fps: counters.fps,
      detectionCount: counters.detectionCount,
      detectionFps: counters.detectionFps,
      averageDetectionMs: counters.averageDetectionMs,
      maxDetectionMs: counters.maxDetectionMs,
      averageFrameCostMs: counters.averageFrameCostMs,
      maxFrameCostMs: counters.maxFrameCostMs,
    },
  }
}

declare global {
  interface Window {
    __RbsBoothPerformance?: {
      reset: typeof resetBoothPerformance
      snapshot: typeof getBoothPerformanceSnapshot
    }
  }
}

if (typeof window !== 'undefined' && enabled) {
  window.__RbsBoothPerformance = {
    reset: resetBoothPerformance,
    snapshot: getBoothPerformanceSnapshot,
  }
}

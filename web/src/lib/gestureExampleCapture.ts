import type { HandLandmark, LetterSAnalysis, LetterSHandCandidate, LetterSPairAnalysis } from './letterSGesture'

export type GestureExampleLabel = 'auto-pass' | 'auto-fail' | 'truth-s' | 'truth-not-s'

export type GestureExample = {
  id: string
  capturedAt: string
  imageUrl: string
  label: GestureExampleLabel
  analysis: LetterSAnalysis
  pair: LetterSPairAnalysis
  landmarks: HandLandmark[] | null
  worldLandmarks: HandLandmark[] | null
  candidates: Array<Pick<LetterSHandCandidate, 'index' | 'handedness' | 'analysis' | 'imageLandmarks' | 'worldLandmarks'>>
  minConfidence: number
  consecutiveFrames: number
}

export function captureGestureFrame(
  video: HTMLVideoElement,
  overlayCanvas: HTMLCanvasElement,
): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return null

  ctx.translate(w, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, w, h)
  ctx.drawImage(overlayCanvas, 0, 0, w, h)
  return out.toDataURL('image/jpeg', 0.9)
}

export function buildExamplePayload(example: GestureExample) {
  return {
    id: example.id,
    capturedAt: example.capturedAt,
    label: example.label,
    expectedPass: example.label === 'truth-s' || example.label === 'auto-pass',
    analysis: example.analysis,
    pair: example.pair,
    landmarks: example.landmarks,
    worldLandmarks: example.worldLandmarks,
    candidates: example.candidates,
    minConfidence: example.minConfidence,
    consecutiveFrames: example.consecutiveFrames,
    sourceFile: 'web/src/lib/letterSGesture.ts',
  }
}

export function downloadTextFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export function downloadExample(example: GestureExample) {
  const base = `gesture-${example.id.slice(0, 8)}`
  downloadDataUrl(example.imageUrl, `${base}.jpg`)
  downloadTextFile(`${base}.json`, JSON.stringify(buildExamplePayload(example), null, 2))
}

export function downloadAllExamples(examples: GestureExample[]) {
  for (const ex of examples) downloadExample(ex)
  if (examples.length > 1) {
    downloadTextFile(
      `gesture-examples-manifest-${Date.now()}.json`,
      JSON.stringify(examples.map(buildExamplePayload), null, 2),
    )
  }
}

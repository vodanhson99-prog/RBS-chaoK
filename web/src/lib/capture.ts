import { HandLandmarker } from '@mediapipe/tasks-vision'
import { createHandLandmarker, getIndexTip } from './hands'
import { QuadDrawer } from './quadDrawer'
import type { Pt } from './geom'

export type FrameInfo = {
  drawer: QuadDrawer
  tip: Pt | null
  label: string | null
  now: number
  frame: HTMLCanvasElement
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  })
  video.srcObject = stream
  await video.play()
  return stream
}

export function snapshotMirrored(video: HTMLVideoElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = video.videoWidth
  c.height = video.videoHeight
  const ctx = c.getContext('2d')!
  ctx.translate(c.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0)
  return c
}

export async function runCaptureLoop(
  video: HTMLVideoElement,
  overlay: HTMLCanvasElement,
  onFrame: (info: FrameInfo) => void,
): Promise<() => void> {
  const landmarker: HandLandmarker = await createHandLandmarker()
  const drawer = new QuadDrawer()
  const work = document.createElement('canvas')
  let running = true
  let lastTs = -1

  const tick = () => {
    if (!running) return
    if (video.readyState >= 2 && video.videoWidth) {
      work.width = video.videoWidth
      work.height = video.videoHeight
      const wctx = work.getContext('2d')!
      wctx.setTransform(-1, 0, 0, 1, work.width, 0)
      wctx.drawImage(video, 0, 0)
      wctx.setTransform(1, 0, 0, 1, 0, 0)

      const now = performance.now()
      const ts = Math.max(now, lastTs + 1)
      lastTs = ts
      const result = landmarker.detectForVideo(work, ts)
      const found = getIndexTip(result, work.width, work.height)
      const tip = found?.tip ?? null
      drawer.update(tip, now / 1000, work.width, work.height)

      overlay.width = work.width
      overlay.height = work.height
      onFrame({
        drawer,
        tip,
        label: found?.label ?? null,
        now: now / 1000,
        frame: work,
      })
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return () => {
    running = false
  }
}

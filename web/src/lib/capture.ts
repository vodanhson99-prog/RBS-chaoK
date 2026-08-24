import { HandLandmarker } from '@mediapipe/tasks-vision'
import { createHandLandmarker, getTrackedHands, type TrackedHand } from './hands'

export type FrameInfo = {
  hands: TrackedHand[]
  now: number
  frame: HTMLCanvasElement
}

export type CameraDevice = {
  deviceId: string
  label: string
}

export async function listCameras(): Promise<CameraDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }))
}

export async function startCamera(
  video: HTMLVideoElement,
  deviceId?: string,
): Promise<MediaStream> {
  const videoConstraints: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: videoConstraints,
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
      const hands = getTrackedHands(result, work.width, work.height)

      overlay.width = work.width
      overlay.height = work.height
      onFrame({
        hands,
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

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadPhoto, type BoothConfig } from '../../lib/api'
import { prefetchGestureRecognizer } from '../../lib/gestures'
import { describeCameraError, describeTrackingError, isAbortError } from '../../lib/camera'
import { markBoothStartup } from '../../lib/performance'
import { withUploadRetry } from '../../lib/uploadRetry'
import { runGestureCaptureLoop, startCamera, type CaptureLoopHandle } from '../../lib/capture'
import {
  canvasToJpegBlob,
  canvasToPreviewDataUrl,
  composeSingle,
  composeSlots,
  JPEG_THUMB_QUALITY,
  loadTemplateAssets,
} from '../../lib/compose'
import { configureCanvasQuality } from '../../lib/imageExport'
import { drawBoothOverlay } from '../../lib/drawOverlay'
import { GestureCaptureTrigger } from '../../lib/gestureTrigger'
import { templateShotCount, type Template } from '../../lib/templates'

export type CapturePhase = 'loading' | 'ready' | 'holding' | 'countdown' | 'cooldown' | 'busy' | 'printing'

export type BoothSessionState = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  overlayRef: React.RefObject<HTMLCanvasElement | null>
  status: string
  phase: CapturePhase
  error: string | null
  shotCount: number
  thumbs: string[]
  busy: boolean
  printing: boolean
  printPreview: string | null
  retakeLast: () => void
  handlePrintComplete: () => void
}

export function useBoothSession(template: Template, boothConfig: BoothConfig): BoothSessionState {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const triggerRef = useRef(new GestureCaptureTrigger())
  const shotsRef = useRef<HTMLCanvasElement[]>([])
  const lastCapture = useRef(0)
  const flashUntil = useRef(0)
  const capturing = useRef(false)
  const busyRef = useRef(false)
  const pendingTokenRef = useRef<string | null>(null)
  const printDoneRef = useRef(false)
  const uploadDoneRef = useRef(false)
  const printingRef = useRef(false)
  const overlayContextRef = useRef<CanvasRenderingContext2D | null>(null)

  const [status, setStatus] = useState('Allow camera access')
  const [phase, setPhase] = useState<CapturePhase>('loading')
  const phaseRef = useRef<CapturePhase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [shotCount, setShotCount] = useState(0)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printPreview, setPrintPreview] = useState<string | null>(null)

  const needed = templateShotCount(template)
  const gestureConfigRef = useRef({
    holdMs: boothConfig.gesture.holdMs,
    countdownSeconds: boothConfig.gesture.countdownSeconds,
  })
  const detectConfigRef = useRef({
    minConfidence: boothConfig.gesture.minConfidence ?? 0.78,
    consecutiveFrames: boothConfig.gesture.consecutiveFrames ?? 4,
  })

  useEffect(() => {
    gestureConfigRef.current = {
      holdMs: boothConfig.gesture.holdMs,
      countdownSeconds: boothConfig.gesture.countdownSeconds,
    }
    detectConfigRef.current = {
      minConfidence: boothConfig.gesture.minConfidence ?? 0.78,
      consecutiveFrames: boothConfig.gesture.consecutiveFrames ?? 4,
    }
  }, [
    boothConfig.gesture.consecutiveFrames,
    boothConfig.gesture.countdownSeconds,
    boothConfig.gesture.holdMs,
    boothConfig.gesture.minConfidence,
  ])

  const tryNavigate = useCallback(() => {
    if (!printDoneRef.current || !uploadDoneRef.current || !pendingTokenRef.current) return
    router.push(`/result/${pendingTokenRef.current}`)
  }, [router])

  const handlePrintComplete = useCallback(() => {
    printDoneRef.current = true
    tryNavigate()
  }, [tryNavigate])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    let stream: MediaStream | undefined
    let loop: CaptureLoopHandle | undefined
    let trackingUnavailable = false
    const video = videoRef.current
    const overlay = overlayRef.current

    if (!video || !overlay) return () => controller.abort()
    overlayContextRef.current = overlay.getContext('2d')
    markBoothStartup('booth-mounted')
    void prefetchGestureRecognizer()

    const updateStatus = (message: string) => {
      setStatus((current) => (current === message ? current : message))
    }

    const updatePhase = (next: CapturePhase) => {
      if (phaseRef.current === next) return
      phaseRef.current = next
      setPhase(next)
    }

    shotsRef.current = []
    setShotCount(0)
    setThumbs([])
    setError(null)
    setStatus('Loading camera…')
    updatePhase('loading')
    setPrinting(false)
    setPrintPreview(null)
    printingRef.current = false
    pendingTokenRef.current = null
    printDoneRef.current = false
    uploadDoneRef.current = false
    triggerRef.current.reset()
    capturing.current = false
    busyRef.current = false
    setBusy(false)

    const finishIfReady = async () => {
      if (shotsRef.current.length < needed || busyRef.current || cancelled) return
      busyRef.current = true
      setBusy(true)
      updateStatus('Composing final image…')
      updatePhase('busy')
      try {
        const assets = await loadTemplateAssets(template)
        const composed =
          assets.slots.length > 0
            ? composeSlots(shotsRef.current, assets.overlay, assets.slots, template.output)
            : composeSingle(shotsRef.current[0], assets.overlay, template.output)
        const previewUrl = canvasToPreviewDataUrl(composed)
        const blob = await canvasToJpegBlob(composed)

        if (cancelled) return

        setPrintPreview(previewUrl)
        setPrinting(true)
        printingRef.current = true
        updateStatus('Printing your photo…')
        updatePhase('printing')
        printDoneRef.current = false
        uploadDoneRef.current = false

        const idempotencyKey = crypto.randomUUID()
        const session = await withUploadRetry(
          () =>
            uploadPhoto(blob, {
              frameId: template.id,
              frameVersion: template.version,
              captureMode: boothConfig.captureMode,
              idempotencyKey,
              signal: controller.signal,
            }),
          { attempts: 3, baseDelayMs: 900 },
        )

        if (cancelled) return

        pendingTokenRef.current = session.token
        sessionStorage.setItem(`photobooth-preview:${session.token}`, previewUrl)
        uploadDoneRef.current = true
        tryNavigate()
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return
        busyRef.current = false
        setBusy(false)
        setPrinting(false)
        setPrintPreview(null)
        printingRef.current = false
        setError(e instanceof Error ? e.message : 'Upload failed')
        updateStatus('Upload failed — try again')
        updatePhase('ready')
      }
    }

    const snap = () => {
      if (capturing.current || busyRef.current || !video.videoWidth) return
      capturing.current = true
      const now = performance.now() / 1000
      lastCapture.current = now
      flashUntil.current = now + 0.25
      const shot = document.createElement('canvas')
      shot.width = video.videoWidth
      shot.height = video.videoHeight
      const shotCtx = shot.getContext('2d')!
      configureCanvasQuality(shotCtx)
      shotCtx.setTransform(-1, 0, 0, 1, shot.width, 0)
      shotCtx.drawImage(video, 0, 0, shot.width, shot.height)
      shotCtx.setTransform(1, 0, 0, 1, 0, 0)
      shotsRef.current = [...shotsRef.current, shot]
      setShotCount(shotsRef.current.length)
      setThumbs((previous) => [...previous, shot.toDataURL('image/jpeg', JPEG_THUMB_QUALITY)])
      triggerRef.current.afterSnap()
      capturing.current = false
      void finishIfReady()
    }

    const initialize = async () => {
      const assetsPromise = loadTemplateAssets(template).catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : 'Frame unavailable')
        }
        return null
      })

      try {
        stream = await startCamera(video, controller.signal)
        if (cancelled) return
        updateStatus('Camera ready — loading hand tracking…')
        loop = runGestureCaptureLoop(
          video,
          overlay,
          ({ isLetterS, now, error: captureError }) => {
            if (cancelled) return
            if (captureError && !trackingUnavailable) {
              trackingUnavailable = captureError.phase === 'tracking'
              setError(
                captureError.phase === 'camera'
                  ? describeCameraError(captureError.error)
                  : describeTrackingError(captureError.error),
              )
              updateStatus(
                captureError.phase === 'camera'
                  ? 'Camera unavailable — preview may still work'
                  : 'Camera ready — hand tracking unavailable',
              )
            }
            const ctx = overlayContextRef.current
            if (!ctx) return
            ctx.clearRect(0, 0, overlay.width, overlay.height)

            const inCooldown = now - lastCapture.current < 1.2
            let message = 'Make an S with your hand to start'
            let holdProgress = 0
            let showHoldBar = false
            let countdown: number | null = null
            let countdownRemainingMs: number | null = null

            if (busyRef.current) {
              message = printingRef.current ? 'Printing your photo…' : 'Uploading…'
              updatePhase(printingRef.current ? 'printing' : 'busy')
            } else if (inCooldown) {
              message =
                needed > 1
                  ? `Shot ${shotsRef.current.length}/${needed} — show S again`
                  : 'Nice! Get ready for the next guest'
              updatePhase('cooldown')
            } else {
              const trigger = triggerRef.current.update(isLetterS, now * 1000, gestureConfigRef.current)
              holdProgress = trigger.holdProgress
              showHoldBar = trigger.phase === 'holding'
              countdown = trigger.countdown
              countdownRemainingMs = trigger.countdownRemainingMs

              if (trigger.shouldSnap) {
                snap()
                message =
                  needed > 1
                    ? `Shot ${shotsRef.current.length}/${needed} captured`
                    : 'Captured!'
                updatePhase('cooldown')
              } else if (trigger.phase === 'countdown' && trigger.countdown !== null && trigger.countdown > 0) {
                message = isLetterS ? 'Hold S or strike your pose' : 'Strike your pose!'
                updatePhase('countdown')
              } else {
                if (trigger.phase === 'holding') {
                  message = 'Keep holding S…'
                  updatePhase('holding')
                } else if (isLetterS) {
                  message = 'Almost there — hold S'
                  updatePhase('holding')
                } else {
                  message = 'Show letter S with your hand'
                  updatePhase('ready')
                }
              }
            }

            const flash = flashUntil.current > now ? (flashUntil.current - now) / 0.25 : 0
            drawBoothOverlay(ctx, overlay.width, overlay.height, {
              holdProgress,
              countdown,
              countdownRemainingMs,
              flash,
              isLetterS,
              showHoldBar,
            })
            if (!trackingUnavailable) updateStatus(message)
          },
          detectConfigRef,
          controller.signal,
        )
        await Promise.all([assetsPromise, loop.ready])
        if (cancelled || trackingUnavailable) return
        updateStatus('Show letter S with your hand')
        updatePhase('ready')
      } catch (e) {
        if (!cancelled && !isAbortError(e)) {
          setError(describeCameraError(e))
          updateStatus('Camera unavailable — check permissions and reload')
          updatePhase('ready')
        }
      }
    }

    void initialize()

    const stopForVisibility = () => {
      if (document.visibilityState === 'hidden') controller.abort()
    }
    document.addEventListener('visibilitychange', stopForVisibility)
    window.addEventListener('pagehide', stopForVisibility)

    return () => {
      cancelled = true
      controller.abort()
      loop?.stop()
      stream?.getTracks().forEach((track) => track.stop())
      video.srcObject = null
      overlayContextRef.current = null
      document.removeEventListener('visibilitychange', stopForVisibility)
      window.removeEventListener('pagehide', stopForVisibility)
    }
  }, [boothConfig.captureMode, needed, router, template, tryNavigate])

  const retakeLast = () => {
    if (busyRef.current || shotsRef.current.length === 0) return
    shotsRef.current = shotsRef.current.slice(0, -1)
    setShotCount(shotsRef.current.length)
    setThumbs((previous) => previous.slice(0, -1))
    triggerRef.current.reset()
    setError(null)
  }

  return {
    videoRef,
    overlayRef,
    status,
    phase,
    error,
    shotCount,
    thumbs,
    busy,
    printing,
    printPreview,
    retakeLast,
    handlePrintComplete,
  }
}

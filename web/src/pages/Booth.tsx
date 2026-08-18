import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { uploadSession } from '../lib/api'
import { runCaptureLoop, startCamera } from '../lib/capture'
import {
  applyOverlay,
} from '../lib/overlay'
import { canvasToJpegBlob, composeStrip, loadTemplateAssets } from '../lib/compose'
import { drawBoothOverlay } from '../lib/drawOverlay'
import { warpQuad } from '../lib/geom'
import { COUNTDOWN_SECONDS, QuadDrawer } from '../lib/quadDrawer'
import { nextTemplate, templateById } from '../lib/templates'

export default function Booth() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const template = templateById(templateId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const drawerRef = useRef<QuadDrawer>(new QuadDrawer())
  const shotsRef = useRef<HTMLCanvasElement[]>([])
  const countdownEnd = useRef<number | null>(null)
  const lastCapture = useRef(0)
  const flashUntil = useRef(0)
  const lastFrame = useRef<HTMLCanvasElement | null>(null)
  const capturing = useRef(false)
  const busyRef = useRef(false)

  const [status, setStatus] = useState('Allow camera access')
  const [error, setError] = useState<string | null>(null)
  const [shotCount, setShotCount] = useState(0)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const needed = template.kind === 'strip6' ? 6 : 1

  useEffect(() => {
    let cancelled = false
    const video = videoRef.current!
    const overlay = overlayRef.current!
    let stop: (() => void) | undefined
    let stream: MediaStream | undefined

    shotsRef.current = []
    setShotCount(0)
    setThumbs([])
    drawerRef.current.reset()
    countdownEnd.current = null
    capturing.current = false
    busyRef.current = false

    const finishIfReady = async () => {
      if (shotsRef.current.length < needed || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        const assets = await loadTemplateAssets(template)
        const composed =
          template.kind === 'strip6'
            ? composeStrip(shotsRef.current, assets.overlay, assets.slots)
            : applyOverlay(shotsRef.current[0], assets.overlay)
        const blob = await canvasToJpegBlob(composed)
        const session = await uploadSession(blob)
        if (!cancelled) {
          navigate(`/result/${session.token}`, {
            state: { preview: composed.toDataURL('image/jpeg', 0.85) },
          })
        }
      } catch (e) {
        busyRef.current = false
        setBusy(false)
        setError(e instanceof Error ? e.message : 'Upload failed')
      }
    }

    const snap = (drawer: QuadDrawer, frame: HTMLCanvasElement) => {
      if (capturing.current || !drawer.readyQuad || busyRef.current) return
      capturing.current = true
      const now = performance.now() / 1000
      lastCapture.current = now
      flashUntil.current = now + 0.25
      countdownEnd.current = null
      const warped = warpQuad(frame, drawer.readyQuad)
      shotsRef.current = [...shotsRef.current, warped]
      setShotCount(shotsRef.current.length)
      setThumbs((prev) => [...prev, warped.toDataURL('image/jpeg', 0.55)])
      drawer.reset()
      capturing.current = false
      void finishIfReady()
    }

    ;(async () => {
      try {
        await loadTemplateAssets(template)
        stream = await startCamera(video)
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        stop = await runCaptureLoop(video, overlay, ({ drawer, tip, label, now, frame }) => {
          drawerRef.current = drawer
          lastFrame.current = frame
          const ctx = overlay.getContext('2d')
          if (!ctx) return
          ctx.drawImage(frame, 0, 0)

          const inCooldown = now - lastCapture.current < 1.2
          let countdown: number | null = null
          let msg = 'Show one index finger to start drawing'

          if (busyRef.current) {
            msg = 'Uploading…'
          } else if (inCooldown) {
            countdownEnd.current = null
            msg = `Saved ${shotsRef.current.length}/${needed}`
          } else if (drawer.invalidMessage) {
            msg = drawer.invalidMessage
          } else if (!tip) {
            countdownEnd.current = null
            msg = 'Show one index finger (left or right)'
          } else if (!drawer.readyQuad) {
            countdownEnd.current = null
            msg = `Pin corner ${drawer.corners.length + 1}/4 — hold still (${label ?? 'hand'})`
          } else {
            if (!countdownEnd.current) countdownEnd.current = now + COUNTDOWN_SECONDS
            const remaining = countdownEnd.current - now
            if (remaining <= 0) {
              snap(drawer, frame)
              msg = `Saved ${shotsRef.current.length}/${needed}`
            } else {
              countdown = Math.max(1, Math.ceil(remaining))
              msg = 'Frame ready — counting down'
            }
          }

          const flash = flashUntil.current > now ? (flashUntil.current - now) / 0.25 : 0
          drawBoothOverlay(
            ctx,
            overlay.width,
            overlay.height,
            drawer,
            tip,
            msg,
            template.name,
            countdown,
            flash,
            template.kind === 'strip6' ? `Shot ${shotsRef.current.length}/${needed}` : 'Single 16:9',
          )
          setStatus(msg)
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Camera failed')
      }
    })()

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'r' || ev.key === 'R') {
        drawerRef.current.reset()
        countdownEnd.current = null
      }
      if (ev.key === 'm' || ev.key === 'M') {
        navigate(`/booth/${nextTemplate(template.id).id}`)
      }
      if (ev.key === ' ' && drawerRef.current.readyQuad && lastFrame.current) {
        ev.preventDefault()
        snap(drawerRef.current, lastFrame.current)
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
      stop?.()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [template.id, template, needed, navigate])

  return (
    <main className="booth">
      <video ref={videoRef} playsInline muted className="hidden-video" />
      <canvas ref={overlayRef} className="stage" />
      <div className="booth-bar">
        <button type="button" onClick={() => navigate('/')}>
          Home
        </button>
        <button
          type="button"
          onClick={() => {
            drawerRef.current.reset()
            countdownEnd.current = null
          }}
        >
          Reset (R)
        </button>
        <button type="button" onClick={() => navigate(`/booth/${nextTemplate(template.id).id}`)}>
          Next frame (M)
        </button>
        <button
          type="button"
          onClick={() => {
            shotsRef.current = shotsRef.current.slice(0, -1)
            setShotCount(shotsRef.current.length)
            setThumbs((prev) => prev.slice(0, -1))
            busyRef.current = false
            setBusy(false)
          }}
        >
          Retake last
        </button>
        <span>{status}</span>
      </div>
      {template.kind === 'strip6' && (
        <ol className="thumbs">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className={thumbs[i] ? 'filled' : ''}>
              {thumbs[i] ? <img src={thumbs[i]} alt="" /> : i + 1}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="error">{error}</p>}
      {busy && <p className="busy">Uploading…</p>}
      {shotCount > 0 && template.kind === 'single' && !busy && (
        <p className="busy">Shot captured</p>
      )}
    </main>
  )
}

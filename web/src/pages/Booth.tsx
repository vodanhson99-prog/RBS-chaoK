import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { uploadSession } from '../lib/api'
import { chooseDefaultCamera, listCameras, runCaptureLoop, startCamera, type CameraDevice } from '../lib/capture'
import { applyOverlay } from '../lib/overlay'
import { canvasToJpegBlob, composeStrip, loadTemplateAssets } from '../lib/compose'
import { drawBoothOverlay } from '../lib/drawOverlay'
import { cropTo169 } from '../lib/geom'
import { CAPTURE_INTERVAL_SECONDS, COUNTDOWN_SECONDS, evaluateInvertedS, STrigger } from '../lib/sPose'
import { nextTemplate, templateById } from '../lib/templates'

type Sticker = {
  id: number
  src: string
  x: number
  y: number
  width: number
  rotation: number
}

function drawStickerLayer(
  canvas: HTMLCanvasElement,
  items: Sticker[],
  images: Record<string, HTMLImageElement>,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  for (const item of items) {
    const image = images[item.src]
    if (!image?.complete || !image.naturalWidth) continue
    const width = canvas.width * item.width
    const height = width * (image.naturalHeight / image.naturalWidth)
    ctx.save()
    ctx.translate(canvas.width * item.x, canvas.height * item.y)
    ctx.rotate((item.rotation * Math.PI) / 180)
    ctx.drawImage(image, -width / 2, -height / 2, width, height)
    ctx.restore()
  }
}

const STICKERS = [
  { src: '/stickers/sticker-1.png', label: 'Rocket' },
  { src: '/stickers/sticker-2.png', label: 'Hero' },
  { src: '/stickers/sticker-3.png', label: 'RBS' },
  { src: '/stickers/sticker-4.png', label: 'Hero 2' },
  { src: '/stickers/laptop.png', label: 'RBS Laptop' },
  { src: '/stickers/rbs-bottle.png', label: 'RBS Bottle' },
]

export default function Booth() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const template = templateById(templateId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const stickerPanelRef = useRef<HTMLElement>(null)
  const triggerRef = useRef(new STrigger())
  const shotsRef = useRef<HTMLCanvasElement[]>([])
  const countdownEnd = useRef<number | null>(null)
  const lastCapture = useRef(0)
  const flashUntil = useRef(0)
  const capturing = useRef(false)
  const sequenceNextAt = useRef<number | null>(null)
  const busyRef = useRef(false)
  const stickersRef = useRef<Sticker[]>([])
  const stickerImagesRef = useRef<Record<string, HTMLImageElement>>({})

  const [stickers, setStickers] = useState<Sticker[]>([])
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [status, setStatus] = useState('Allow camera access')
  const [error, setError] = useState<string | null>(null)
  const [shotCount, setShotCount] = useState(0)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const statusRef = useRef(status)
  const countRef = useRef<number | null>(null)

  const needed = template.kind === 'strip' ? template.photoSlots?.length ?? 6 : 1

  useEffect(() => {
    shotsRef.current = []
    setShotCount(0)
    setThumbs([])
    setCount(null)
    setError(null)
    triggerRef.current.reset()
    countdownEnd.current = null
    sequenceNextAt.current = null
    capturing.current = false
    busyRef.current = false
    setBusy(false)
    stickersRef.current = []
    setStickers([])
  }, [template.id])

  useEffect(() => {
    let cancelled = false
    const video = videoRef.current!
    const overlay = overlayRef.current!
    let stop: (() => void) | undefined
    let stream: MediaStream | undefined

    const finishIfReady = async () => {
      if (shotsRef.current.length < needed || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        const assets = await loadTemplateAssets(template)
        const composed =
          template.kind === 'strip'
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

    const snap = (frame: HTMLCanvasElement) => {
      if (capturing.current || busyRef.current) return
      capturing.current = true
      const now = performance.now() / 1000
      lastCapture.current = now
      flashUntil.current = now + 0.25
      countdownEnd.current = null
      setCount(null)
      const shot = cropTo169(frame)
      drawStickerLayer(shot, stickersRef.current, stickerImagesRef.current)
      shotsRef.current = [...shotsRef.current, shot]
      const saved = shotsRef.current.length
      setShotCount(saved)
      setThumbs((prev) => [...prev, shot.toDataURL('image/jpeg', 0.55)])
      if (template.kind === 'strip' && saved < needed) {
        sequenceNextAt.current = now + CAPTURE_INTERVAL_SECONDS
      } else {
        sequenceNextAt.current = null
        triggerRef.current.reset()
      }
      capturing.current = false
      void finishIfReady()
    }

    const refreshCameras = async () => {
      try {
        const available = await listCameras()
        if (cancelled) return
        setCameras(available)
        if (!selectedCameraId) {
          const activeId = stream?.getVideoTracks()[0]?.getSettings().deviceId
          const nextId = chooseDefaultCamera(available, activeId)?.deviceId || ''
          if (nextId) setSelectedCameraId(nextId)
        } else if (!available.some((camera) => camera.deviceId === selectedCameraId)) {
          setSelectedCameraId(chooseDefaultCamera(available)?.deviceId || '')
        }
      } catch {
        if (!cancelled) setCameras([])
      }
    }

    const onDeviceChange = () => {
      void refreshCameras()
    }

    ;(async () => {
      try {
        await loadTemplateAssets(template)
        stream = await startCamera(video, selectedCameraId || undefined)
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        await refreshCameras()
        navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
        stop = await runCaptureLoop(video, overlay, ({ hands, now, frame }) => {
          const ctx = overlay.getContext('2d')
          if (!ctx) return
          ctx.drawImage(frame, 0, 0)

          const pose = evaluateInvertedS(hands, overlay.width, overlay.height)
          const inCooldown = now - lastCapture.current < 1.4
          let countdown: number | null = null
          let msg = 'Show both hands'

          if (busyRef.current) {
            msg = 'Uploading…'
            triggerRef.current.reset()
            countdownEnd.current = null
            sequenceNextAt.current = null
          } else if (sequenceNextAt.current !== null) {
            const remaining = sequenceNextAt.current - now
            if (remaining <= 0) {
              sequenceNextAt.current = null
              snap(frame)
              msg = `Saved ${shotsRef.current.length}/${needed}`
            } else {
              countdown = Math.max(1, Math.ceil(remaining))
              msg = `Pose for shot ${shotsRef.current.length + 1}/${needed}`
            }
          } else if (inCooldown) {
            triggerRef.current.reset()
            countdownEnd.current = null
            msg = `Saved ${shotsRef.current.length}/${needed}`
          } else if (countdownEnd.current) {
            const remaining = countdownEnd.current - now
            if (remaining <= 0) {
              snap(frame)
              msg = `Saved ${shotsRef.current.length}/${needed}`
            } else {
              countdown = Math.max(1, Math.ceil(remaining))
              msg = 'Inverted S locked — counting down'
            }
          } else if (template.kind === 'strip' && shotsRef.current.length > 0) {
            msg = `Saved ${shotsRef.current.length}/${needed}`
          } else {
            triggerRef.current.update(pose.match, now)
            if (triggerRef.current.locked) {
              countdownEnd.current = now + COUNTDOWN_SECONDS
              msg = 'Inverted S locked — counting down'
            } else if (hands.length < 2) {
              msg = 'Show both hands'
            } else if (!pose.match) {
              msg = 'Stack hands: top curves left, bottom curves right (inverted S)'
            } else {
              msg = 'Hold the inverted S'
            }
          }

          const flash = flashUntil.current > now ? (flashUntil.current - now) / 0.25 : 0
          drawBoothOverlay(
            ctx,
            overlay.width,
            overlay.height,
            hands,
            pose,
            triggerRef.current.dwellProgress(now),
            countdown,
            flash,
          )
          if (msg !== statusRef.current) {
            statusRef.current = msg
            setStatus(msg)
          }
          if (countdown !== countRef.current) {
            countRef.current = countdown
            setCount(countdown)
          }
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Camera failed')
      }
    })()

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'r' || ev.key === 'R') {
        triggerRef.current.reset()
        countdownEnd.current = null
        setCount(null)
      }
      if (ev.key === 'm' || ev.key === 'M') {
        navigate(`/booth/${nextTemplate(template.id).id}`)
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
      stop?.()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [template.id, template, needed, navigate, selectedCameraId])

  useEffect(() => {
    for (const sticker of STICKERS) {
      const image = new Image()
      image.src = sticker.src
      stickerImagesRef.current[sticker.src] = image
    }
  }, [])

  const addSticker = (src: string, x = 0.82, y = 0.2) => {
    const width = src === '/stickers/rbs-bottle.png' ? 0.05 : 0.18
    const next = [...stickersRef.current, { id: Date.now(), src, x, y, width, rotation: 0 }]
    stickersRef.current = next
    setStickers(next)
  }

  const removeSticker = (id: number) => {
    const next = stickersRef.current.filter((item) => item.id !== id)
    stickersRef.current = next
    setStickers(next)
  }

  const moveSticker = (id: number, clientX: number, clientY: number) => {
    const stage = stageRef.current
    const panel = stickerPanelRef.current
    if (panel) {
      const panelRect = panel.getBoundingClientRect()
      const insidePanel = clientX >= panelRect.left && clientX <= panelRect.right && clientY >= panelRect.top && clientY <= panelRect.bottom
      if (insidePanel) {
        removeSticker(id)
        return
      }
    }
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const next = stickersRef.current.map((item) => item.id === id
      ? { ...item, x: Math.max(0.08, Math.min(0.92, (clientX - rect.left) / rect.width)), y: Math.max(0.08, Math.min(0.92, (clientY - rect.top) / rect.height)) }
      : item)
    stickersRef.current = next
    setStickers(next)
  }

  const rotateSticker = (id: number, clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return
    const sticker = stickersRef.current.find((item) => item.id === id)
    if (!sticker) return
    const rect = stage.getBoundingClientRect()
    const centerX = rect.left + sticker.x * rect.width
    const centerY = rect.top + sticker.y * rect.height
    const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI) + 90
    const next = stickersRef.current.map((item) => item.id === id ? { ...item, rotation: angle } : item)
    stickersRef.current = next
    setStickers(next)
  }

  const handleStickerPointerMove = (event: ReactPointerEvent<HTMLElement>, stickerId: number, mode: 'move' | 'rotate') => {
    if (mode === 'rotate') rotateSticker(stickerId, event.clientX, event.clientY)
    else moveSticker(stickerId, event.clientX, event.clientY)
  }

  const resetPose = () => {
    triggerRef.current.reset()
    countdownEnd.current = null
    sequenceNextAt.current = null
    setCount(null)
  }

  const retakeLast = () => {
    shotsRef.current = shotsRef.current.slice(0, -1)
    setShotCount(shotsRef.current.length)
    setThumbs((prev) => prev.slice(0, -1))
    busyRef.current = false
    setBusy(false)
    resetPose()
  }

  const hearts = Array.from({ length: needed }, (_, i) => i < shotCount)

  return (
    <main className="booth-pixel">
      <div className="sky-deco" aria-hidden="true" />
      <header className="booth-hero">
        <p className="lives" aria-label={`${shotCount} of ${needed} shots`}>
          {hearts.map((on, i) => (
            <span key={i} className={on ? 'heart on' : 'heart'}>
              ♥
            </span>
          ))}
        </p>
        <h1 className="pixel-title">RBS PHOTOBOOTH</h1>
        <div className="meter" aria-hidden="true">
          {Array.from({ length: needed }, (_, i) => (
            <span key={i} className={i < shotCount ? 'seg filled' : 'seg'} />
          ))}
        </div>
      </header>

      <div className="booth-layout">
        <section className="win main-win">
          <header className="win-bar">
            <span>CAMERA</span>
            <span className="win-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </header>
          <div className="win-body">
            <div className="preview-stage sticker-stage" ref={stageRef}>
              <video ref={videoRef} playsInline muted className="hidden-video" />
              <canvas ref={overlayRef} className="stage" />
              {stickers.map((sticker) => (
                <div
                  key={sticker.id}
                  className="placed-sticker-wrap"
                  style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: `${sticker.width * 100}%`, transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)` }}
                >
                  <img className="placed-sticker" src={sticker.src} alt="" draggable={false} />
                  <button
                    type="button"
                    className="sticker-rotate-handle"
                    aria-label={`Rotate ${sticker.src}`}
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) handleStickerPointerMove(event, sticker.id, 'rotate')
                    }}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                  />
                  <div
                    className="sticker-drag-target"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) handleStickerPointerMove(event, sticker.id, 'move')
                    }}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="pixel-controls">
              <button type="button" className="px-btn stop" onClick={() => navigate('/')}>
                HOME
              </button>
              <button type="button" className="px-btn start" onClick={resetPose}>
                RESET
              </button>
              <button type="button" className="px-btn pause" onClick={retakeLast} disabled={shotCount === 0}>
                RETAKE
              </button>
            </div>
            <section className="win info-panel">
              <header className="win-bar">INFORMATION</header>
              <div className="win-body info-body">
                <p>
                  <strong>FRAME</strong>
                  <span>{template.name}</span>
                </p>
                <p>
                  <strong>STATUS</strong>
                  <span>{busy ? 'Uploading…' : status}</span>
                </p>
                <p>
                  <strong>SHOT</strong>
                  <span>
                    {shotCount}/{needed}
                    {count ? ` · ${count}` : ''}
                  </span>
                </p>
                <button
                  type="button"
                  className="px-btn ghost"
                  onClick={() => navigate(`/booth/${nextTemplate(template.id).id}`)}
                >
                  NEXT FRAME
                </button>
              </div>
            </section>
          </div>
        </section>

        <aside className="booth-side">
          <section className="win">
            <header className="win-bar">SHOT PREVIEW</header>
            <div className="win-body">
              {template.kind === 'strip' ? (
                <ol className="thumbs pixel-thumbs">
                  {Array.from({ length: needed }, (_, i) => (
                    <li key={i} className={thumbs[i] ? 'filled' : ''}>
                      {thumbs[i] ? <img src={thumbs[i]} alt="" /> : i + 1}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="side-note">1 shot · 16:9</p>
              )}
            </div>
          </section>
          <section className="win camera-panel">
            <header className="win-bar">CAMERA SOURCE</header>
            <div className="win-body camera-body">
              <label className="camera-picker">
                <span>SELECT INPUT</span>
                <select
                  value={selectedCameraId}
                  onChange={(event) => setSelectedCameraId(event.target.value)}
                  disabled={!cameras.length || busy}
                >
                  {!cameras.length && <option value="">Camera list unavailable</option>}
                  {cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="camera-help">USB webcam, HDMI capture card, or camera webcam mode.</p>
            </div>
          </section>
          <section className="win sticker-panel" ref={stickerPanelRef}>
            <header className="win-bar">STICKERS</header>
            <div className="win-body">
              <p className="side-note">Drag a sticker onto the camera</p>
              <div className="sticker-palette">
                {STICKERS.map((sticker) => (
                  <button
                    key={sticker.src}
                    type="button"
                    className="sticker-option"
                    draggable
                    onClick={() => addSticker(sticker.src)}
                    onDragEnd={(e) => {
                      const stage = stageRef.current
                      if (!stage) return
                      const rect = stage.getBoundingClientRect()
                      addSticker(sticker.src, Math.max(0.08, Math.min(0.92, (e.clientX - rect.left) / rect.width)), Math.max(0.08, Math.min(0.92, (e.clientY - rect.top) / rect.height)))
                    }}
                    title={`Add ${sticker.label}`}
                  >
                    <img
                      className={sticker.label === 'RBS Bottle' ? 'sticker-thumb bottle-thumb' : 'sticker-thumb'}
                      src={sticker.src}
                      alt={sticker.label}
                    />
                  </button>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </div>

      {error && <p className="error pixel-error">{error}</p>}
      <div className="cloud-band" aria-hidden="true" />
    </main>
  )
}

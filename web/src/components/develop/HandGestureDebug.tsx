'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyzeLetterSResult,
  analyzeLetterSPair,
  createGestureRecognizer,
  createLetterSStreakGate,
  HAND_CONNECTIONS,
  recognizeForVideoSafely,
  type LetterSAnalysis,
  type LetterSHandCandidate,
  type LetterSPairAnalysis,
} from '../../lib/gestures'
import { fetchBoothConfig, type BoothConfig } from '../../lib/api'
import {
  buildExamplePayload,
  captureGestureFrame,
  downloadAllExamples,
  downloadExample,
  downloadTextFile,
  type GestureExample,
  type GestureExampleLabel,
} from '../../lib/gestureExampleCapture'
import type { HandLandmark } from '../../lib/letterSGesture'

const DETECTION_INTERVAL_MS = 66

function drawHandOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  candidates: LetterSHandCandidate[],
  pair: LetterSPairAnalysis,
) {
  ctx.clearRect(0, 0, width, height)
  const selectedIndexes = new Set([pair.upperHandIndex, pair.lowerHandIndex])
  for (const candidate of candidates) {
    const { imageLandmarks } = candidate
    const selected = selectedIndexes.has(candidate.index)
    const color = selected ? (pair.pass ? '#3dff7a' : '#ff6117') : '#6b7280'
    const toX = (x: number) => x * width
    const toY = (y: number) => y * height

    ctx.strokeStyle = color
    ctx.lineWidth = selected ? 3 : 1.5
    ctx.lineCap = 'round'
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath()
      ctx.moveTo(toX(imageLandmarks[a].x), toY(imageLandmarks[a].y))
      ctx.lineTo(toX(imageLandmarks[b].x), toY(imageLandmarks[b].y))
      ctx.stroke()
    }

    ctx.fillStyle = color
    for (const lm of imageLandmarks) {
      ctx.beginPath()
      ctx.arc(toX(lm.x), toY(lm.y), selected ? 4 : 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    const wrist = imageLandmarks[0]
    ctx.save()
    ctx.translate(toX(wrist.x), toY(wrist.y) - 10)
    ctx.scale(-1, 1)
    ctx.font = '12px monospace'
    ctx.fillStyle = color
    ctx.fillText(`HAND ${candidate.index} C ${candidate.analysis.cShapeScore.toFixed(2)}`, 0, 0)
    ctx.restore()
  }

  if (pair.upperHandIndex !== null && pair.lowerHandIndex !== null) {
    const upper = candidates.find((candidate) => candidate.index === pair.upperHandIndex)
    const lower = candidates.find((candidate) => candidate.index === pair.lowerHandIndex)
    if (upper && lower) {
      ctx.save()
      ctx.strokeStyle = pair.pass ? '#3dff7a' : '#ff6117'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(upper.analysis.centerX * width, upper.analysis.centerY * height)
      ctx.lineTo(lower.analysis.centerX * width, lower.analysis.centerY * height)
      ctx.stroke()
      ctx.restore()
    }
  }
}

function MetricRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="hg-metric">
      <span className="hg-metric-label">{label}</span>
      <span className={`hg-metric-value${highlight ? ' hg-metric-value--pass' : ''}`}>{value}</span>
    </div>
  )
}

export default function HandGestureDebug() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gateRef = useRef(createLetterSStreakGate(4))
  const minConfidenceRef = useRef(0.78)
  const landmarksRef = useRef<HandLandmark[] | null>(null)
  const worldLandmarksRef = useRef<HandLandmark[] | null>(null)
  const candidatesRef = useRef<LetterSHandCandidate[]>([])
  const pairRef = useRef<LetterSPairAnalysis | null>(null)
  const analysisRef = useRef<LetterSAnalysis | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<LetterSAnalysis | null>(null)
  const [pair, setPair] = useState<LetterSPairAnalysis>(() => analyzeLetterSPair([], 0.78))
  const [candidates, setCandidates] = useState<LetterSHandCandidate[]>([])
  const [streak, setStreak] = useState(0)
  const [streakPass, setStreakPass] = useState(false)
  const [boothConfig, setBoothConfig] = useState<BoothConfig | null>(null)
  const [minConfidence, setMinConfidence] = useState(0.78)
  const [consecutiveFrames, setConsecutiveFrames] = useState(4)
  const [fps, setFps] = useState(0)
  const [examples, setExamples] = useState<GestureExample[]>([])
  const [captureLabel, setCaptureLabel] = useState<GestureExampleLabel>('auto-pass')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    void fetchBoothConfig()
      .then((cfg) => {
        setBoothConfig(cfg)
        setMinConfidence(cfg.gesture.minConfidence)
        setConsecutiveFrames(cfg.gesture.consecutiveFrames)
        gateRef.current = createLetterSStreakGate(cfg.gesture.consecutiveFrames)
      })
      .catch(() => {
        // debug page works without API — keep slider defaults
      })
  }, [])

  useEffect(() => {
    minConfidenceRef.current = minConfidence
  }, [minConfidence])

  useEffect(() => {
    gateRef.current = createLetterSStreakGate(consecutiveFrames)
  }, [consecutiveFrames])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let raf = 0
    let lastDetect = 0
    let frameCount = 0
    let fpsTick = performance.now()

    const run = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        await video.play()

        const recognizer = await createGestureRecognizer()
        if (stopped) return

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas 2d unavailable')

        const syncCanvas = () => {
          const w = video.videoWidth || 640
          const h = video.videoHeight || 480
          if (canvas.width !== w) canvas.width = w
          if (canvas.height !== h) canvas.height = h
        }

        const loop = (now: number) => {
          if (stopped) return
          raf = requestAnimationFrame(loop)

          frameCount += 1
          if (now - fpsTick >= 1000) {
            setFps(frameCount)
            frameCount = 0
            fpsTick = now
          }

          if (video.readyState < 2) return
          syncCanvas()

          if (now - lastDetect >= DETECTION_INTERVAL_MS) {
            lastDetect = now
            const result = recognizeForVideoSafely(recognizer, video, now)
            const nextCandidates = analyzeLetterSResult(result, minConfidenceRef.current)
            const nextPair = analyzeLetterSPair(nextCandidates, minConfidenceRef.current)
            const upperCandidate = nextPair.upperHandIndex === null
              ? null
              : nextCandidates.find((candidate) => candidate.index === nextPair.upperHandIndex) ?? null
            const next = upperCandidate?.analysis ?? null
            landmarksRef.current = upperCandidate?.imageLandmarks ?? null
            worldLandmarksRef.current = upperCandidate?.worldLandmarks ?? null
            candidatesRef.current = nextCandidates
            pairRef.current = nextPair
            analysisRef.current = next
            const gatePass = gateRef.current.update(nextPair.pass)
            setAnalysis(next)
            setPair(nextPair)
            setCandidates(nextCandidates)
            setStreak(gateRef.current.streak)
            setStreakPass(gatePass)
            drawHandOverlay(ctx, canvas.width, canvas.height, nextCandidates, nextPair)
          }
        }

        setStatus('ready')
        raf = requestAnimationFrame(loop)
      } catch (e) {
        setStatus('error')
        setError(e instanceof Error ? e.message : 'Camera / MediaPipe failed')
      }
    }

    void run()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const captureExample = useCallback(() => {
      const video = videoRef.current
      const canvas = canvasRef.current
      const analysis = analysisRef.current
      if (!video || !canvas || !analysis) return

      const imageUrl = captureGestureFrame(video, canvas)
      if (!imageUrl) return

      const label: GestureExampleLabel =
        captureLabel === 'truth-s' || captureLabel === 'truth-not-s'
          ? captureLabel
          : pair.pass
            ? 'auto-pass'
            : 'auto-fail'

      const example: GestureExample = {
        id: crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
        imageUrl,
        label,
        analysis,
        pair,
        landmarks: landmarksRef.current ? [...landmarksRef.current] : null,
        worldLandmarks: worldLandmarksRef.current ? [...worldLandmarksRef.current] : null,
        candidates: candidatesRef.current.map(({ index, handedness, analysis: candidateAnalysis, imageLandmarks, worldLandmarks }) => ({
          index,
          handedness,
          analysis: candidateAnalysis,
          imageLandmarks,
          worldLandmarks,
        })),
        minConfidence,
        consecutiveFrames,
      }

      setExamples((prev) => [example, ...prev])
      setFlash(true)
      window.setTimeout(() => setFlash(false), 120)
    },
    [minConfidence, consecutiveFrames, captureLabel, pair],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault()
      captureExample()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [captureExample])

  const updateExampleLabel = useCallback((id: string, label: GestureExampleLabel) => {
    setExamples((prev) => prev.map((ex) => (ex.id === id ? { ...ex, label } : ex)))
  }, [])

  const removeExample = useCallback((id: string) => {
    setExamples((prev) => prev.filter((ex) => ex.id !== id))
  }, [])

  const copySnapshot = useCallback(() => {
    if (!analysis) return
    const payload = {
      analysis,
      streak,
      streakPass,
      minConfidence,
      consecutiveFrames,
      boothConfig: boothConfig?.gesture ?? null,
      candidates: candidatesRef.current,
      pair: pairRef.current,
      sourceFile: 'web/src/lib/letterSGesture.ts',
      exports: ['analyzeLetterSResult', 'analyzeLetterSPair', 'analyzeLetterSGesture'],
      note: 'Overlay is mirrored for UI; scoring uses original/world coordinates and requires two C hands.',
    }
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
  }, [analysis, streak, streakPass, minConfidence, consecutiveFrames, boothConfig])

  const pass = pair.pass

  return (
    <div className="hg-page">
      <header className="hg-header">
        <p className="pixel-kicker">CONTROL ROOM / GESTURE INPUT</p>
        <h1 className="pixel-title">tune the S signal</h1>
        <p className="hg-sub">
          Logic: <code>web/src/lib/letterSGesture.ts</code>. Export{' '}
          <code>analyzeLetterSGesture</code>, <code>scoreLetterSGesture</code>
        </p>
      </header>

      <div className="hg-layout">
        <div className="hg-stage">
          <div className={`hg-video-wrap${flash ? ' hg-video-wrap--flash' : ''}`}>
            <video ref={videoRef} className="hg-video" playsInline muted />
            <canvas ref={canvasRef} className="hg-canvas" />
            <div className={`hg-verdict${pass ? ' hg-verdict--pass' : ''}`}>
              {status === 'loading' && 'loading…'}
              {status === 'error' && (error ?? 'error')}
              {status === 'ready' && (pass ? 'C + C → S' : 'not S')}
            </div>
          </div>
          <p className="hg-hint">
            Overlay mirror theo preview. Mỗi tay phải tạo một C; chỉ cặp hai tay đúng thứ tự, hướng ngược và khoảng cách chuẩn hóa mới pass.
          </p>
        </div>

        <aside className="hg-panel">
          <section className="hg-section">
            <h2 className="hg-section-title">Threshold (live)</h2>
            <label className="hg-slider">
              minConfidence: {minConfidence.toFixed(2)}
              <input
                type="range"
                min={0.05}
                max={0.98}
                step={0.01}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
              />
            </label>
            <label className="hg-slider">
              consecutiveFrames: {consecutiveFrames}
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={consecutiveFrames}
                onChange={(e) => setConsecutiveFrames(Number(e.target.value))}
              />
            </label>
            {boothConfig && (
              <p className="hg-api-note">
                API: hold {boothConfig.gesture.holdMs}ms · conf {boothConfig.gesture.minConfidence} · frames{' '}
                {boothConfig.gesture.consecutiveFrames}
              </p>
            )}
          </section>

          <section className="hg-section">
            <h2 className="hg-section-title">Score</h2>
            <div className="hg-score-bar">
              <div
                className={`hg-score-fill${pass ? ' hg-score-fill--pass' : ''}`}
                style={{ transform: `scaleX(${Math.min(1, analysis?.score ?? 0)})` }}
              />
            </div>
            <MetricRow label="pair score" value={pair.pairScore.toFixed(3)} highlight={pass} />
            <MetricRow label="streak" value={`${streak} / ${consecutiveFrames}${streakPass ? ' ✓ gate' : ''}`} />
            <MetricRow label="reject" value={pair.rejectReason ?? '—'} />
            <MetricRow label="hands" value={String(pair.handCount)} highlight={pair.handCount >= 2} />
            <MetricRow label="upper C / lower C" value={`${pair.upperC.toFixed(2)} / ${pair.lowerC.toFixed(2)}`} />
            <MetricRow label="dx / dy (hand)" value={`${pair.dx.toFixed(2)} / ${pair.dy.toFixed(2)}`} />
            <MetricRow label="opposite orientation" value={pair.oppositeOrientation ? 'yes' : 'no'} highlight={pair.oppositeOrientation} />
            <MetricRow label="silhouette" value={pair.silhouetteScore.toFixed(2)} />
            <MetricRow label="fps" value={String(fps)} />
          </section>

          <section className="hg-section">
            <h2 className="hg-section-title">Upper C diagnostics</h2>
            <MetricRow label="C shape score" value={(analysis?.cShapeScore ?? 0).toFixed(2)} highlight={analysis?.cHardRulesPassed} />
            <MetricRow label="mouth → palm / hand" value={(analysis?.openingGap ?? 0).toFixed(2)} />
            <MetricRow label="mouth → palm direction" value={analysis?.openingDirection ?? '—'} />
            <MetricRow label="orientation" value={`${(analysis?.orientationDeg ?? 0).toFixed(0)}°`} />
          </section>

          <section className="hg-section">
            <h2 className="hg-section-title">Fingers curl (0 to 1)</h2>
            <MetricRow label="index" value={(analysis?.fingers.index ?? 0).toFixed(2)} />
            <MetricRow label="middle" value={(analysis?.fingers.middle ?? 0).toFixed(2)} />
            <MetricRow label="ring" value={(analysis?.fingers.ring ?? 0).toFixed(2)} />
            <MetricRow label="pinky" value={(analysis?.fingers.pinky ?? 0).toFixed(2)} />
            <MetricRow label="curlScore" value={(analysis?.curlScore ?? 0).toFixed(2)} />
            <MetricRow label="minFingerCurl" value={(analysis?.minFingerCurl ?? 0).toFixed(2)} />
            <MetricRow label="index PIP / DIP" value={`${(analysis?.fingerAngles.index.pip ?? 0).toFixed(0)}° / ${(analysis?.fingerAngles.index.dip ?? 0).toFixed(0)}°`} />
            <MetricRow label="middle PIP / DIP" value={`${(analysis?.fingerAngles.middle.pip ?? 0).toFixed(0)}° / ${(analysis?.fingerAngles.middle.dip ?? 0).toFixed(0)}°`} />
            <MetricRow label="ring PIP / DIP" value={`${(analysis?.fingerAngles.ring.pip ?? 0).toFixed(0)}° / ${(analysis?.fingerAngles.ring.dip ?? 0).toFixed(0)}°`} />
            <MetricRow label="pinky PIP / DIP" value={`${(analysis?.fingerAngles.pinky.pip ?? 0).toFixed(0)}° / ${(analysis?.fingerAngles.pinky.dip ?? 0).toFixed(0)}°`} />
          </section>

          <section className="hg-section">
            <h2 className="hg-section-title">Palm geometry</h2>
            <MetricRow label="thumb / opening score" value={(analysis?.thumbScore ?? 0).toFixed(2)} />
            <MetricRow label="thumb tucked" value={analysis?.thumbTucked ? 'yes' : 'no'} />
            <MetricRow label="thumb extended" value={analysis?.thumbExtended ? 'yes' : 'no'} />
            <MetricRow label="thumb→index PIP" value={(analysis?.thumbFeatures.toIndexPip ?? 0).toFixed(2)} />
            <MetricRow label="thumb→index DIP" value={(analysis?.thumbFeatures.toIndexDip ?? 0).toFixed(2)} />
            <MetricRow label="thumb→middle PIP" value={(analysis?.thumbFeatures.toMiddlePip ?? 0).toFixed(2)} />
            <MetricRow label="thumb→middle DIP" value={(analysis?.thumbFeatures.toMiddleDip ?? 0).toFixed(2)} />
            <MetricRow label="palmWidth" value={(analysis?.palmWidth ?? 0).toFixed(3)} />
            <MetricRow label="palmPitchDeg" value={`${(analysis?.palmPitchDeg ?? 0).toFixed(1)}°`} />
            <MetricRow label="wrist→middle dy" value={(analysis?.wristToMiddleDy ?? 0).toFixed(3)} />
            <MetricRow label="wrist→middle dz" value={(analysis?.wristToMiddleDz ?? 0).toFixed(3)} />
            <MetricRow label="palm normal" value={`${(analysis?.palmNormal.x ?? 0).toFixed(2)}, ${(analysis?.palmNormal.y ?? 0).toFixed(2)}, ${(analysis?.palmNormal.z ?? 0).toFixed(2)}`} />
          </section>

          <button type="button" className="pixel-btn hg-copy" onClick={copySnapshot} disabled={!analysis}>
            copy JSON snapshot
          </button>

          <section className="hg-section">
            <h2 className="hg-section-title">Chụp example</h2>
            <div className="hg-capture-labels">
              {(
                [
                  ['auto-pass', 'auto pass'],
                  ['auto-fail', 'auto fail'],
                  ['truth-s', 'ground truth S'],
                  ['truth-not-s', 'ground truth not S'],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  className={`pixel-btn pixel-btn--ghost hg-label-btn${captureLabel === value ? ' hg-label-btn--active' : ''}`}
                  onClick={() => setCaptureLabel(value)}
                >
                  {text}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="pixel-btn hg-copy"
              disabled={status !== 'ready'}
              onClick={() => captureExample()}
            >
              chụp (Space)
            </button>
            <p className="hg-api-note">Save JPG and landmark JSON. Use ground truth when the detector misses.</p>
          </section>

          {candidates.length > 0 && (
            <section className="hg-section">
              <h2 className="hg-section-title">All detected hands</h2>
              {candidates.map((candidate) => (
                <div key={candidate.index} className="hg-candidate-row">
                  <span>HAND {candidate.index} · {candidate.handedness ?? 'unknown'} · {candidate.analysis.openingDirection} C</span>
                  <span className={candidate.analysis.cHardRulesPassed ? 'hg-metric-value--pass' : ''}>
                    C {candidate.analysis.cShapeScore.toFixed(3)} {candidate.analysis.rejectReason ?? 'C PASS'}
                  </span>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>

      {examples.length > 0 && (
        <section className="hg-examples">
          <div className="hg-examples-head">
            <h2 className="hg-section-title">Examples ({examples.length})</h2>
            <div className="hg-examples-actions">
              <button
                type="button"
                className="pixel-btn pixel-btn--ghost"
                onClick={() =>
                  downloadTextFile(
                    `gesture-examples-${Date.now()}.json`,
                    JSON.stringify(examples.map(buildExamplePayload), null, 2),
                  )
                }
              >
                export manifest JSON
              </button>
              <button type="button" className="pixel-btn pixel-btn--ghost" onClick={() => downloadAllExamples(examples)}>
                download all JPG+JSON
              </button>
              <button type="button" className="pixel-btn pixel-btn--ghost" onClick={() => setExamples([])}>
                xóa hết
              </button>
            </div>
          </div>
          <div className="hg-examples-grid">
            {examples.map((ex) => (
              <article key={ex.id} className="hg-example-card">
                <img src={ex.imageUrl} alt="" className="hg-example-img" />
                <div className="hg-example-meta">
                  <span className={`hg-example-badge hg-example-badge--${ex.label}`}>{ex.label}</span>
                  <span className="hg-example-score">pair {ex.pair.pairScore.toFixed(2)}</span>
                  <span className="hg-example-score">hands {ex.pair.handCount}</span>
                </div>
                <select
                  className="hg-example-select"
                  value={ex.label}
                  onChange={(e) => updateExampleLabel(ex.id, e.target.value as GestureExampleLabel)}
                >
                  <option value="auto-pass">auto pass</option>
                  <option value="auto-fail">auto fail</option>
                  <option value="truth-s">ground truth S</option>
                  <option value="truth-not-s">ground truth not S</option>
                </select>
                <div className="hg-example-actions">
                  <button type="button" className="pixel-btn pixel-btn--ghost" onClick={() => downloadExample(ex)}>
                    JPG+JSON
                  </button>
                  <button type="button" className="pixel-btn pixel-btn--ghost" onClick={() => removeExample(ex.id)}>
                    xóa
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

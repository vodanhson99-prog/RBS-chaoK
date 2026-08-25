'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useBoothSession, type CapturePhase } from '../features/booth/useBoothSession'
import { frameById, useFrameCatalog } from '../lib/frameCatalog'
import { templateShotCount } from '../lib/templates'
import type { BoothConfig } from '../lib/api'
import RbsPrinterReveal from './RbsPrinterReveal'

const STEPS: { id: CapturePhase | 'cooldown'; label: string; match: CapturePhase[] }[] = [
  { id: 'ready', label: 'S', match: ['ready', 'loading'] },
  { id: 'holding', label: 'HOLD', match: ['holding'] },
  { id: 'countdown', label: 'POSE', match: ['countdown'] },
  { id: 'cooldown', label: 'GO', match: ['cooldown', 'busy', 'printing'] },
]

function stepActive(step: (typeof STEPS)[number], phase: CapturePhase): boolean {
  return step.match.includes(phase)
}

function stepDone(step: (typeof STEPS)[number], phase: CapturePhase): boolean {
  const order = ['loading', 'ready', 'holding', 'countdown', 'cooldown', 'busy', 'printing']
  const phaseIdx = order.indexOf(phase)
  const stepIdx = order.indexOf(step.match[0])
  return phaseIdx > stepIdx && phase !== 'loading'
}

export default function Booth({
  templateId,
  boothConfig,
  apiUnavailable = false,
}: {
  templateId: string
  boothConfig: BoothConfig
  apiUnavailable?: boolean
}) {
  const { frames } = useFrameCatalog()
  const template = frameById(templateId, frames)
  const session = useBoothSession(template, boothConfig)
  const needed = templateShotCount(template)
  const progress = needed > 1 ? session.shotCount / needed : session.phase === 'cooldown' ? 1 : 0

  return (
    <main className="booth booth-pixel">
      {session.printing && session.printPreview && (
        <RbsPrinterReveal imageSrc={session.printPreview} onComplete={session.handlePrintComplete} />
      )}

      <header className="booth-pixel__head">
        {process.env.NODE_ENV === 'development' && (
          <div className="booth-dev-config" aria-live="polite">
            <span>HOLD {boothConfig.gesture.holdMs}ms</span>
            <span>CONF {boothConfig.gesture.minConfidence.toFixed(2)}</span>
            <span>FR {boothConfig.gesture.consecutiveFrames}</span>
          </div>
        )}
        <Link className="pixel-btn pixel-btn--ghost" href="/">
          ← FRAMES
        </Link>
        <div className="booth-pixel__frame-chip">
          <Image src={template.thumbnailSrc} alt="" width={48} height={32} className="pixel-thumb" unoptimized />
          <span>{template.name}</span>
        </div>
        <span className="pixel-badge">{needed > 1 ? `×${needed}` : '1×'}</span>
      </header>

      <div className="booth-pixel__stage">
        <div className="booth-pixel__scanlines" aria-hidden />
        <video ref={session.videoRef} playsInline muted className="stage booth-video" />
        <canvas ref={session.overlayRef} className="stage booth-overlay" />

        <div className="booth-pixel__hud" aria-live="polite">
          <ol className="booth-pixel__steps">
            {STEPS.map((step) => (
              <li
                key={step.label}
                className={[
                  stepActive(step, session.phase) ? 'is-active' : '',
                  stepDone(step, session.phase) ? 'is-done' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
          <p className="booth-pixel__status">{session.status}</p>
        </div>
      </div>

      <footer className="booth-pixel__dock">
        {needed > 1 && (
          <div className="booth-pixel__strip">
            <div className="booth-pixel__strip-label">
              <span className="pixel-kicker">STRIP</span>
              <span>
                {session.shotCount}/{needed}
              </span>
            </div>
            <div className="pixel-progress">
              <div
                className="pixel-progress__fill"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
            <ol className="thumbs thumbs--pixel">
              {Array.from({ length: needed }, (_, i) => (
                <li key={i} className={session.thumbs[i] ? 'filled' : ''}>
                  {session.thumbs[i] ? <img src={session.thumbs[i]} alt="" /> : i + 1}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="booth-pixel__actions">
          <button
            type="button"
            className="pixel-btn pixel-btn--ghost"
            onClick={session.retakeLast}
            disabled={session.busy || session.shotCount === 0}
          >
            RETAKE
          </button>
        </div>

        {apiUnavailable && !session.error && (
          <p className="booth-pixel__notice">API offline. Camera preview still works.</p>
        )}
        {session.error && <p className="error">{session.error}</p>}
      </footer>
    </main>
  )
}

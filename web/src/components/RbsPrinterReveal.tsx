'use client'

import { useEffect, useState } from 'react'

type Props = {
  imageSrc: string
  onComplete: () => void
}

const PRINT_MS = 3600
const HOLD_MS = 500

export default function RbsPrinterReveal({ imageSrc, onComplete }: Props) {
  const [phase, setPhase] = useState<'warmup' | 'printing' | 'done'>('warmup')

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      setPhase('done')
      const timer = window.setTimeout(onComplete, 700)
      return () => window.clearTimeout(timer)
    }

    const warmupTimer = window.setTimeout(() => setPhase('printing'), 420)
    const doneTimer = window.setTimeout(() => setPhase('done'), PRINT_MS)
    const exitTimer = window.setTimeout(onComplete, PRINT_MS + HOLD_MS)

    return () => {
      window.clearTimeout(warmupTimer)
      window.clearTimeout(doneTimer)
      window.clearTimeout(exitTimer)
    }
  }, [onComplete])

  return (
    <div className="printer-overlay" role="dialog" aria-modal="true" aria-label="Printing your photo">
      <div className="printer-scene">
        <div className={`printer-unit ${phase !== 'warmup' ? 'is-active' : ''} ${phase === 'done' ? 'is-done' : ''}`}>
          <div className="printer-top">
            <span className="printer-led" aria-hidden="true" />
            <span className="printer-status-text">
              {phase === 'done' ? 'Done' : phase === 'printing' ? 'Printing…' : 'Preparing…'}
            </span>
          </div>
          <div className="printer-face">
            <p className="printer-brand">RBS Printer</p>
            <div className="printer-slot" aria-hidden="true" />
          </div>
          <div className="printer-output-track">
            <img
              className={`printer-photo ${phase === 'printing' || phase === 'done' ? 'is-ejecting' : ''}`}
              src={imageSrc}
              alt="Your photobooth print emerging from the printer"
            />
          </div>
        </div>
        <p className="printer-caption">Your print is on the way</p>
      </div>
    </div>
  )
}

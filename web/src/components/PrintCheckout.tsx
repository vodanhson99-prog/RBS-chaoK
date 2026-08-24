'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  createPrintJob,
  fetchPrintConfig,
  fetchPrintJob,
  formatMoney,
  payPrintJobMock,
  type PrintConfig,
  type PrintJob,
} from '../lib/api'

type Props = {
  token: string
}

export default function PrintCheckout({ token }: Props) {
  const [config, setConfig] = useState<PrintConfig | null>(null)
  const [size, setSize] = useState<'4x6' | '6x8'>('4x6')
  const [quantity, setQuantity] = useState(1)
  const [job, setJob] = useState<PrintJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchPrintConfig().then(setConfig).catch(() => setError('Could not load print prices'))
  }, [])

  const pollJob = useCallback(async (jobId: string) => {
    const latest = await fetchPrintJob(jobId)
    setJob(latest)
    return latest
  }, [])

  useEffect(() => {
    if (!job?.id || job.printStatus === 'completed' || job.printStatus === 'failed') return
    const timer = window.setInterval(() => {
      void pollJob(job.id).catch(() => {})
    }, 2500)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.printStatus, pollJob])

  const selected = config?.sizes.find((entry) => entry.id === size)
  const total = (selected?.priceCents ?? 0) * quantity

  const startPrint = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await createPrintJob(token, { quantity, size })
      setJob(created)
      if (config?.paymentMode === 'mock') {
        const paid = await payPrintJobMock(created.id)
        setJob(paid)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start print')
    } finally {
      setBusy(false)
    }
  }

  const paid = job?.paymentStatus === 'paid'
  const done = job?.printStatus === 'completed'
  const failed = job?.printStatus === 'failed'

  return (
    <section className="print-checkout pixel-card">
      <header className="print-checkout__head">
        <p className="pixel-kicker">RBS PRINT</p>
        <h2 className="pixel-title">order prints</h2>
        <p className="picker-sub">Download is free. Printing is paid at the booth.</p>
      </header>

      {!job && config && (
        <>
          <div className="print-checkout__sizes">
            {config.sizes.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`pixel-btn pixel-btn--ghost print-size${size === entry.id ? ' is-active' : ''}`}
                onClick={() => setSize(entry.id)}
              >
                {entry.label}
                <span>{formatMoney(entry.priceCents, config.currency)}</span>
              </button>
            ))}
          </div>

          <label className="hg-slider print-checkout__qty">
            quantity: {quantity}
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>

          <p className="print-checkout__total">
            Total: <strong>{formatMoney(total, config.currency)}</strong>
          </p>

          <button type="button" className="pixel-btn" disabled={busy} onClick={() => void startPrint()}>
            {busy ? 'PROCESSING…' : 'PAY & PRINT'}
          </button>
        </>
      )}

      {job && (
        <div className="print-checkout__status">
          <p>
            Job <code>{job.id.slice(0, 8)}</code>
          </p>
          <p>Payment: {job.paymentStatus}</p>
          <p>Print: {job.printStatus}</p>
          {paid && !done && !failed && <p className="picker-sub">Queued for booth printer…</p>}
          {done && <p className="hg-metric-value--pass">Print completed ✓</p>}
          {failed && <p className="error">{job.lastError || 'Print failed'}</p>}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <p className="photo-view__home">
        <Link href={`/p/${token}`}>← back to photo</Link>
      </p>
    </section>
  )
}

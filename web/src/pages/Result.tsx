import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { fetchSession, requestPrint, sessionImageUrl, shareOrigin } from '../lib/api'

type PrintState = 'idle' | 'form' | 'pin' | 'pending' | 'printing' | 'done' | 'error'

export default function Result() {
  const { token = '' } = useParams()
  const loc = useLocation() as { state?: { preview?: string } }
  const [qr, setQr] = useState<string>('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = loc.state?.preview

  const [printState, setPrintState] = useState<PrintState>('idle')
  const [customerName, setCustomerName] = useState('')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [printMsg, setPrintMsg] = useState('')
  const [printFile, setPrintFile] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await fetchSession(token)
        const origin = await shareOrigin()
        const url = `${origin}/p/${token}`
        const dataUrl = await QRCode.toDataURL(url, { width: 360, margin: 1 })
        if (!alive) return
        setShareUrl(url)
        setQr(dataUrl)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load session')
      }
    })()
    return () => {
      alive = false
    }
  }, [token])

  const handleConfirmPrint = async () => {
    if (!customerName.trim()) return
    setPin('')
    setPinError('')
    setPrintState('pin')
  }

  const handlePinSubmit = async () => {
    if (pin !== '090909') {
      setPinError('Incorrect PIN')
      return
    }
    setPrintState('printing')
    setPrintMsg('')
    try {
      const result = await requestPrint(token, customerName.trim())
      setPrintState('done')
      setPrintFile(result.file || '')
      setPrintMsg('Print request sent successfully!')
    } catch (e) {
      setPrintState('error')
      setPrintMsg(e instanceof Error ? e.message : 'Print failed')
    }
  }

  return (
    <main className="booth-pixel result-pixel">
      <div className="sky-deco" aria-hidden="true" />
      <header className="booth-hero">
        <h1 className="pixel-title">SCAN TO KEEP IT</h1>
      </header>

      <div className="booth-layout">
        <section className="win main-win">
          <header className="win-bar">
            <span>YOUR PRINT</span>
            <span className="win-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </header>
          <div className="win-body">
            <div className="preview-stage print-pair">
              <img
                className="preview lean-left"
                src={preview || sessionImageUrl(token)}
                alt="Your photobooth print"
              />
              <img
                className="preview lean-right"
                src={preview || sessionImageUrl(token)}
                alt=""
                aria-hidden="true"
              />
            </div>
          </div>
        </section>

        <aside className="booth-side">
          <section className="win">
            <header className="win-bar">Download QR Code</header>
            <div className="win-body qr-pane">
              {qr ? <img src={qr} alt="QR code" /> : <p className="side-note">Making QR…</p>}
              <p className="url">{shareUrl || '…'}</p>
            </div>
          </section>

          {/* Print / Payment panel */}
          <section className="win print-panel">
            <header className="win-bar">Print</header>
            <div className="win-body">
              {printState === 'idle' && (
                <button
                  type="button"
                  className="px-btn start full-w"
                  onClick={() => setPrintState('form')}
                >
                  Print
                </button>
              )}

              {(printState === 'form' || printState === 'pending') && (
                <div className="print-form">
                  <img
                    className="payment-qr"
                    src="/payment-qr.png"
                    alt="Payment QR code"
                  />
                  <p className="side-note" style={{ textAlign: 'center', margin: '8px 0' }}>
SCAN TO PAY FOR PRINTING
                  </p>
                  <input
                    className="print-name-input"
                    type="text"
                    placeholder="Enter customer name..."
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    maxLength={60}
                  />
                  <button
                    type="button"
                    className="px-btn start full-w"
                    disabled={!customerName.trim()}
                    onClick={handleConfirmPrint}
                  >
                    CONFIRM PAYMENT & PRINT
                  </button>
                  <button
                    type="button"
                    className="px-btn stop full-w"
                    onClick={() => { setPrintState('idle'); setCustomerName('') }}
                  >
                    CANCEL
                  </button>
                </div>
              )}

              {printState === 'pin' && (
                <div className="print-form">
                  <p className="side-note" style={{ textAlign: 'center' }}>
                    ENTER STAFF PIN TO PRINT
                  </p>
                  <input
                    className="print-name-input"
                    type="password"
                    inputMode="numeric"
                    placeholder="Enter PIN..."
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setPinError('') }}
                    maxLength={6}
                    autoFocus
                  />
                  {pinError && <p className="side-note print-error">{pinError}</p>}
                  <button
                    type="button"
                    className="px-btn start full-w"
                    disabled={pin.length !== 6}
                    onClick={handlePinSubmit}
                  >
                    VERIFY & PRINT
                  </button>
                  <button
                    type="button"
                    className="px-btn stop full-w"
                    onClick={() => { setPrintState('form'); setPin(''); setPinError('') }}
                  >
                    BACK
                  </button>
                </div>
              )}

              {printState === 'printing' && (
                <p className="side-note" style={{ textAlign: 'center' }}>PRINTING...</p>
              )}

              {printState === 'done' && (
                <div className="print-done">
                  <p className="side-note print-success">{printMsg}</p>
                  {printFile && <p className="url">{printFile}</p>}
                  <button
                    type="button"
                    className="px-btn pause full-w"
                    onClick={() => { setPrintState('idle'); setCustomerName(''); setPrintMsg('') }}
                  >
                    PRINT ANOTHER
                  </button>
                </div>
              )}

              {printState === 'error' && (
                <div className="print-done">
                  <p className="side-note print-error">{printMsg}</p>
                  <button
                    type="button"
                    className="px-btn pause full-w"
                    onClick={() => setPrintState('form')}
                  >
                    TRY AGAIN
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="win">
            <header className="win-bar">ACTIONS</header>
            <div className="win-body result-actions">
              <button
                type="button"
                className="px-btn start"
                disabled={!shareUrl}
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl)
                  setCopied(true)
                }}
              >
                {copied ? 'COPIED' : 'COPY LINK'}
              </button>
              <Link className="px-btn pause" to={`/p/${token}`}>
                DOWNLOAD
              </Link>
              <Link className="px-btn stop" to="/">
                NEW SESSION
              </Link>
            </div>
          </section>
        </aside>
      </div>

      {error && <p className="error pixel-error">{error}</p>}
      <div className="cloud-band" aria-hidden="true" />
    </main>
  )
}

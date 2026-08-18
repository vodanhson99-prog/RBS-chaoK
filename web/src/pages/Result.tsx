import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { fetchSession, sessionImageUrl, shareOrigin } from '../lib/api'

export default function Result() {
  const { token = '' } = useParams()
  const loc = useLocation() as { state?: { preview?: string } }
  const [qr, setQr] = useState<string>('')
  const [shareUrl, setShareUrl] = useState('')
  const [expires, setExpires] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const preview = loc.state?.preview

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const meta = await fetchSession(token)
        const origin = await shareOrigin()
        const url = `${origin}/p/${token}`
        const dataUrl = await QRCode.toDataURL(url, { width: 360, margin: 1 })
        if (!alive) return
        setShareUrl(url)
        setQr(dataUrl)
        setExpires(new Date(meta.expiresAt).toLocaleString())
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load session')
      }
    })()
    return () => {
      alive = false
    }
  }, [token])

  return (
    <main className="page result">
      <h1>Scan to keep it</h1>
      <p className="lede">
        iPhone and PC must be on the same Wi-Fi. This link expires {expires || 'soon'}.
      </p>
      <div className="result-grid">
        <img className="preview" src={preview || sessionImageUrl(token)} alt="Your photobooth print" />
        <div className="qr-pane">
          {qr ? <img src={qr} alt="QR code" /> : <p>Making QR…</p>}
          <p className="url">{shareUrl || '…'}</p>
          <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl)} disabled={!shareUrl}>
            Copy link
          </button>
          <Link className="btn" to={`/p/${token}`}>
            Open download page
          </Link>
          <Link className="btn ghost" to="/">
            New session
          </Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  )
}

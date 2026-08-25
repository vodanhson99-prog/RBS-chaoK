'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { fetchPhoto, photoImageUrl, shareOrigin } from '../lib/api'
import { isAbortError } from '../lib/abort'

export default function Result() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''
  const [qr, setQr] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [expires, setExpires] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setPreview(sessionStorage.getItem(`photobooth-preview:${token}`))
    void (async () => {
      try {
        const meta = await fetchPhoto(token)
        if (!active) return
        const origin = await shareOrigin()
        if (!active) return
        const url = `${origin}/p/${token}`
        const dataUrl = await QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#252525', light: '#ffffff' } })
        if (!active) return
        setShareUrl(url)
        setQr(dataUrl)
        setExpires(new Date(meta.expiresAt).toLocaleString())
      } catch (e) {
        if (active && !isAbortError(e)) {
          setError(e instanceof Error ? e.message : 'Could not load session')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [token])

  return (
    <main className="page result">
      <div className="pixel-grid-bg" aria-hidden />

      <header className="picker-head">
        <p className="pixel-kicker">SESSION READY / QR HANDOFF</p>
        <h1 className="pixel-title">keep the signal</h1>
        <p className="picker-sub">Scan on your phone. Stay on the same Wi-Fi. Link expires {expires || 'soon'}.</p>
      </header>

      <div className="result-grid">
        <Image
          className="preview"
          src={preview || photoImageUrl(token)}
          alt="Your photobooth print"
          width={1200}
          height={900}
          unoptimized={!preview}
        />
        <div className="qr-pane">
          {qr ? <img src={qr} alt="QR code" /> : <p className="lede">Making QR code...</p>}
          <p className="url">{shareUrl || '…'}</p>
          <div className="action-row">
            <button
              type="button"
              className="pixel-btn"
              onClick={async () => {
                if (!shareUrl || !navigator.clipboard) return
                try {
                  await navigator.clipboard.writeText(shareUrl)
                } catch {
                  setError('Clipboard unavailable. Copy the link manually.')
                }
              }}
              disabled={!shareUrl || !navigator.clipboard}
            >
              COPY LINK
            </button>
            <Link className="pixel-btn pixel-btn--ghost" href={`/edit/${token}`}>
              EDIT
            </Link>
            <Link className="pixel-btn pixel-btn--ghost" href={`/p/${token}`}>
              OPEN PHONE
            </Link>
            <Link className="pixel-btn" href="/">
              NEW FRAME
            </Link>
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  )
}

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchSession, sessionImageUrl, type SessionMeta } from '../lib/api'

export default function Download() {
  const { token = '' } = useParams()
  const [meta, setMeta] = useState<SessionMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchSession(token)
      .then((m) => {
        if (alive) setMeta(m)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Not found')
      })
    return () => {
      alive = false
    }
  }, [token])

  const src = sessionImageUrl(token)

  return (
    <main className="page download">
      <p className="eyebrow">Your photobooth print</p>
      <h1>Download</h1>
      {error && (
        <p className="error">
          {error}. Links expire after 48 hours.
        </p>
      )}
      {meta && (
        <>
          <p className="lede">Expires {new Date(meta.expiresAt).toLocaleString()}</p>
          <img className="preview wide" src={src} alt="Photobooth photo" />
          <p>
            <a className="btn" href={src} download={`photobooth-${token}.jpg`}>
              Download JPEG
            </a>
            {typeof navigator.share === 'function' && (
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  const blob = await fetch(src).then((r) => r.blob())
                  const file = new File([blob], `photobooth-${token}.jpg`, { type: 'image/jpeg' })
                  await navigator.share({ files: [file], title: 'Photobooth' })
                }}
              >
                Share
              </button>
            )}
          </p>
        </>
      )}
      <p>
        <Link to="/">Make another</Link>
      </p>
    </main>
  )
}

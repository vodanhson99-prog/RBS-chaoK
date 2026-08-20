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
    <main className="booth-pixel result-pixel">
      <div className="sky-deco" aria-hidden="true" />
      <header className="booth-hero">
        <h1 className="pixel-title">DOWNLOAD</h1>
      </header>

      <div className="booth-layout download-layout">
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
            {error && (
              <p className="error">
                {error}. Links expire after 48 hours.
              </p>
            )}
            {meta && (
              <div className="preview-stage">
                <img className="preview wide" src={src} alt="Photobooth photo" />
              </div>
            )}
            <div className="result-actions">
              {meta && (
                <>
                  <a className="px-btn start" href={src} download={`photobooth-${token}.jpg`}>
                    DOWNLOAD JPEG
                  </a>
                  {typeof navigator.share === 'function' && (
                    <button
                      type="button"
                      className="px-btn pause"
                      onClick={async () => {
                        const blob = await fetch(src).then((r) => r.blob())
                        const file = new File([blob], `photobooth-${token}.jpg`, { type: 'image/jpeg' })
                        await navigator.share({ files: [file], title: 'Photobooth' })
                      }}
                    >
                      SHARE
                    </button>
                  )}
                </>
              )}
              <Link className="px-btn stop" to="/">
                HOME
              </Link>
            </div>
          </div>
        </section>
      </div>
      <div className="cloud-band" aria-hidden="true" />
    </main>
  )
}

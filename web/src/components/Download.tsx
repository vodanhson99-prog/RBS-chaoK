'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { fetchPhoto, photoImageUrl, type PhotoMeta } from '../lib/api'
import { isAbortError } from '../lib/abort'
import { downloadPhotoFile, sharePhotoFile } from '../lib/download'

export default function Download() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''
  const [meta, setMeta] = useState<PhotoMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const src = `${photoImageUrl(token)}?v=${meta?.hasEdit ? 'edit' : 'orig'}`

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void fetchPhoto(token, controller.signal)
      .then((nextMeta) => {
        if (active) setMeta(nextMeta)
      })
      .catch((e) => {
        if (active && !isAbortError(e)) {
          setError(e instanceof Error ? e.message : 'Not found')
        }
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [token])

  return (
    <main className="page photo-view">
      <div className="pixel-grid-bg" aria-hidden />

      <header className="picker-head">
        <p className="pixel-kicker">RBS PHOTOBOOTH</p>
        <h1 className="pixel-title">your photo</h1>
        {meta && (
          <p className="picker-sub">
            {meta.hasEdit ? 'Showing your edited version' : 'Original capture'} · link expires{' '}
            {new Date(meta.expiresAt).toLocaleString()}
          </p>
        )}
      </header>

      {error && <p className="error">{error}</p>}
      {shareNote && <p className="picker-sub">{shareNote}</p>}

      {meta && (
        <>
          <div className="photo-view__preview-wrap pixel-card">
            <Image
              className="preview wide"
              src={src}
              alt="Your photobooth photo"
              width={2560}
              height={1440}
              unoptimized
            />
          </div>

          <div className="photo-view__actions">
            <Link className="pixel-btn" href={`/edit/${token}`}>
              ADD STICKERS
            </Link>
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost"
              onClick={async () => {
                try {
                  await downloadPhotoFile(token, meta.hasEdit)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Download failed')
                }
              }}
            >
              DOWNLOAD
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost"
              onClick={async () => {
                try {
                  const result = await sharePhotoFile(token, meta.hasEdit)
                  setShareNote(result === 'shared' ? 'Shared via your device' : 'Share unavailable — downloaded instead')
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Share failed')
                }
              }}
            >
              SHARE
            </button>
            <Link className="pixel-btn" href={`/p/${token}/print`}>
              PRINT
            </Link>
          </div>
        </>
      )}

      <p className="photo-view__home">
        <Link href="/">← pick another frame</Link>
      </p>
    </main>
  )
}

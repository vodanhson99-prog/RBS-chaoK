import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadTemplateAssets } from '../lib/compose'
import { TEMPLATES } from '../lib/templates'

export default function Home() {
  const [previews, setPreviews] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      const next: Record<string, string> = {}
      for (const t of TEMPLATES) {
        const { overlay } = await loadTemplateAssets(t)
        next[t.id] = overlay.toDataURL('image/png')
      }
      if (alive) setPreviews(next)
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">RBS-PUBLIC PHOTOBOOTH</p>
        <h1>Draw a frame. Take the strip. Scan the QR.</h1>
        <p className="lede">
          Index fingertip pins four corners. Single 16:9 overlay or a 6-shot Woozi strip.
          Photos expire automatically.
        </p>
      </header>
      <section className="grid">
        {TEMPLATES.map((t) => (
          <Link key={t.id} className="card" to={`/booth/${t.id}`}>
            <div className={`thumb ${t.kind}`}>
              {previews[t.id] ? <img src={previews[t.id]} alt="" /> : <span>Loading…</span>}
            </div>
            <div className="meta">
              <strong>{t.name}</strong>
              <span>{t.kind === 'strip6' ? '6 consecutive shots' : '1 shot · 16:9'}</span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  )
}

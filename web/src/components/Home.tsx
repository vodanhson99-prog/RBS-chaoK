'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useFrameCatalog } from '../lib/frameCatalog'
import { templateFilterKind } from '../lib/templates'

type Filter = 'all' | 'single' | 'strip6'

export default function Home() {
  const [filter, setFilter] = useState<Filter>('all')
  const [hovered, setHovered] = useState<string | null>(null)
  const { frames: catalog } = useFrameCatalog()

  const frames = useMemo(() => {
    if (filter === 'all') return catalog
    return catalog.filter((frame) => templateFilterKind(frame) === filter)
  }, [catalog, filter])

  return (
    <main className="page picker-page">
      <div className="pixel-grid-bg" aria-hidden />

      <header className="picker-head">
        <p className="pixel-kicker">RBS PHOTOBOOTH / LIVE CAPTURE</p>
        <h1 className="pixel-title">pick a signal</h1>
        <p className="picker-sub">Choose a frame, show the letter S, then keep the result on your phone.</p>
      </header>

      <div className="picker-toolbar">
        <div className="pixel-tabs" role="tablist" aria-label="Frame type">
          {(
            [
              ['all', 'ALL'],
              ['single', '1 SHOT'],
              ['strip6', '×6 STRIP'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`pixel-tab ${filter === id ? 'is-active' : ''}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="pixel-badge">{frames.length} FRAMES</span>
      </div>

      <ul className="frame-grid">
        {frames.map((frame, index) => (
          <li key={frame.id}>
            <Link
              className={`frame-card pixel-card ${hovered === frame.id ? 'is-hover' : ''}`}
              href={`/booth/${frame.id}`}
              onMouseEnter={() => setHovered(frame.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className={`frame-card__thumb ${templateFilterKind(frame)}`}>
                <Image
                  src={frame.thumbnailSrc}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  priority={index < 6}
                  className="pixel-thumb"
                />
                <span className="frame-card__idx">{String(index + 1).padStart(2, '0')}</span>
                {frame.slots.length > 1 && <span className="frame-card__tag">×{frame.slots.length}</span>}
              </div>
              <div className="frame-card__meta">
                <span className="frame-card__name">{frame.name}</span>
                {frame.slots.length > 0 && <span className="frame-card__count">{frame.slots.length} PHOTO{frame.slots.length === 1 ? '' : 'S'}</span>}
                <span className="frame-card__go">OPEN FRAME →</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}

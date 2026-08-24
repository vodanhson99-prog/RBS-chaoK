import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PixelTitle from '../components/PixelTitle'
import TiltCard from '../components/TiltCard'
import TypeLines from '../components/TypeLines'
import { loadTemplateAssets } from '../lib/compose'
import { TEMPLATES, type TemplateKind } from '../lib/templates'

const FRAME_TABS: Array<{ kind: TemplateKind; label: string; sublabel: string }> = [
  { kind: 'single', label: '16:9 FRAMES', sublabel: 'ONE SHOT · WIDE FORMAT' },
  { kind: 'strip', label: 'PHOTO STRIPS', sublabel: 'FOUR OR SIX SHOTS · VERTICAL FORMAT' },
]

const PLACEHOLDER_SLOTS = [0, 1, 2, 3]

const HOWTO = [
  'Đứng trước camera, giơ hai bàn tay.',
  'Tay trên cong sang trái, tay dưới cong sang phải — tạo chữ S lật ngược.',
  'Giữ pose khoảng nửa giây để khóa, đếm 7 giây rồi máy tự chụp. Có thể hạ tay để tạo dáng.',
  'Strip 6 ảnh: lặp 6 lần. Quét QR để tải JPEG; link hết hạn sau 48 giờ.',
]

export default function Home() {
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [activeKind, setActiveKind] = useState<TemplateKind>('single')
  const frameGridRef = useRef<HTMLDivElement>(null)

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

  const activeTab = FRAME_TABS.find((tab) => tab.kind === activeKind) ?? FRAME_TABS[0]
  const activeTemplates = TEMPLATES.filter((template) => template.kind === activeKind)

  const scrollFrames = (direction: 'next' | 'previous') => {
    frameGridRef.current?.scrollBy({
      left: direction === 'next' ? frameGridRef.current.clientWidth * 0.82 : -frameGridRef.current.clientWidth * 0.82,
      behavior: 'smooth',
    })
  }

  return (
    <main className="booth-pixel home-pixel">
      <div className="sky-deco" aria-hidden="true" />
      <div className="sparkles" aria-hidden="true">
        <span className="sp star" style={{ left: '8%', top: '18%' }}>+</span>
        <span className="sp heart" style={{ left: '18%', top: '28%' }}>♥</span>
        <span className="sp star" style={{ left: '72%', top: '14%' }}>+</span>
        <span className="sp heart" style={{ left: '88%', top: '24%' }}>♥</span>
        <span className="sp star" style={{ left: '6%', top: '62%' }}>+</span>
        <span className="sp heart" style={{ left: '92%', top: '58%' }}>♥</span>
      </div>

      <header className="booth-hero">
        <PixelTitle text="RBS PUBLIC PHOTOBOOTH" />
        <div className="meter arcade-meter" aria-hidden="true">
          <span className="meter-fill" />
        </div>
      </header>

      <div className="booth-layout">
        <section className="win main-win">
          <header className="win-bar">
            <span>SELECT FRAME</span>
            <span className="win-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </header>
          <div className="win-body frame-library">
            <div className="frame-tabs" role="tablist" aria-label="Frame categories">
              {FRAME_TABS.map((tab) => {
                const count = TEMPLATES.filter((template) => template.kind === tab.kind).length
                const isActive = tab.kind === activeKind
                return (
                  <button
                    key={tab.kind}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`frame-panel-${tab.kind}`}
                    className={`frame-tab${isActive ? ' is-active' : ''}`}
                    onClick={() => setActiveKind(tab.kind)}
                  >
                    <span className="frame-tab-label">{tab.label}</span>
                    <span className="frame-tab-detail">{tab.sublabel}</span>
                    <span className="frame-tab-count">{String(count).padStart(2, '0')}</span>
                  </button>
                )
              })}
            </div>

            <div
              id={`frame-panel-${activeKind}`}
              className={`frame-panel ${activeKind === 'strip' ? 'is-strip' : 'is-wide'}`}
              role="tabpanel"
              aria-label={activeTab.label}
            >
              <div className="frame-panel-heading">
                <div>
                  <p className="frame-panel-kicker">LOADOUT / {activeKind === 'strip' ? 'STRIP MODE' : 'SINGLE MODE'}</p>
                  <h2>{activeTab.label}</h2>
                </div>
                <button
                  type="button"
                  className="frame-panel-next"
                  aria-label={`Show more ${activeTab.label.toLowerCase()}`}
                  onClick={() => scrollFrames('next')}
                >
                  <svg className="pixel-arrow" viewBox="0 0 24 16" aria-hidden="true">
                    <path d="M1 6h12V1l10 7-10 7v-5H1z" />
                  </svg>
                </button>
              </div>

              <div className="frame-grid" ref={frameGridRef}>
                {activeTemplates.map((template) => (
                  <TiltCard key={template.id} className="frame-tile">
                    <Link className="card frame-card" to={`/booth/${template.id}`}>
                      <div className={`thumb ${template.kind}`}>
                        {previews[template.id] ? (
                          <img src={previews[template.id]} alt={template.name} />
                        ) : (
                          <span>Loading…</span>
                        )}
                      </div>
                      <div className="meta">
                        <strong>{template.name}</strong>
                        <span>{template.kind === 'strip' ? `${template.photoSlots?.length ?? 6} shots · vertical` : '1 shot · 16:9'}</span>
                      </div>
                    </Link>
                  </TiltCard>
                ))}
                {PLACEHOLDER_SLOTS.map((slot) => (
                  <div className="frame-slot" key={`placeholder-${slot}`} aria-hidden="true">
                    <span className="frame-slot-plus">+</span>
                    <span>MORE FRAMES<br />SOON</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="booth-side">
          <section className="win arcade-panel">
            <header className="win-bar">HOW TO PLAY</header>
            <div className="win-body">
              <TypeLines lines={[...HOWTO]} />
            </div>
          </section>
          <section className="win arcade-panel">
            <header className="win-bar">INFORMATION</header>
            <div className="win-body info-body">
              <p>
                <strong>EVENT</strong>
                <span>Chao K42 Soc Son</span>
              </p>
              <p>
                <strong>LOCATION</strong>
                <span>Soc Son High School</span>
              </p>
              <p>
                <strong>ACTIVITY</strong>
                <span>RBS Mini Photobooth</span>
              </p>
            </div>
          </section>
        </aside>
      </div>

      <footer className="credit">
        <p className="credit-box">Robotics Soc Son</p>
      </footer>
      <div className="cloud-band" aria-hidden="true" />
    </main>
  )
}

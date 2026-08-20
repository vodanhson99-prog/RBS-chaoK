import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PixelTitle from '../components/PixelTitle'
import TiltCard from '../components/TiltCard'
import TypeLines from '../components/TypeLines'
import { loadTemplateAssets } from '../lib/compose'
import { TEMPLATES } from '../lib/templates'

const HOWTO = [
  'Đứng trước camera, giơ hai bàn tay.',
  'Tay trên cong sang trái, tay dưới cong sang phải — tạo chữ S lật ngược.',
  'Giữ pose khoảng nửa giây để khóa, đếm 7 giây rồi máy tự chụp. Có thể hạ tay để tạo dáng.',
  'Strip 6 ảnh: lặp 6 lần. Quét QR để tải JPEG; link hết hạn sau 48 giờ.',
]

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

  const strip = TEMPLATES.find((t) => t.kind === 'strip6') ?? TEMPLATES[0]
  const singles = TEMPLATES.filter((t) => t.kind === 'single')

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
          <div className="win-body home-stage">
            <TiltCard className="frame-hero">
              <Link className="card frame-card strip-card" to={`/booth/${strip.id}`}>
                <div className={`thumb ${strip.kind}`}>
                  {previews[strip.id] ? (
                    <img src={previews[strip.id]} alt={strip.name} />
                  ) : (
                    <span>Loading…</span>
                  )}
                </div>
                <div className="meta">
                  <strong>{strip.name}</strong>
                  <span>6 shots</span>
                </div>
              </Link>
            </TiltCard>
            <div className="frame-stack">
              {singles.map((t) => (
                <Link key={t.id} className="card frame-card wide-card" to={`/booth/${t.id}`}>
                  <div className={`thumb ${t.kind}`}>
                    {previews[t.id] ? <img src={previews[t.id]} alt={t.name} /> : <span>Loading…</span>}
                  </div>
                  <div className="meta">
                    <strong>{t.name}</strong>
                    <span>1 shot · 16:9</span>
                  </div>
                </Link>
              ))}
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

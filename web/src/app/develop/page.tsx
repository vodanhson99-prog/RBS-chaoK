import Link from 'next/link'

const tools = [
  {
    href: '/develop/frames',
    label: 'FRAME EDITOR',
    title: 'Draw photo windows',
    description: 'Upload artwork, place slots, and publish a frame to the booth picker.',
  },
  {
    href: '/develop/handgesture',
    label: 'GESTURE DEBUG',
    title: 'Tune letter S',
    description: 'Inspect landmarks, scores, and captured examples from the live camera.',
  },
  {
    href: '/booth/blue',
    label: 'BOOTH SMOKE TEST',
    title: 'Open the booth',
    description: 'Check camera startup and run a real capture with the default frame.',
  },
]

export default function DevelopPage() {
  return (
    <main className="page develop-hub-page">
      <div className="pixel-grid-bg" aria-hidden />
      <header className="develop-hub-head">
        <div>
          <p className="pixel-kicker">RBS PHOTOBOOTH / CONTROL ROOM</p>
          <h1 className="pixel-title">build the signal</h1>
          <p className="develop-hub-sub">Prepare frames, tune the gesture detector, and run a full booth smoke test.</p>
        </div>
        <Link href="/" className="pixel-btn pixel-btn--ghost">← FRAME PICKER</Link>
      </header>

      <nav className="develop-tool-list" aria-label="Developer tools">
        {tools.map((tool, index) => (
          <Link href={tool.href} className="develop-tool" key={tool.href}>
            <span className="develop-tool-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="develop-tool-copy">
              <span className="pixel-kicker">{tool.label}</span>
              <strong>{tool.title}</strong>
              <span>{tool.description}</span>
            </span>
            <span className="develop-tool-arrow" aria-hidden>→</span>
          </Link>
        ))}
      </nav>
    </main>
  )
}

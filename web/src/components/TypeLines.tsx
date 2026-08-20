import { useEffect, useMemo, useState } from 'react'
import { usePrefersReducedMotion } from '../lib/motion'

const KEYS = ['hai bàn tay', 'trái', 'phải', 'S lật ngược']

type Props = {
  lines: string[]
}

function markKeywords(text: string) {
  const pattern = new RegExp(`(${KEYS.map(escapeRe).join('|')})`, 'g')
  const parts = text.split(pattern)
  return parts.map((part, i) =>
    KEYS.includes(part) ? (
      <strong key={`${part}-${i}`} className="kw">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function TypeLines({ lines }: Props) {
  const reduced = usePrefersReducedMotion()
  const [counts, setCounts] = useState(() => lines.map(() => 0))
  const [line, setLine] = useState(0)
  const done = useMemo(
    () => counts.length === lines.length && counts.every((c, i) => c >= lines[i].length),
    [counts, lines],
  )

  useEffect(() => {
    if (reduced) {
      setCounts(lines.map((l) => l.length))
      return
    }
    if (line >= lines.length) return
    const target = lines[line]
    if (counts[line] >= target.length) {
      const t = window.setTimeout(() => setLine((n) => n + 1), 180)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => {
      setCounts((prev) => {
        const next = [...prev]
        next[line] = Math.min(target.length, next[line] + 1)
        return next
      })
    }, 18)
    return () => window.clearTimeout(t)
  }, [counts, line, lines, reduced])

  return (
    <ol className="howto pixel-howto">
      {lines.map((full, i) => {
        const shown = full.slice(0, counts[i] ?? 0)
        const active = i === line && !done && !reduced
        return (
          <li key={i}>
            {done || reduced ? markKeywords(full) : shown}
            {active ? <span className="type-cursor" aria-hidden="true">|</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

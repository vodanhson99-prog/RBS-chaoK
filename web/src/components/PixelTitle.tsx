import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../lib/motion'

type Props = {
  text: string
  className?: string
}

export default function PixelTitle({ text, className = '' }: Props) {
  const reduced = usePrefersReducedMotion()
  const [glitch, setGlitch] = useState(false)

  useEffect(() => {
    if (reduced) return
    let timeout: number
    let alive = true
    const loop = () => {
      timeout = window.setTimeout(() => {
        if (!alive) return
        setGlitch(true)
        window.setTimeout(() => alive && setGlitch(false), 150)
        loop()
      }, 3000 + Math.random() * 2000)
    }
    loop()
    return () => {
      alive = false
      window.clearTimeout(timeout)
    }
  }, [reduced])

  return (
    <h1
      className={`pixel-title arcade-title ${glitch ? 'is-glitch' : ''} ${className}`.trim()}
      data-text={text}
    >
      {text}
    </h1>
  )
}

import { useCallback, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { usePrefersReducedMotion } from '../lib/motion'

type Props = {
  children: ReactNode
  className?: string
}

export default function TiltCard({ children, className = '' }: Props) {
  const reduced = usePrefersReducedMotion()
  const inner = useRef<HTMLDivElement>(null)

  const onMove = useCallback(
    (ev: MouseEvent<HTMLDivElement>) => {
      if (reduced || !inner.current) return
      const box = ev.currentTarget.getBoundingClientRect()
      const px = (ev.clientX - box.left) / box.width - 0.5
      const py = (ev.clientY - box.top) / box.height - 0.5
      const rotY = +(px * 10).toFixed(2)
      const rotX = +(-py * 8).toFixed(2)
      inner.current.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`
    },
    [reduced],
  )

  const onLeave = useCallback(() => {
    if (inner.current) inner.current.style.transform = 'rotateX(0deg) rotateY(0deg)'
  }, [])

  const style: CSSProperties = { transform: 'rotateX(0deg) rotateY(0deg)' }

  return (
    <div className={`tilt-root ${className}`.trim()} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div ref={inner} className="tilt-inner" style={style}>
        {children}
      </div>
    </div>
  )
}

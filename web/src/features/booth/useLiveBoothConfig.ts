import { useEffect, useRef, useState } from 'react'
import { fetchBoothConfig, type BoothConfig } from '../../lib/api'

function gestureSignature(gesture: BoothConfig['gesture']): string {
  return `${gesture.holdMs}|${gesture.minConfidence}|${gesture.consecutiveFrames}|${gesture.countdownSeconds}`
}

/** Dev-only: poll booth config so api/.env.local tweaks apply without leaving the booth. */
export function useLiveBoothConfig(initial: BoothConfig): BoothConfig {
  const [config, setConfig] = useState(initial)
  const lastSig = useRef(gestureSignature(initial.gesture))

  useEffect(() => {
    setConfig(initial)
    lastSig.current = gestureSignature(initial.gesture)
  }, [initial])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    let cancelled = false

    const poll = async () => {
      try {
        const next = await fetchBoothConfig()
        if (cancelled) return
        const sig = gestureSignature(next.gesture)
        if (sig === lastSig.current) return
        lastSig.current = sig
        setConfig(next)
      } catch {
        // API may restart while editing .env.local
      }
    }

    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, 1500)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return config
}

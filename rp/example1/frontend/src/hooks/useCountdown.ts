import { useState, useEffect } from 'react'

export function useCountdown(durationSeconds: number): {
  remaining: number
  display: string
  isExpired: boolean
} {
  // Lazy initializer: called once on mount, not on every render
  const [endTime] = useState<number>(() => Date.now() + durationSeconds * 1000)

  const [remaining, setRemaining] = useState<number>(durationSeconds * 1000)

  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, endTime - Date.now())
      setRemaining(left)
      if (left <= 0) {
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [endTime])

  const totalSecs = Math.floor(remaining / 1000)
  const minutes = Math.floor(totalSecs / 60)
  const seconds = totalSecs % 60
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return { remaining, display, isExpired: remaining <= 0 }
}

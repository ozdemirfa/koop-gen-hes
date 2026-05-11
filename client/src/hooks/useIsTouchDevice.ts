import { useEffect, useState } from 'react'

/**
 * useIsTouchDevice — A8-01 (2026-05-11)
 *
 * Touch destekleyen cihazlarda `true` döner. SSR-safe: window erişimini
 * useEffect içine alıyor. matchMedia hover:none ile primary touch input'u
 * detect ediyor; iPad gibi hybrid cihazlarda da güvenilir.
 *
 * Kullanım: mobile-safe Tooltip trigger (`hover` yerine `click`),
 * mobile-only UI branches.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)')
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches)
    // Modern API
    if (mq.addEventListener) {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    // Safari/legacy fallback
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [])

  return isTouch
}

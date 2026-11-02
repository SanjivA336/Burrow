import { useCallback, useRef } from 'react'

// Keeps the CSS variable --topbar-h equal to the phone top bar's current height (0 on computers,
// where that bar is hidden). Anything that sticks to the top of the page below the top bar, like
// the inventory search bar, uses it as its offset, so the two never overlap. The height is not a
// fixed number: it grows with the phone's top safe area, the offline banner and the display size,
// so it is measured and followed (a ResizeObserver reports every change) instead of guessed. The
// exact fractional height is used (not offsetHeight, which rounds) so no hairline gap shows.
//
// Returns a callback ref: put it on the top bar element.
export function useTopBarHeight() {
  const observer = useRef<ResizeObserver | null>(null)

  return useCallback((el: HTMLElement | null) => {
    const root = document.documentElement
    observer.current?.disconnect()
    observer.current = null
    if (!el) {
      root.style.removeProperty('--topbar-h')
      return
    }
    const update = () =>
      root.style.setProperty('--topbar-h', `${el.getBoundingClientRect().height}px`)
    update()
    observer.current = new ResizeObserver(update)
    observer.current.observe(el)
  }, [])
}

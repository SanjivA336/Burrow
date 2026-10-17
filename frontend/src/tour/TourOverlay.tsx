import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Chapter, GoHint } from './steps'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const PAD = 6
const TAB_BAR_CLEARANCE = 'calc(4rem + var(--bottom-bar-gap) + 0.75rem)'
// A hint that nothing has happened after this long gets a pulse on its target.
const NUDGE_AFTER_MS = 8000

const keysOf = (target: string | string[] | undefined): string[] =>
  target === undefined ? ['page'] : Array.isArray(target) ? target : [target]

// The first element for any of these `data-tour` names that is actually on screen (the
// sidebar and the tab bar both exist in the page, only one is shown).
function findVisible(keys: string[]): Element | null {
  for (const key of keys) {
    for (const el of document.querySelectorAll(`[data-tour="${key}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

// Where the thing to light up is, kept current. It is re-measured on a timer as well
// as on scroll and resize, because pages load in after the card appears.
function useTargetRect(keys: string[], enabled: boolean): Rect | null {
  // The position is stored with the names it was measured for, so a card that has just
  // changed never shows (or cuts a tap-through hole at) the previous card's spot.
  const [measured, setMeasured] = useState<{ joined: string; rect: Rect } | null>(null)
  const joined = keys.join('|')
  const rect = enabled && measured?.joined === joined ? measured.rect : null
  // Before the browser paints, so the first frame of a card is already right.
  useLayoutEffect(() => {
    if (!enabled) return
    let scrolled = false
    const measure = () => {
      const el = findVisible(joined.split('|'))
      if (!el) {
        setMeasured((prev) => (prev === null ? prev : null))
        return
      }
      const isPage = el.getAttribute('data-tour') === 'page'
      const r = el.getBoundingClientRect()
      if (!isPage && !scrolled && (r.top < 0 || r.bottom > window.innerHeight)) {
        scrolled = true
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      // The page area is clamped to what is visible, above the phone's tab bar.
      let bottomLimit = window.innerHeight
      if (isPage) {
        const tabBar = document.querySelector('.tab-bar')
        const tabTop = tabBar?.getBoundingClientRect().top
        if (tabBar && tabTop !== undefined && tabTop > 0 && tabTop < bottomLimit) {
          bottomLimit = tabTop
        }
      }
      const pad = isPage ? 0 : PAD
      const top = Math.max(r.top - pad, 0)
      const left = Math.max(r.left - pad, 0)
      const next = {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(Math.min(r.right + pad, window.innerWidth) - left),
        height: Math.round(Math.min(r.bottom + pad, bottomLimit) - top),
      }
      setMeasured((prev) =>
        prev &&
        prev.joined === joined &&
        prev.rect.left === next.left &&
        prev.rect.top === next.top &&
        prev.rect.width === next.width &&
        prev.rect.height === next.height
          ? prev
          : { joined, rect: next },
      )
    }
    measure()
    const timer = setInterval(measure, 250)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [joined, enabled])
  return rect
}

export function TourOverlay({
  chapter,
  index,
  total,
  phase,
  hint,
  isDesktop,
  onBegin,
  onNext,
  onBack,
  onSkip,
}: {
  chapter: Chapter
  index: number
  total: number
  phase: 'card' | 'explain' | 'go'
  hint: GoHint | undefined
  isDesktop: boolean
  onBegin: () => void
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const keys = phase === 'go' && hint ? keysOf(hint.target) : keysOf(chapter.target)
  const rect = useTargetRect(keys, phase !== 'card')
  const cardRef = useRef<HTMLDivElement>(null)
  const [nudge, setNudge] = useState(false)

  // Each new card starts quiet; if a "tap here" card sits unanswered, pulse its target.
  useEffect(() => {
    setNudge(false)
    if (phase !== 'go') return
    const timer = setTimeout(() => setNudge(true), NUDGE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [index, phase])

  // Move keyboard focus to the card for each new card, and keep Tab inside it while it
  // is explaining. In a "go" card Tab stays free so the highlighted control is reachable.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
  }, [index, phase])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip()
        return
      }
      if (e.key !== 'Tab' || phase === 'go' || !cardRef.current) return
      const focusable = cardRef.current.querySelectorAll<HTMLElement>('button')
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!cardRef.current.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (active === first || active === cardRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [phase, onSkip])

  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight
  const cardWidth = Math.min(360, vw - 24)

  // The card sits beside the target, on whichever side has room. For a big target (the
  // whole page) or none at all it is pinned to the bottom, or centred for a plain card.
  const bigTarget = rect !== null && rect.height > vh * 0.45
  const style: React.CSSProperties = { width: cardWidth }
  if (phase === 'card' || rect === null) {
    if (phase === 'card') {
      style.left = '50%'
      style.top = '50%'
      style.transform = 'translate(-50%, -50%)'
    } else {
      style.left = '50%'
      style.transform = 'translateX(-50%)'
      style.bottom = isDesktop ? '1.5rem' : TAB_BAR_CLEARANCE
    }
  } else if (bigTarget) {
    style.left = '50%'
    style.transform = 'translateX(-50%)'
    style.bottom = isDesktop ? '1.5rem' : TAB_BAR_CLEARANCE
  } else {
    const center = rect.left + rect.width / 2
    style.left = Math.min(Math.max(center - cardWidth / 2, 12), vw - cardWidth - 12)
    if (rect.top + rect.height / 2 < vh / 2) style.top = rect.top + rect.height + 12
    else style.bottom = vh - rect.top + 12
  }

  // Taps are blocked everywhere except, on a "go" card, the highlighted control: the
  // blocking layer has a hole cut in it, and a clipped-out area receives no pointer
  // events, so the tap reaches the real button underneath.
  const hole = phase === 'go' && rect !== null ? rect : null
  const clip = hole
    ? `polygon(evenodd, 0 0, ${vw}px 0, ${vw}px ${vh}px, 0 ${vh}px, 0 0, ` +
      `${hole.left}px ${hole.top}px, ${hole.left}px ${hole.top + hole.height}px, ` +
      `${hole.left + hole.width}px ${hole.top + hole.height}px, ${hole.left + hole.width}px ${hole.top}px, ` +
      `${hole.left}px ${hole.top}px)`
    : undefined

  const isFinish = chapter.kind === 'finish'
  const body =
    phase === 'go' && hint ? hint.text : (!isDesktop && chapter.phoneBody) || chapter.body
  const title = chapter.title

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" data-tour-overlay>
      <div
        className="pointer-events-auto absolute inset-0"
        style={{ clipPath: clip, touchAction: 'none' }}
        aria-hidden="true"
      />
      {rect ? (
        <>
          {/* The dimming: a huge shadow around a hole the size of the target. */}
          <div
            className="pointer-events-none fixed rounded-card"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
            }}
          />
          {/* The ring around the target, on its own so only it pulses when nudging. */}
          <div
            className={`pointer-events-none fixed rounded-card ring-2 ring-primary ${
              nudge ? 'animate-pulse' : ''
            }`}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-label={`${title}. Step ${index + 1} of ${total}`}
        tabIndex={-1}
        data-tour-card
        className="pointer-events-auto fixed rounded-card border border-subtle bg-surface-2 p-4 text-sm shadow-raised outline-none"
        style={style}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          {phase !== 'card' && (
            <span className="shrink-0 text-xs text-faint">
              {index + 1} / {total}
            </span>
          )}
        </div>
        <p className="mb-4 text-muted">{body}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-control px-2 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            {isFinish ? 'Close' : 'Skip tour'}
          </button>
          <div className="flex items-center gap-2">
            {phase === 'explain' && index > 1 && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-control border border-subtle px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
              >
                Back
              </button>
            )}
            {chapter.kind === 'welcome' && (
              <button
                type="button"
                onClick={onBegin}
                className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover"
              >
                Start tour
              </button>
            )}
            {(phase === 'explain' || isFinish) && (
              <button
                type="button"
                onClick={onNext}
                className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover"
              >
                {isFinish ? 'Done' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

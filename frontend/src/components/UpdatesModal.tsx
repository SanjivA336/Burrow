import { useEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useDialog } from '../hooks/useDialog'
import '@fontsource/cal-sans/latin-400.css'
import { drawMarble } from '../lib/marble'
import type { Update } from '../lib/updates'

// Plain markdown, styled with the app's own colours. Raw HTML in a note is ignored by the
// renderer, and images inside the text are dropped (every note gets the same marble banner).
const COMPONENTS: Components = {
  h1: (props) => <h4 className="mb-1.5 mt-3 text-base font-semibold text-text" {...props} />,
  h2: (props) => <h4 className="mb-1.5 mt-3 text-base font-semibold text-text" {...props} />,
  h3: (props) => <h5 className="mb-1 mt-3 text-sm font-semibold text-text" {...props} />,
  p: (props) => <p className="mb-2 text-sm leading-relaxed text-muted" {...props} />,
  ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-muted" {...props} />,
  ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm text-muted" {...props} />,
  strong: (props) => <strong className="font-semibold text-text" {...props} />,
  a: (props) => (
    <a className="text-primary underline" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  blockquote: (props) => (
    <blockquote
      className="mb-2 border-l-2 border-subtle-strong pl-3 text-sm text-muted"
      {...props}
    />
  ),
  code: (props) => (
    <code className="rounded-control bg-surface px-1 py-0.5 text-[0.85em] text-text" {...props} />
  ),
  img: () => null,
}

// The arrows and the close button sit on the picture: lightly visible, readable on any accent.
const OVERLAY_BUTTON =
  'absolute flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white'

// The banner's picture: marble veins drawn on the spot (a new pattern each time the card opens).
function MarbleArt() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvas.current) drawMarble(canvas.current)
  }, [])
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="marble-art absolute inset-0 h-full w-full object-cover"
    />
  )
}

interface Props {
  updates: Update[]
  onClose: () => void
}

// The newest notes as a row you swipe through (scroll-snap, so it is native touch scrolling). Each
// one is a marble banner in the accent colour with its caption in the middle, then a short note
// underneath that scrolls if it is long (it can be at the Large display size).
export function UpdatesModal({ updates, onClose }: Props) {
  const boxRef = useDialog<HTMLDivElement>(onClose)
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const goTo = (next: number) => {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="Updates"
        tabIndex={-1}
        className="relative w-full max-w-sm overflow-hidden rounded-card border border-subtle bg-surface-2 shadow-raised outline-none"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`${OVERLAY_BUTTON} right-2 top-2 z-10`}
        >
          <X size={18} strokeWidth={2} />
        </button>

        <div
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget
            setIndex(Math.round(el.scrollLeft / el.clientWidth))
          }}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {updates.map((update, i) => (
            <article
              key={update.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${updates.length}: ${update.title}`}
              className="w-full shrink-0 snap-center"
            >
              <div className="update-marble relative aspect-[16/7] overflow-hidden">
                <MarbleArt />
                <p
                  className="absolute inset-0 flex items-center justify-center px-14 text-center font-['Cal_Sans'] text-5xl font-normal text-primary-ink"
                  style={{
                    textShadow: '0 0 10px var(--color-bg), 0 0 3px var(--color-bg)',
                  }}
                >
                  {update.caption}
                </p>
                {i > 0 && (
                  <button
                    type="button"
                    aria-label="Newer"
                    onClick={() => goTo(i - 1)}
                    className={`${OVERLAY_BUTTON} left-2 top-1/2 -translate-y-1/2`}
                  >
                    <ChevronLeft size={20} strokeWidth={2} />
                  </button>
                )}
                {i < updates.length - 1 && (
                  <button
                    type="button"
                    aria-label="Older"
                    onClick={() => goTo(i + 1)}
                    className={`${OVERLAY_BUTTON} right-2 top-1/2 -translate-y-1/2`}
                  >
                    <ChevronRight size={20} strokeWidth={2} />
                  </button>
                )}
              </div>
              {/* Focusable so a keyboard user can scroll a longer note with the arrow keys. */}
              <div tabIndex={0} className="max-h-[38vh] overflow-y-auto p-4">
                <h3 className="sr-only">{update.title}</h3>
                <Markdown components={COMPONENTS}>{update.body}</Markdown>
              </div>
            </article>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {index + 1} of {updates.length}
        </p>
      </div>
    </div>
  )
}

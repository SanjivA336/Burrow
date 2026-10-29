import { useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from './Modal'
import type { Update } from '../lib/updates'

// Plain markdown, styled with the app's own colours. Raw HTML in an article is ignored by the
// renderer, and images inside the text are dropped (a banner is set in the article's header).
const COMPONENTS: Components = {
  h1: (props) => <h4 className="mb-1.5 mt-4 text-base font-semibold text-text" {...props} />,
  h2: (props) => <h4 className="mb-1.5 mt-4 text-base font-semibold text-text" {...props} />,
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

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

interface Props {
  updates: Update[]
  onClose: () => void
}

// The last few articles as a row you swipe through (scroll-snap, so it is native touch scrolling),
// with arrows for people on a computer. Each article scrolls up and down inside its own page.
export function UpdatesModal({ updates, onClose }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const goTo = (next: number) => {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <Modal title="Updates" onClose={onClose}>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget
          setIndex(Math.round(el.scrollLeft / el.clientWidth))
        }}
        className="-mx-5 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {updates.map((update, i) => (
          <article
            key={update.id}
            role="group"
            // Focusable so a keyboard user can scroll a long article with the arrow keys.
            tabIndex={0}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${updates.length}: ${update.title}`}
            className="max-h-[60vh] w-full shrink-0 snap-center overflow-y-auto px-5"
          >
            {update.banner && (
              <img
                src={update.banner}
                alt={update.bannerAlt}
                className="mb-3 aspect-video w-full rounded-control object-cover"
              />
            )}
            <h3 className="text-lg font-semibold text-text">{update.title}</h3>
            <p className="mb-2 text-xs text-faint">{formatDate(update.date)}</p>
            <Markdown components={COMPONENTS}>{update.body}</Markdown>
          </article>
        ))}
      </div>

      {updates.length > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Newer"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            className="rounded-control p-2 text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-30"
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <p className="text-xs text-faint" aria-live="polite">
            {index + 1} of {updates.length}
          </p>
          <button
            type="button"
            aria-label="Older"
            disabled={index === updates.length - 1}
            onClick={() => goTo(index + 1)}
            className="rounded-control p-2 text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-30"
          >
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </Modal>
  )
}

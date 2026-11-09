import { useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../../hooks/useDialog'

interface Props {
  title: string
  // Closing leaves without saving (the X and the Escape key). Clicking the dimmed background does
  // nothing on purpose: a recipe takes a while to type, and a stray tap should not throw it away.
  onClose: () => void
  children: ReactNode
}

// The frame the recipe form sits in, shaped like the Add item sheet: it fills the phone screen,
// and from the desktop breakpoint up it is a centred card over a dimmed page. The children (the
// form) provide the scrolling body and the pinned button row.
export function RecipeSheet({ title, onClose, children }: Props) {
  const titleId = useId()
  const boxRef = useDialog<HTMLDivElement>(onClose)

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-[var(--app-height)] items-center justify-center md:inset-0 md:h-auto md:p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface-2 outline-none md:h-[85vh] md:rounded-card md:border md:border-subtle md:shadow-raised"
      >
        <div className="flex items-center justify-between gap-2 border-b border-subtle px-4 pb-3 pt-[calc(0.75rem+var(--safe-top)+var(--offline-banner-h,0px))] md:py-3">
          <h3 id={titleId} className="min-w-0 truncate text-base font-semibold">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-control p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

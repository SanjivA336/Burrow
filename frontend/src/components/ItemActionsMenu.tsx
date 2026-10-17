import { useEffect, useRef, useState } from 'react'
import { ArrowRightLeft, EllipsisVertical, Hourglass, PackageX, Trash2 } from 'lucide-react'

// The desktop version of an item's swipe actions: one "more" button that opens a menu
// with the move option and the ways to take the item out of the list. (On a phone
// the same actions are behind a swipe, see SwipeActionRow.)
export function ItemActionsMenu({
  itemName,
  onMove,
  onExpired,
  onEmpty,
  onVoid,
}: {
  itemName: string
  onMove: () => void
  onExpired: () => void
  onEmpty: () => void
  onVoid: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Closes on a click anywhere else, and on Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (run: () => void) => () => {
    setOpen(false)
    run()
  }

  const itemClass =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover'

  return (
    <div ref={root} className="relative hidden md:block">
      <button
        type="button"
        aria-label={`More actions for ${itemName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-control p-1.5 text-faint transition-colors hover:bg-surface-hover hover:text-text"
      >
        <EllipsisVertical size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-card border border-subtle bg-surface-2 py-1 shadow-raised"
        >
          <button type="button" role="menuitem" onClick={choose(onMove)} className={itemClass}>
            <ArrowRightLeft size={16} strokeWidth={1.75} className="text-muted" />
            Move to…
          </button>
          <hr className="my-1 border-t border-subtle" />
          <button type="button" role="menuitem" onClick={choose(onExpired)} className={itemClass}>
            <Hourglass size={16} strokeWidth={1.75} className="text-orange" />
            Mark expired
          </button>
          <button type="button" role="menuitem" onClick={choose(onEmpty)} className={itemClass}>
            <PackageX size={16} strokeWidth={1.75} className="text-warning" />
            Mark empty
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={choose(onVoid)}
            className={`${itemClass} text-danger`}
          >
            <Trash2 size={16} strokeWidth={1.75} />
            Void
          </button>
        </div>
      )}
    </div>
  )
}

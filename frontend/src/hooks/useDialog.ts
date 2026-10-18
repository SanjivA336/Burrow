import { useEffect, useRef } from 'react'

// The dialogs that are open right now, oldest first. When a dialog opens on top of
// another one (the "Void this item?" box over the item sheet), only the top one
// answers the Escape key, so one press closes one box, not both.
const openDialogs: symbol[] = []

// What every pop-up needs so a keyboard or screen-reader user is not left behind it:
//  - focus moves into the dialog when it opens (so Tab continues from there, not from
//    the page underneath),
//  - Escape closes it,
//  - when it closes, focus goes back to the button that opened it.
// Put the returned ref on the dialog's box, and give that box role="dialog",
// aria-modal="true", a name (aria-label / aria-labelledby) and tabIndex={-1}.
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  // Always the latest onClose, without re-running the effect below on every render.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const me = Symbol('dialog')
    openDialogs.push(me)
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openDialogs[openDialogs.length - 1] !== me) return
      e.stopPropagation()
      closeRef.current()
    }
    // Capture phase on the window: runs before any other Escape handler on the page.
    window.addEventListener('keydown', onKey, true)

    return () => {
      window.removeEventListener('keydown', onKey, true)
      openDialogs.splice(openDialogs.indexOf(me), 1)
      // The opener may be gone by now (a row that re-rendered); focus() on a
      // detached element simply does nothing.
      opener?.focus({ preventScroll: true })
    }
  }, [])

  return ref
}

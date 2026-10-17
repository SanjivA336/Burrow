import { useEffect, useRef, useState, type ReactNode } from 'react'
import { withResistance } from '../lib/swipeResistance'

export type SwipeSide = 'left' | 'right'

interface Props {
  // Which side is showing its actions: 'right' after swiping the tile left (the
  // actions sit on the right), 'left' after swiping it right, null when closed.
  open: SwipeSide | null
  onOpenChange: (side: SwipeSide | null) => void
  // The action buttons beside the tile, laid out in a row. Include any gaps in the
  // width. `tabIndex` is 0 only while that side is open, so keyboard focus never
  // lands on a button that is off-screen.
  actions?: (props: { tabIndex: number }) => ReactNode
  actionsWidth?: number
  // Same, for the actions on the left (revealed by swiping right).
  leftActions?: (props: { tabIndex: number }) => ReactNode
  leftActionsWidth?: number
  // Styles for the tile itself (border, rounding, background, shadow). The
  // actions are separate cards beside it, so the container has no chrome.
  tileClassName?: string
  children: ReactNode
}

const DESKTOP_QUERY = '(min-width: 768px)'

// A row you swipe sideways to reveal action buttons beside it, for touch screens.
// The tile and its actions sit in one strip that slides as a unit, so the actions
// come in from either edge as their own cards (like swiping a message in Mail) and
// are clipped away while the row is closed: swipe left for the actions on the right,
// swipe right for the ones on the left.
//
// Touch only: a mouse pointer never starts a drag, and from the app's desktop
// breakpoint up there's nothing to reveal (the actions live elsewhere there), so
// the gesture is off there too. The row only claims a *horizontal* drag; vertical
// movement is left to the browser (touch-action: pan-y), so scrolling the list
// and pull to refresh are unaffected. One open row at a time is the parent's job
// (it owns `open`); tapping anywhere outside an open row closes it.
//
// Positions below are the tile's shift from its closed place, in px: negative when
// swiped left (right actions showing), positive when swiped right (left actions).
export function SwipeActionRow({
  open,
  onOpenChange,
  actions,
  actionsWidth = 0,
  leftActions,
  leftActionsWidth = 0,
  tileClassName = '',
  children,
}: Props) {
  const right = actionsWidth
  const left = leftActionsWidth
  const [dragX, setDragX] = useState<number | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; base: number; active: boolean } | null>(null)
  const suppressClick = useRef(false)
  // The latest drag position, kept in a ref as well as in state: a quick flick can end
  // before React has re-rendered, and the release must see where the finger really got to.
  const latestDrag = useRef<number | null>(null)

  const restingPosition = open === 'right' ? -right : open === 'left' ? left : 0

  // Close when a touch lands outside this row.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (container.current && !container.current.contains(e.target as Node)) onOpenChange(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onOpenChange])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || window.matchMedia(DESKTOP_QUERY).matches) return
    gesture.current = { x: e.clientX, y: e.clientY, base: restingPosition, active: false }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.active) {
      // Mostly vertical: it's a scroll, leave it alone for good.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        gesture.current = null
        return
      }
      if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy)) return
      // No setPointerCapture needed: a touch pointer is already tied to the
      // element it landed on, so the moves keep arriving here.
      g.active = true
    }
    const next = withResistance(g.base + dx, right, left)
    latestDrag.current = next
    setDragX(next)
  }

  const finish = (commit: boolean) => {
    const g = gesture.current
    gesture.current = null
    if (!g?.active) return
    // A drag ends in a click event on whatever is under the finger; swallow it
    // so letting go of a swipe doesn't also open the item.
    suppressClick.current = true
    setTimeout(() => {
      suppressClick.current = false
    }, 0)
    const final = latestDrag.current ?? g.base
    latestDrag.current = null
    setDragX(null)
    if (!commit) {
      onOpenChange(open)
    } else if (right > 0 && final < -right / 2) {
      onOpenChange('right')
    } else if (left > 0 && final > left / 2) {
      onOpenChange('left')
    } else {
      onOpenChange(null)
    }
  }

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    // Tapping an open row closes it instead of opening the item.
    if (open) {
      e.stopPropagation()
      e.preventDefault()
      onOpenChange(null)
    }
  }

  const offset = dragX ?? restingPosition
  const dragging = dragX !== null

  // `overflow-hidden` clips the actions away to either side while closed; from the
  // desktop breakpoint up it is lifted so the cards keep their shadow, and the strip
  // is plain full width (the transform is switched off there, or the left actions'
  // room would push the tile out of place).
  return (
    <div ref={container} className="relative overflow-hidden md:overflow-visible">
      <div
        className="flex md:w-full! md:transform-none!"
        style={{
          width: `calc(100% + ${left + right}px)`,
          transform: `translateX(${offset - left}px)`,
          transition: dragging ? 'none' : 'transform 220ms ease-out',
        }}
      >
        {leftActions && left > 0 && (
          <div
            className="flex gap-2 pr-2 md:hidden"
            style={{ width: left }}
            aria-hidden={open !== 'left'}
          >
            {leftActions({ tabIndex: open === 'left' ? 0 : -1 })}
          </div>
        )}
        <div
          className={`touch-pan-y bg-surface md:w-full! ${tileClassName}`}
          style={{ width: `calc(100% - ${left + right}px)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => finish(true)}
          onPointerCancel={() => finish(false)}
          onClickCapture={handleClickCapture}
        >
          {children}
        </div>
        {actions && right > 0 && (
          <div
            className="flex gap-2 pl-2 md:hidden"
            style={{ width: right }}
            aria-hidden={open !== 'right'}
          >
            {actions({ tabIndex: open === 'right' ? 0 : -1 })}
          </div>
        )}
      </div>
    </div>
  )
}

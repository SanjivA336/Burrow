import { Calendar, CalendarClock, CalendarOff, CalendarX } from 'lucide-react'

// 'none' draws nothing (the item never expires where it is). 'unknown' is the
// quiet "no expiry date found" mark for an item that has no date to show.
export type ExpiryState = 'none' | 'unknown' | 'ok' | 'soon' | 'expired'

interface Props {
  state: ExpiryState
  // Whole days from today: negative once expired. Only used for the label.
  daysUntil?: number
  size?: number
}

function label(state: ExpiryState, daysUntil: number | undefined): string {
  if (state === 'ok') return 'Has an expiry date'
  if (daysUntil === undefined) return state === 'soon' ? 'Expiring soon' : 'Expired'
  const n = Math.abs(daysUntil)
  const days = `${n} ${n === 1 ? 'day' : 'days'}`
  if (state === 'soon') return daysUntil === 0 ? 'Expires today' : `Expires in ${days}`
  return `Expired ${days} ago`
}

// A small calendar that says where an item stands on expiry without a line of
// text: blue = there is a date, amber = it's close, red = it's past, and a
// faint struck-through calendar = no date found for where it's kept. Each state
// also has its own glyph, so the meaning doesn't depend on telling colours
// apart. The exact days are on the item's page and in the warnings list.
export function ExpiryIcon({ state, daysUntil, size = 15 }: Props) {
  if (state === 'none') return null

  if (state === 'unknown') {
    const text = 'No expiry date found'
    return (
      <span className="inline-flex shrink-0 text-faint" title={text} role="img" aria-label={text}>
        <CalendarOff size={size} strokeWidth={1.9} />
      </span>
    )
  }

  const Icon = state === 'ok' ? Calendar : state === 'soon' ? CalendarClock : CalendarX
  const color = state === 'ok' ? 'text-info' : state === 'soon' ? 'text-warning' : 'text-danger'
  const text = `${label(state, daysUntil)} (suggestion)`

  return (
    <span className={`inline-flex shrink-0 ${color}`} title={text} role="img" aria-label={text}>
      <Icon size={size} strokeWidth={1.9} />
    </span>
  )
}

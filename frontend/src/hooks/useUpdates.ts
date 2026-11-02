import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import {
  UPDATES,
  getSeenUpdateId,
  isUpdateUnread,
  setSeenUpdateId,
  unreadMajorIndex,
  type Update,
} from '../lib/updates'

// Wait a moment after the screen appears before opening a major article by itself.
const FORCED_OPEN_DELAY_MS = 1200

// The Updates card's state, for the burrow shell to own (so there is one modal, however many
// buttons open it). Opening marks the newest article read. An unread major one also opens by
// itself, once, starting on that article even if newer minor ones sit above it, but only after
// the first-time tour is done and never over a page opened straight onto an item.
export function useUpdates(blocked: boolean) {
  const { user } = useAuth()
  const [seenId, setSeenId] = useState<string | null>(getSeenUpdateId)
  const [isOpen, setIsOpen] = useState(false)
  // Which article the card starts on: the newest, unless it opened by itself for a major one.
  const [startIndex, setStartIndex] = useState(0)
  const latest: Update | undefined = UPDATES[0]
  const unread = isUpdateUnread(latest, seenId, user?.created_at)
  const tourDone = Boolean(user?.user_metadata?.tour_completed_at)
  const majorAt = unreadMajorIndex(UPDATES, seenId, user?.created_at)

  const openAt = useCallback(
    (index: number) => {
      setStartIndex(index)
      setIsOpen(true)
      if (latest) {
        setSeenUpdateId(latest.id)
        setSeenId(latest.id)
      }
    },
    [latest],
  )
  // Written out (not passed straight to onClick) so a click event is never taken for an index.
  const open = useCallback(() => openAt(0), [openAt])

  useEffect(() => {
    if (majorAt < 0 || !tourDone || blocked) return
    const timer = setTimeout(() => openAt(majorAt), FORCED_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [majorAt, tourDone, blocked, openAt])

  return { updates: UPDATES, unread, isOpen, startIndex, open, close: () => setIsOpen(false) }
}

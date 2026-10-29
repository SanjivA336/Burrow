import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import {
  UPDATES,
  getSeenUpdateId,
  isUpdateUnread,
  setSeenUpdateId,
  type Update,
} from '../lib/updates'

// Wait a moment after the screen appears before opening a major article by itself.
const FORCED_OPEN_DELAY_MS = 1200

// The Updates card's state, for the burrow shell to own (so there is one modal, however many
// buttons open it). Opening marks the newest article read. A major one also opens by itself, once,
// but only after the first-time tour is done and never over a page opened straight onto an item.
export function useUpdates(blocked: boolean) {
  const { user } = useAuth()
  const [seenId, setSeenId] = useState<string | null>(getSeenUpdateId)
  const [isOpen, setIsOpen] = useState(false)
  const latest: Update | undefined = UPDATES[0]
  const unread = isUpdateUnread(latest, seenId, user?.created_at)
  const tourDone = Boolean(user?.user_metadata?.tour_completed_at)

  const open = useCallback(() => {
    setIsOpen(true)
    if (latest) {
      setSeenUpdateId(latest.id)
      setSeenId(latest.id)
    }
  }, [latest])

  useEffect(() => {
    if (!unread || !latest?.major || !tourDone || blocked) return
    const timer = setTimeout(open, FORCED_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [unread, latest, tourDone, blocked, open])

  return { updates: UPDATES, unread, isOpen, open, close: () => setIsOpen(false) }
}

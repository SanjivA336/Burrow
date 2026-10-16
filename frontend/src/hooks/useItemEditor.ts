import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// The item editor is a sheet over whatever page you are on, not a page of its
// own. Which item it shows lives in the address as ?item=<id>, so a refresh
// reopens it and the phone's back button closes it, while the page behind stays
// exactly where it was. The household shell draws the sheet (see HouseholdShell).
export const ITEM_PARAM = 'item'

// Marks the history entry that opening the sheet added, so closing can step back
// over it instead of piling up entries.
export const OPENED_BY_APP = { itemEditor: true }

export function useItemEditor() {
  const [, setSearchParams] = useSearchParams()
  const open = useCallback(
    (itemId: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(ITEM_PARAM, itemId)
          return next
        },
        { state: OPENED_BY_APP },
      ),
    [setSearchParams],
  )
  return { open }
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { useSplitCosts } from '../hooks/useSplitCosts'
import { canSuggestInstall, detectPlatform, installTip } from '../lib/installApp'
import { supabase } from '../lib/supabaseClient'
import { TourOverlay } from './TourOverlay'
import { CHAPTERS, relativePath, type GoHint } from './steps'
import { TourContext, type TourApi } from './tourContext'

// Where "has this person done the tour" is kept: on their account (Supabase's own
// user metadata), so it follows them to a new phone and needs no database change.
// Set only when they reach the last card or press Skip. Closing the app halfway
// leaves it unset, so the tour simply starts again next time.
const COMPLETED_KEY = 'tour_completed_at'

// How long after landing in a burrow the tour starts, so the page behind it has
// drawn first.
const AUTO_START_DELAY_MS = 900

export function TourProvider({
  householdId,
  children,
}: {
  householdId: string
  children: ReactNode
}) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDesktop = useIsDesktop()
  // null = not running; otherwise the index of the chapter being shown.
  const [index, setIndex] = useState<number | null>(null)
  const autoStarted = useRef(false)
  const completed = Boolean(user?.user_metadata?.[COMPLETED_KEY])
  // A burrow that doesn't split costs has no balances, so a few cards say something else.
  const splitCosts = useSplitCosts(householdId)
  const chapters = useMemo(() => {
    // On a phone where Burrow isn't installed yet, the last card also says how to install it.
    const tip = canSuggestInstall() ? (installTip(detectPlatform()) ?? undefined) : undefined
    return CHAPTERS.map((c) => {
      const adapted = !splitCosts && c.noSplit ? { ...c, ...c.noSplit } : c
      return c.kind === 'finish' && tip ? { ...adapted, tip } : adapted
    })
  }, [splitCosts])
  // One ref so a quick double-tap on Skip cannot save twice.
  const saving = useRef(false)

  // First time in a burrow with the flag unset: start. Not when the page was opened
  // straight onto an item or the add sheet, which the tour would only fight with.
  const blockedByDeepLink = searchParams.has('item') || searchParams.has('addItem')
  useEffect(() => {
    if (!user || completed || autoStarted.current || blockedByDeepLink) return
    const timer = setTimeout(() => {
      autoStarted.current = true
      setIndex(0)
    }, AUTO_START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [user, completed, blockedByDeepLink])

  const end = useCallback(() => {
    setIndex(null)
    if (completed || saving.current) return
    saving.current = true
    void supabase.auth
      .updateUser({ data: { [COMPLETED_KEY]: new Date().toISOString() } })
      .finally(() => {
        saving.current = false
      })
  }, [completed])

  const start = useCallback(() => setIndex(0), [])
  const api = useMemo<TourApi>(() => ({ start }), [start])

  // The only move the tour ever makes for the person: to the inventory, so every run
  // begins from the same place. Replace, so Back does not return to where they were.
  // The first card waits until the inventory is really showing, so there is no flash of
  // a "go" card while the move happens.
  const [beginning, setBeginning] = useState(false)
  const begin = () => {
    setBeginning(true)
    navigate(`/households/${householdId}`, { replace: true })
  }

  const chapter = index === null ? null : chapters[index]
  const rel = relativePath(location.pathname)
  useEffect(() => {
    if (beginning && rel === '/') {
      setBeginning(false)
      setIndex(1)
    }
  }, [beginning, rel])

  // Explain vs go is worked out from the address alone, so nothing has to be
  // remembered between renders and the back button just shows the "go" card again.
  let phase: 'card' | 'explain' | 'go' = 'explain'
  let hint: GoHint | undefined
  if (chapter) {
    if (chapter.kind) {
      phase = 'card'
    } else if (!chapter.page(rel)) {
      hint = chapter.go?.find((h) => h.from(rel))
      if (hint) phase = 'go'
    }
  }

  return (
    <TourContext.Provider value={api}>
      {children}
      {chapter && index !== null && (
        <TourOverlay
          chapter={chapter}
          index={index}
          total={chapters.length}
          phase={phase}
          hint={hint}
          isDesktop={isDesktop}
          onBegin={begin}
          onNext={() => (index + 1 >= chapters.length ? end() : setIndex(index + 1))}
          onBack={() => setIndex(Math.max(1, index - 1))}
          onSkip={end}
        />
      )}
    </TourContext.Provider>
  )
}

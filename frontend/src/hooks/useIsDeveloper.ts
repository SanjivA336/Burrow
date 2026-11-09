import { useSyncExternalStore } from 'react'
import { getDevFeaturesOn, subscribeDevFeatures } from '../lib/devFeatures'
import { useAuth } from './useAuth'

// Mirrors the backend's DEVELOPER_USER_IDS (see backend/app/core/auth.py) --
// same root .env file, VITE_-prefixed so Vite exposes it to client code.
// This only ever controls what's *shown*; the real enforcement is the
// backend's require_developer/is_developer checks, so a user id being
// visible in the built bundle isn't a security concern here.
const DEVELOPER_USER_IDS = new Set(
  (import.meta.env.VITE_DEVELOPER_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
)

// Is this account on the developer list? (Decides whether the Settings switch is shown at all.)
export function useIsDeveloperAccount(): boolean {
  const { user } = useAuth()
  return !!user && DEVELOPER_USER_IDS.has(user.id)
}

// Should developer-only features be shown right now? The account has to be on the developer list
// AND the person's own "Developer features" switch (Settings) has to be on, which it is unless
// they turned it off to see the app as everyone else does.
export function useIsDeveloper(): boolean {
  const account = useIsDeveloperAccount()
  const switchedOn = useSyncExternalStore(subscribeDevFeatures, getDevFeaturesOn)
  return account && switchedOn
}

import type { Household } from '../types/entities'
import { useHouseholdResource } from './useHouseholdResource'

// Whether this burrow splits costs between its members (Settings → Burrow), or null until the
// burrow has loaded. A screen that would otherwise do the wrong thing for a moment (asking for
// ledger data a family's burrow does not have) waits on null; most just use useSplitCosts.
// It reads the shared copy of the household, so asking from several screens costs one request.
export function useSplitCostsSetting(householdId: string | undefined): boolean | null {
  const { data } = useHouseholdResource<Household>(
    householdId ? `/api/households/${householdId}` : null,
  )
  return data ? data.split_costs : null
}

// The same, treated as on until the burrow has loaded (how burrows worked before the setting).
export function useSplitCosts(householdId: string | undefined): boolean {
  return useSplitCostsSetting(householdId) ?? true
}

import type { FoodDefinition, StorageLocationType } from '../types/entities'

// A shelf life per place is one integer: a positive number of days, or a code.
// The backend (services/expiry.py) owns every rule; this only reads the codes
// so a stray -3 can never be treated as a number of days.
export const NEVER_EXPIRES = -1
export const NOT_RECOMMENDED = -2
export const UNKNOWN = -3

// The longest number of days the pickers accept (100 years).
export const MAX_SHELF_LIFE_DAYS = 36500

export type Place = 'pantry' | 'fridge' | 'freezer'

export const PLACES: Place[] = ['pantry', 'fridge', 'freezer']

export const PLACE_LABELS: Record<Place, string> = {
  pantry: 'Pantry',
  fridge: 'Fridge',
  freezer: 'Freezer',
}

// The API spells places in capitals.
export const PLACE_API_NAMES: Record<Place, 'PANTRY' | 'FRIDGE' | 'FREEZER'> = {
  pantry: 'PANTRY',
  fridge: 'FRIDGE',
  freezer: 'FREEZER',
}

// "Other" storage uses the pantry's value, same as the backend.
export function placeForStorageType(type: StorageLocationType): Place {
  if (type === 'FRIDGE') return 'fridge'
  if (type === 'FREEZER') return 'freezer'
  return 'pantry'
}

// The food's own number of days for a storage type, or null when that place
// has no number (never expires, not recommended, unknown, or the value wasn't
// loaded, as on a shopping-list line that only knows the food's id and name):
// nothing to suggest.
export function shelfLifeDays(
  food: Partial<
    Pick<
      FoodDefinition,
      'pantry_shelf_life_days' | 'fridge_shelf_life_days' | 'freezer_shelf_life_days'
    >
  >,
  type: StorageLocationType,
): number | null {
  const value = food[`${placeForStorageType(type)}_shelf_life_days` as const]
  return value !== undefined && value > 0 ? value : null
}

// An item's own copy of the three place values.
export interface PlaceValues {
  pantry: number
  fridge: number
  freezer: number
}

export function itemPlaceValues(item: {
  pantry_days: number
  fridge_days: number
  freezer_days: number
}): PlaceValues {
  return { pantry: item.pantry_days, fridge: item.fridge_days, freezer: item.freezer_days }
}

// Calendar-day arithmetic on plain YYYY-MM-DD strings, done in UTC so a day
// never shifts with the time zone. The backend counts an item's days from the
// UTC date it was added, so the screen has to as well.
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// The UTC calendar date of a timestamp (what the backend means by "the day it
// was added").
export function utcDate(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

// Whole days between two YYYY-MM-DD dates (later minus earlier).
export function daysBetween(later: string, earlier: string): number {
  const a = Date.parse(`${later}T00:00:00Z`)
  const b = Date.parse(`${earlier}T00:00:00Z`)
  return Math.round((a - b) / 86_400_000)
}

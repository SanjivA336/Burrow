import type { InventoryItem } from '../types/entities'

// The ways the inventory list can be ordered. Each mode is just a comparison function, so adding
// another later is one entry in SORTS plus one label; nothing else needs to know about it.
export type InventorySort = 'recent' | 'name' | 'expiry' | 'remaining' | 'added'

export const INVENTORY_SORTS: InventorySort[] = ['recent', 'name', 'expiry', 'remaining', 'added']

export const INVENTORY_SORT_LABELS: Record<InventorySort, string> = {
  recent: 'Recently used',
  name: 'Name (A to Z)',
  expiry: 'Expiry date',
  remaining: 'Amount left',
  added: 'Newest added',
}

export const DEFAULT_INVENTORY_SORT: InventorySort = 'recent'

export function isInventorySort(value: unknown): value is InventorySort {
  return INVENTORY_SORTS.includes(value as InventorySort)
}

type Compare = (a: InventoryItem, b: InventoryItem) => number

// Sooner first; no date at all goes last (nothing to act on).
const byExpiry: Compare = (a, b) => {
  if (a.expiry_date === b.expiry_date) return 0
  if (!a.expiry_date) return 1
  if (!b.expiry_date) return -1
  return a.expiry_date < b.expiry_date ? -1 : 1
}

// How full it is, 0 to 1. Emptiest first, so the nearly-finished one gets used up.
const fractionLeft = (item: InventoryItem) =>
  Number(item.total_quantity) > 0 ? Number(item.quantity) / Number(item.total_quantity) : 1

const byRemaining: Compare = (a, b) => fractionLeft(a) - fractionLeft(b)

// food_name is the nickname when there is one, else the food's own name.
const byName: Compare = (a, b) =>
  a.food_name.localeCompare(b.food_name, undefined, { sensitivity: 'base' })

const byAdded: Compare = (a, b) => b.created_at.localeCompare(a.created_at)

// The day an item was last used, as the start of that day on THIS device (so a use at 11pm counts
// as that evening, not the next morning's UTC date). Never used = -Infinity, which sorts after
// every real day.
function usedDay(item: InventoryItem): number {
  if (!item.last_used_at) return -Infinity
  const d = new Date(item.last_used_at)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Recently used: the item you opened most recently comes first, since that is the one you reach
// for. Days are the buckets (two items used today are tied, whatever the hour); within a day the
// one that expires sooner comes first, then the one with less left. Never-used items follow all
// the used ones, in that same expiry-then-amount order.
const byRecent: Compare = (a, b) => {
  const dayA = usedDay(a)
  const dayB = usedDay(b)
  if (dayA !== dayB) return dayB > dayA ? 1 : -1
  return byExpiry(a, b) || byRemaining(a, b)
}

const SORTS: Record<InventorySort, Compare[]> = {
  recent: [byRecent],
  name: [byName],
  expiry: [byExpiry, byRemaining],
  remaining: [byRemaining, byExpiry],
  added: [byAdded],
}

// Returns a new array. Ties fall through to the name so the order never shuffles between loads.
export function sortInventory(items: InventoryItem[], sort: InventorySort): InventoryItem[] {
  const compares = [...SORTS[sort], byName]
  return [...items].sort((a, b) => {
    for (const compare of compares) {
      const result = compare(a, b)
      if (result !== 0) return result
    }
    return 0
  })
}

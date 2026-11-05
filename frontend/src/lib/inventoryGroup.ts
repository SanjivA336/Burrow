// How the inventory list is split into headed sections. Like the sort order, it is each person's own
// choice and is remembered on their device (see InventoryPage), never shared with the burrow.
export type InventoryGroup = 'none' | 'storage' | 'category'

export const INVENTORY_GROUPS: InventoryGroup[] = ['none', 'storage', 'category']

export const INVENTORY_GROUP_LABELS: Record<InventoryGroup, string> = {
  none: 'No grouping',
  storage: 'By storage location',
  category: 'By food type',
}

export const DEFAULT_INVENTORY_GROUP: InventoryGroup = 'none'

// What is written to localStorage. The first two keep the names of the old flat/grouped switch, so
// a choice someone already saved still works after this became a menu.
const STORED_VALUE: Record<InventoryGroup, string> = {
  none: 'flat',
  storage: 'sectional',
  category: 'category',
}

export function groupToStored(group: InventoryGroup): string {
  return STORED_VALUE[group]
}

// null when nothing valid is stored (so the default applies and nothing is overwritten).
export function groupFromStored(raw: string | null): InventoryGroup | null {
  return INVENTORY_GROUPS.find((group) => STORED_VALUE[group] === raw) ?? null
}

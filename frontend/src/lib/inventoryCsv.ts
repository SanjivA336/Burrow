import { FOOD_CATEGORY_LABELS } from './foodCategories'
import { UNIT_LABELS } from './units'
import type { InventoryItem, Member } from '../types/entities'

// Wraps a field in quotes (doubling any internal quotes) only when it
// actually needs it -- a comma, quote, or newline inside the value would
// otherwise break column alignment for anything that opens this file.
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

// Client-side only: builds the file in the browser from the items it is given and hands it to the
// browser as a download, so nothing extra is stored or sent anywhere.
export function downloadInventoryAsCsv(items: InventoryItem[], members: Member[]) {
  const nameById = new Map(members.map((m) => [m.id, m.nickname]))
  const header = [
    'Food',
    'Nickname',
    'Category',
    'Quantity',
    'Total quantity',
    'Unit',
    'Storage location',
    'Cost',
    'Status',
    'Expiry date',
    'Buyer',
    'Shared with',
    'Purchased at',
  ]
  const rows = items.map((item) => [
    item.food_name,
    item.name_override ?? '',
    item.category ? FOOD_CATEGORY_LABELS[item.category] : '',
    item.quantity,
    item.total_quantity,
    UNIT_LABELS[item.preferred_unit],
    item.storage_location_name,
    item.cost,
    item.status,
    item.expiry_date ?? '',
    nameById.get(item.buyer_member_id) ?? '',
    item.allowed_member_ids.map((id) => nameById.get(id) ?? '').join('; '),
    item.purchased_at,
  ])
  const csv = [header, ...rows]
    .map((row) => row.map((v) => csvField(String(v))).join(','))
    .join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

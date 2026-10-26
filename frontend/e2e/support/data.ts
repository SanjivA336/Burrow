import { HID, MY_USER_ID } from './env'

// The small burrow every test starts from: two members (you are Sanjiv), a fridge and a pantry,
// and four items. Shaped like the real API's responses (see frontend/src/types/entities.ts).

const LONG_AGO = '2026-10-01T00:00:00Z'

export const ME = 'm1'
export const OTHER = 'm2'

export const members = [
  {
    id: ME,
    household_id: HID,
    user_id: MY_USER_ID,
    nickname: 'Sanjiv',
    is_admin: true,
    is_active: true,
    joined_at: LONG_AGO,
  },
  {
    id: OTHER,
    household_id: HID,
    user_id: 'u2',
    nickname: 'Ana',
    is_admin: false,
    is_active: true,
    joined_at: LONG_AGO,
  },
]

export const locations = [
  { id: 'l1', household_id: HID, name: 'Fridge', type: 'FRIDGE', created_at: LONG_AGO },
  { id: 'l2', household_id: HID, name: 'Pantry', type: 'PANTRY', created_at: LONG_AGO },
]

export function household(splitCosts: boolean) {
  return {
    id: HID,
    name: '606 Standard',
    join_code: 'K4BCTJ77',
    owner_id: MY_USER_ID,
    preferred_unit_system: 'METRIC',
    split_costs: splitCosts,
    created_at: LONG_AGO,
    updated_at: LONG_AGO,
  }
}

function item(id: string, name: string, locationId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    household_id: HID,
    household_food_variant_id: `variant-${id}`,
    purchase_event_id: `purchase-${id}`,
    storage_location_id: locationId,
    storage_location_name: locationId === 'l1' ? 'Fridge' : 'Pantry',
    storage_location_type: locationId === 'l1' ? 'FRIDGE' : 'PANTRY',
    food_name: name,
    food_type_name: name,
    food_type_missing: false,
    category: 'PANTRY',
    name_override: null,
    quantity: '2.000',
    total_quantity: '2.000',
    preferred_unit: 'count',
    cost: '4.99',
    purchased_at: LONG_AGO,
    expiry_date: null,
    status: 'ACTIVE',
    accounting_type: 'PERSONAL',
    split_member_count: null,
    debt_finalized_at: null,
    created_at: LONG_AGO,
    updated_at: LONG_AGO,
    buyer_member_id: ME,
    allowed_member_ids: [ME],
    ...extra,
  }
}

export const items = [
  item('i1', 'Eggs', 'l1'),
  item('i2', 'Milk', 'l1'),
  item('i3', 'Peanut Butter', 'l2'),
  // Shared between two people, so the Use dialog shows a personal "Your share" bar.
  item('i4', 'Shared Rice', 'l2', {
    accounting_type: 'SHARED',
    allowed_member_ids: [ME, OTHER],
    cost: '6.00',
  }),
]

export const wholeMilk = {
  id: 'f-milk',
  name: 'Whole Milk',
  preferred_unit: 'ml',
  category: 'DAIRY_ALTERNATIVES',
  accounting_type_default: 'SHARED',
  pantry_shelf_life_days: -3,
  fridge_shelf_life_days: 7,
  freezer_shelf_life_days: 90,
  is_verified: true,
  usage_count: 5,
  duplicate_of_id: null,
  created_at: LONG_AGO,
  updated_at: LONG_AGO,
}

// An empty manual order, which is what the Add Item sheet creates when it opens.
export const emptySession = {
  id: 'sess-1',
  household_id: HID,
  source: 'MANUAL',
  status: 'DRAFT',
  created_by_member_id: ME,
  created_at: LONG_AGO,
  updated_at: LONG_AGO,
  items: [
    {
      id: 'sess-item-1',
      session_id: 'sess-1',
      position: 0,
      raw_line_text: '',
      parsed_name: null,
      parsed_quantity: null,
      parsed_unit: null,
      parsed_price: null,
      global_food_definition_id: null,
      food_name: null,
      category: null,
      storage_location_id: null,
      storage_location_name: null,
      quantity: null,
      preferred_unit: null,
      cost: null,
      expiry_date: null,
      name_override: null,
      accounting_type: null,
      allowed_member_ids: [],
      buyer_member_id: null,
      shopping_list_item_id: null,
      status: 'PENDING',
      created_inventory_item_id: null,
      created_at: LONG_AGO,
      updated_at: LONG_AGO,
    },
  ],
}

// Twelve months ending this month, with spending only in the last two.
export function spending() {
  const now = new Date()
  const months = []
  for (let back = 11; back >= 0; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    months.push({
      month: d.toISOString().slice(0, 7),
      total: back === 0 ? '30.00' : back === 1 ? '20.00' : '0',
      purchases: back < 2 ? 3 : 0,
    })
  }
  return {
    months,
    total: '50.00',
    foods: [
      { name: 'Eggs', total: '12.50', purchases: 3 },
      { name: 'Milk', total: '9.00', purchases: 2 },
      { name: 'Rice', total: '6.00', purchases: 1 },
    ],
  }
}

// What the burrow's last purchase of Whole Milk looked like (see the autofill tests).
export const lastMilkPurchase = {
  quantity: '2',
  unit: 'ml',
  cost: '4.50',
  storage_location_id: 'l2',
  allowed_member_ids: [ME],
  nickname: null,
}

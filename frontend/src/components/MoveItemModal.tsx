import { useState } from 'react'
import { Check, Refrigerator, Snowflake, Warehouse, Package } from 'lucide-react'
import { apiClient, ApiError } from '../lib/apiClient'
import type { InventoryItem, StorageLocation, StorageLocationType } from '../types/entities'
import { Modal } from './Modal'

const TYPE_ICONS: Record<StorageLocationType, typeof Package> = {
  FRIDGE: Refrigerator,
  FREEZER: Snowflake,
  PANTRY: Warehouse,
  OTHER: Package,
}

// The short way to move an item: pick where it goes from a list, without opening the
// item. (The longer way is still its own page: change "Storage location" and save.)
// The server works out the new expiry date for the new place, the same as there.
export function MoveItemModal({
  householdId,
  item,
  locations,
  onClose,
  onMoved,
}: {
  householdId: string
  item: InventoryItem
  locations: StorageLocation[]
  onClose: () => void
  onMoved: () => void
}) {
  const [movingTo, setMovingTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const move = async (location: StorageLocation) => {
    setError(null)
    setMovingTo(location.id)
    try {
      await apiClient.patch(`/api/households/${householdId}/inventory-items/${item.id}`, {
        storage_location_id: location.id,
      })
      onMoved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      setMovingTo(null)
    }
  }

  return (
    <Modal title={`Move ${item.food_name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        Where is it going? Its expiry date will adjust for the new place.
      </p>
      <ul className="flex flex-col gap-2">
        {locations.map((location) => {
          const Icon = TYPE_ICONS[location.type]
          const here = location.id === item.storage_location_id
          return (
            <li key={location.id}>
              <button
                type="button"
                disabled={here || movingTo !== null}
                onClick={() => void move(location)}
                className="flex w-full items-center gap-3 rounded-control border border-subtle bg-surface px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-hover disabled:cursor-default disabled:opacity-60 disabled:hover:bg-surface"
              >
                <Icon size={18} strokeWidth={1.75} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{location.name}</span>
                {here && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-faint">
                    <Check size={14} strokeWidth={2} />
                    Here now
                  </span>
                )}
                {movingTo === location.id && (
                  <span className="shrink-0 text-xs text-faint">Moving…</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  )
}

import { useState } from 'react'
import { apiClient, ApiError } from '../lib/apiClient'
import { FOOD_CATEGORIES, FOOD_CATEGORY_LABELS } from '../lib/foodCategories'
import { UNKNOWN, type Place, type PlaceValues } from '../lib/shelfLife'
import { DIMENSION_LABELS, UNITS_BY_DIMENSION, UNIT_LABELS } from '../lib/units'
import type { Dimension, FoodCategory, FoodDefinition, Unit } from '../types/entities'
import { ShelfLifeRow } from './ShelfLifeField'

const DIMENSIONS: Dimension[] = ['WEIGHT', 'VOLUME', 'COUNT']

const selectClass =
  'w-full rounded-control border border-subtle bg-field px-2 py-2 text-sm text-text shadow-field'

interface Props {
  // The name being created (what the person typed in the search box).
  name: string
  onCreated: (food: FoodDefinition) => void
}

// The form for making a food of your own: its unit, its category, and how long
// it keeps in each place. Shared by the two places a food can be created (the
// add-item search and the recipe/receipt rows), so they can't drift apart.
export function CreateFoodForm({ name, onCreated }: Props) {
  const [unit, setUnit] = useState<Unit>('count')
  const [category, setCategory] = useState<FoodCategory>('OTHER')
  const [lives, setLives] = useState<PlaceValues>({
    pantry: UNKNOWN,
    fridge: UNKNOWN,
    freezer: UNKNOWN,
  })
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const create = async () => {
    setError(null)
    setCreating(true)
    try {
      const food = await apiClient.post<FoodDefinition>('/api/food-definitions', {
        name,
        preferred_unit: unit,
        category,
        pantry_shelf_life_days: lives.pantry,
        fridge_shelf_life_days: lives.fridge,
        freezer_shelf_life_days: lives.freezer,
      })
      onCreated(food)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted">Unit</label>
        <select
          className={selectClass}
          value={unit}
          onChange={(e) => setUnit(e.target.value as Unit)}
        >
          {DIMENSIONS.map((dim) => (
            <optgroup key={dim} label={DIMENSION_LABELS[dim]}>
              {UNITS_BY_DIMENSION[dim].map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted">Category</label>
        <select
          className={selectClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as FoodCategory)}
        >
          {FOOD_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FOOD_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-muted">How many days it keeps</p>
        <ShelfLifeRow
          values={lives}
          onChange={(place: Place, next: number) => setLives((prev) => ({ ...prev, [place]: next }))}
        />
        <p className="mt-1.5 text-xs text-faint">
          Optional. Leave a place on Unknown if you're not sure.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => void create()}
        disabled={creating}
        className="rounded-control bg-primary px-2 py-2 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {creating ? 'Creating…' : 'Create'}
      </button>
    </div>
  )
}

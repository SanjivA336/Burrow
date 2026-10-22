import { useEffect, useState } from 'react'
import { apiClient, ApiError } from '../lib/apiClient'
import { FOOD_CATEGORIES, FOOD_CATEGORY_LABELS } from '../lib/foodCategories'
import { findSimilarFoods } from '../lib/similarFoods'
import { UNKNOWN, type Place, type PlaceValues } from '../lib/shelfLife'
import { DIMENSION_LABELS, UNITS_BY_DIMENSION, UNIT_LABELS } from '../lib/units'
import type { Dimension, FoodCategory, FoodDefinition, Unit } from '../types/entities'
import { CategoryDot } from './CategoryDot'
import { ShelfLifeRow } from './ShelfLifeField'

const DIMENSIONS: Dimension[] = ['WEIGHT', 'VOLUME', 'COUNT']

// Short on purpose: only what cannot be changed on an item (so it needs its own food),
// next to what can be (so it doesn't).
const NEW_FOOD_IF = ['Measured another way (weight vs count)', 'A different kind of food']
const SAME_FOOD_IF = [
  'Brand or flavor (use a nickname)',
  'Size or amount',
  'Expiry date',
  'Place or price',
]

const MAX_SIMILAR_SHOWN = 5

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
  // Foods with a similar name; null while still checking. The check never blocks:
  // if it fails the form just opens.
  const [similar, setSimilar] = useState<ReturnType<
    typeof findSimilarFoods<FoodDefinition>
  > | null>(null)
  const [confirmedDifferent, setConfirmedDifferent] = useState(false)

  useEffect(() => {
    // A different name needs its own "yes, it's different".
    setConfirmedDifferent(false)
    let cancelled = false
    apiClient
      .get<FoodDefinition[]>(`/api/food-definitions/search?query=${encodeURIComponent(name)}`)
      .then((foods) => !cancelled && setSimilar(findSimilarFoods(name, foods)))
      .catch(() => !cancelled && setSimilar([]))
    return () => {
      cancelled = true
    }
  }, [name])

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

  if (similar === null) {
    return <p className="text-sm text-muted">Checking for similar foods…</p>
  }

  if (similar.length > 0 && !confirmedDifferent) {
    const exact = similar.some((s) => s.match === 'same')
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-text">
          {exact ? 'This food already exists' : 'Is one of these what you meant?'}
        </p>
        <div className="flex flex-col gap-1">
          {similar.slice(0, MAX_SIMILAR_SHOWN).map(({ food }) => (
            <button
              key={food.id}
              type="button"
              onClick={() => onCreated(food)}
              className="flex w-full items-center gap-2 rounded-control border border-subtle bg-surface-2 px-2 py-2 text-left text-sm hover:bg-surface-hover"
            >
              <CategoryDot category={food.category} />
              <span className="flex-1">Use {food.name}</span>
            </button>
          ))}
        </div>
        {!exact && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-control border border-subtle p-2">
              <p className="mb-1 font-semibold text-text">Make a new food if…</p>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-muted">
                {NEW_FOOD_IF.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-control border border-subtle p-2">
              <p className="mb-1 font-semibold text-text">Use the existing food if…</p>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-muted">
                {SAME_FOOD_IF.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {!exact && (
          <button
            type="button"
            onClick={() => setConfirmedDifferent(true)}
            className="rounded-control border border-subtle px-2 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            None of these, make a new one
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="createfoodform-57" className="mb-1.5 block text-sm font-medium text-muted">
          Unit
        </label>
        <select
          id="createfoodform-57"
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
        <label htmlFor="createfoodform-75" className="mb-1.5 block text-sm font-medium text-muted">
          Category
        </label>
        <select
          id="createfoodform-75"
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
          onChange={(place: Place, next: number) =>
            setLives((prev) => ({ ...prev, [place]: next }))
          }
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

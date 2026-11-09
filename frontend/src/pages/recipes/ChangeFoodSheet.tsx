import { useEffect, useState } from 'react'
import { CategoryDot } from '../../components/CategoryDot'
import { Modal } from '../../components/Modal'
import { apiClient } from '../../lib/apiClient'
import type { MentionFood } from '../../lib/recipeMentions'
import type { FoodDefinition } from '../../types/entities'

interface Props {
  // The food named in the step being changed.
  current: MentionFood
  // How many mentions of it the recipe has in all (this one included).
  mentionCount: number
  // The recipe's other ingredients, offered first as quick picks.
  otherIngredients: readonly MentionFood[]
  // 'all' changes every mention and swaps the ingredient row too; 'one' changes just this mention
  // and keeps the old ingredient.
  onApply: (food: MentionFood, scope: 'one' | 'all') => void
  onClose: () => void
}

const secondary =
  'w-full rounded-control border border-subtle px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text'
const primary =
  'w-full rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-primary-hover'

// Change which food a step names. Two stages: pick the new food (from the recipe's ingredients or
// a search; never chosen for the person), then say how far the change goes.
export function ChangeFoodSheet({
  current,
  mentionCount,
  otherIngredients,
  onApply,
  onClose,
}: Props) {
  const [picked, setPicked] = useState<MentionFood | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodDefinition[]>([])

  useEffect(() => {
    if (query.trim() === '') {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        setResults(
          await apiClient.get<FoodDefinition[]>(
            `/api/food-definitions/search?query=${encodeURIComponent(query)}`,
          ),
        )
      } catch {
        setResults([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  if (picked) {
    const many = mentionCount > 1
    return (
      <Modal title={`Change “${current.name}”`} onClose={onClose}>
        <p className="mb-3 text-sm text-muted">
          {many
            ? `${current.name} is named ${mentionCount} times in your steps. Change them all to ${picked.name}, or just this one?`
            : `Change this to ${picked.name}. Should the ingredients follow?`}
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => onApply(picked, 'all')} className={primary}>
            {many
              ? `All ${mentionCount} mentions (swaps ${current.name} for ${picked.name} in the ingredients)`
              : `Swap ${current.name} for ${picked.name} in the ingredients`}
          </button>
          <button type="button" onClick={() => onApply(picked, 'one')} className={secondary}>
            {many
              ? `Just this one (adds ${picked.name}, keeps ${current.name})`
              : `Keep ${current.name} in the ingredients (adds ${picked.name})`}
          </button>
          <button type="button" onClick={() => setPicked(null)} className={secondary}>
            Back
          </button>
        </div>
      </Modal>
    )
  }

  const pickable = otherIngredients.filter((f) => f.id !== current.id)
  return (
    <Modal title={`Change “${current.name}” to…`} onClose={onClose}>
      {pickable.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-muted">In your ingredients</p>
          <div className="flex flex-col gap-1">
            {pickable.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => setPicked(food)}
                className="w-full rounded-control border border-subtle bg-surface px-2 py-2 text-left text-sm hover:bg-surface-hover"
              >
                {food.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mb-1 text-xs font-medium text-muted">Search for a food</p>
      <input
        type="text"
        autoFocus
        aria-label="Search for a food"
        placeholder="Search for a food (e.g. milk)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-control border border-subtle bg-field px-2 py-2 text-sm text-text shadow-field outline-none placeholder:text-faint focus:border-primary"
      />
      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {results
            .filter((food) => food.id !== current.id)
            .map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => setPicked({ id: food.id, name: food.name })}
                className="flex w-full items-center gap-2 rounded-control border border-subtle bg-surface px-2 py-2 text-left text-sm hover:bg-surface-hover"
              >
                <CategoryDot category={food.category} />
                <span className="flex-1">{food.name}</span>
                {!food.is_verified && <span className="text-xs text-faint">(user-created)</span>}
              </button>
            ))}
        </div>
      )}
      <button type="button" onClick={onClose} className={`mt-3 ${secondary}`}>
        Cancel
      </button>
    </Modal>
  )
}

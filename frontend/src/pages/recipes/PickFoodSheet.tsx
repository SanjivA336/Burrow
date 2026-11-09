import { useEffect, useState } from 'react'
import { CategoryDot } from '../../components/CategoryDot'
import { Modal } from '../../components/Modal'
import { apiClient } from '../../lib/apiClient'
import type { FoodDefinition } from '../../types/entities'

interface Props {
  // The word in the brackets that no ingredient matches.
  label: string
  onPick: (food: FoodDefinition) => void
  onClose: () => void
}

// "Which food is this?" for a word the app could not tie to an ingredient. Like the barcode scan,
// it searches the whole word and then each word on its own, and always shows a short list to pick
// from: it never chooses for the person.
export function PickFoodSheet({ label, onPick, onClose }: Props) {
  const [foods, setFoods] = useState<FoodDefinition[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const words = label
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2)
    const queries = [label, ...(words.length > 1 ? words : [])]
    void Promise.all(
      queries.map((query) =>
        apiClient
          .get<FoodDefinition[]>(`/api/food-definitions/search?query=${encodeURIComponent(query)}`)
          .catch(() => [] as FoodDefinition[]),
      ),
    ).then((lists) => {
      if (cancelled) return
      const seen = new Set<string>()
      const merged: FoodDefinition[] = []
      for (const food of lists.flat()) {
        if (seen.has(food.id)) continue
        seen.add(food.id)
        merged.push(food)
      }
      setFoods(merged.slice(0, 6))
    })
    return () => {
      cancelled = true
    }
  }, [label])

  return (
    <Modal title={`Which food is “${label}”?`} onClose={onClose}>
      {foods === null ? (
        <p role="status" className="text-sm text-muted">
          Looking…
        </p>
      ) : foods.length === 0 ? (
        <p className="text-sm text-muted">
          No matching food. Remove the brackets, or create the food from the ingredients list first.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {foods.map((food) => (
            <button
              key={food.id}
              type="button"
              onClick={() => onPick(food)}
              className="flex w-full items-center gap-2 rounded-control border border-subtle bg-surface px-2 py-2 text-left text-sm hover:bg-surface-hover"
            >
              <CategoryDot category={food.category} />
              <span className="flex-1">{food.name}</span>
              {!food.is_verified && <span className="text-xs text-faint">(user-created)</span>}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full rounded-control border border-subtle px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        Cancel
      </button>
    </Modal>
  )
}

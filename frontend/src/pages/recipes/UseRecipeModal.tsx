import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { apiClient, ApiError } from '../../lib/apiClient'
import { formatQuantity } from '../../lib/formatQuantity'
import { scaledQuantityLabel, stockOf } from '../../lib/ingredientStock'
import { UNIT_LABELS } from '../../lib/units'
import type { RecipeDetail } from '../../types/entities'
import { StockIcon } from './ingredientStock'

interface Props {
  recipe: RecipeDetail
  householdId: string
  // The servings the person has chosen on the recipe page; the amounts follow it.
  servings: number
  onClose: () => void
  // Called after the stock was taken out, so the page can refresh what it shows.
  onUsed: () => void
}

// What each view of the modal is showing: pick the ingredients, review what will come out, or (only
// when the server says an item would be used up) ask whether that is really what they want.
type View = { name: 'pick' } | { name: 'review' } | { name: 'confirm'; message: string }

const primary =
  'rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50'
const secondary =
  'rounded-control border border-subtle px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-50'

// "I made this": choose which ingredients were used, check the amounts, and take them out of the
// kitchen. The amounts are not sent; the server works them out from the recipe and the servings, so
// what is removed always matches what is shown here.
export function UseRecipeModal({ recipe, householdId, servings, onClose, onUsed }: Props) {
  const scale = recipe.servings ? servings / recipe.servings : 1
  const ingredients = [...recipe.ingredients].sort((a, b) => a.position - b.position)
  // Required ingredients start ticked, optional ones start unticked.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(ingredients.filter((i) => !i.is_optional).map((i) => i.id)),
  )
  const [view, setView] = useState<View>({ name: 'pick' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = ingredients.filter((i) => selected.has(i.id))
  // Ticked ingredients the kitchen has none of: they cannot be used, so Submit stays off.
  const missing = chosen.filter((i) => stockOf(i, scale).state === 'none')

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = async (confirmDepletion: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await apiClient.post(`/api/households/${householdId}/recipes/${recipe.id}/use`, {
        servings,
        ingredient_ids: chosen.map((i) => i.id),
        confirm_depletion: confirmDepletion,
      })
      onUsed()
    } catch (err) {
      if (err instanceof ApiError && err.code === '409') {
        // The server's way of saying "this empties something, ask first".
        setView({ name: 'confirm', message: err.message })
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong')
        setView({ name: 'review' })
      }
    } finally {
      setBusy(false)
    }
  }

  if (view.name === 'pick') {
    return (
      <Modal title="Which ingredients did you use?" onClose={onClose}>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={secondary}
            onClick={() => setSelected(new Set(ingredients.map((i) => i.id)))}
          >
            Select all
          </button>
          <button
            type="button"
            className={secondary}
            onClick={() =>
              setSelected(new Set(ingredients.filter((i) => !i.is_optional).map((i) => i.id)))
            }
          >
            Select all required
          </button>
        </div>
        <ul className="mt-3 flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
          {ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-control px-1.5 py-2 hover:bg-surface-hover">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={selected.has(ingredient.id)}
                  onChange={() => toggle(ingredient.id)}
                />
                <span className="min-w-0 flex-1 text-sm">
                  {scaledQuantityLabel(ingredient, scale)}{' '}
                  <span className="font-medium">{ingredient.food_name}</span>
                  {ingredient.is_optional && (
                    <span className="ml-2 rounded-pill border border-dashed border-subtle px-1.5 py-0.5 text-xs text-muted">
                      Optional
                    </span>
                  )}
                </span>
                <StockIcon
                  stock={stockOf(ingredient, scale).state}
                  optional={ingredient.is_optional}
                />
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <button type="button" className={`${secondary} flex-1`} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${primary} flex-1`}
            disabled={chosen.length === 0}
            onClick={() => setView({ name: 'review' })}
          >
            Next
          </button>
        </div>
      </Modal>
    )
  }

  if (view.name === 'confirm') {
    return (
      <Modal title="Use it up?" onClose={onClose}>
        <p role="alert" className="text-sm text-text">
          {view.message}. Using it will empty it.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`${secondary} flex-1`}
            disabled={busy}
            onClick={() => setView({ name: 'review' })}
          >
            Go back
          </button>
          <button
            type="button"
            className={`${primary} flex-1`}
            disabled={busy}
            onClick={() => void submit(true)}
          >
            {busy ? 'Removing…' : 'Yes, use it up'}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Remove from your kitchen" onClose={onClose}>
      <p className="text-sm text-muted">
        Servings: <span className="font-semibold text-text">{formatQuantity(servings)}</span>
      </p>
      <ul className="mt-3 flex max-h-[45vh] flex-col gap-1.5 overflow-y-auto">
        {chosen.map((ingredient) => {
          const stock = stockOf(ingredient, scale)
          return (
            <li key={ingredient.id} className="text-sm">
              <span className="font-medium">{scaledQuantityLabel(ingredient, scale)}</span>{' '}
              {ingredient.food_name}
              {stock.state === 'low' && stock.onHand !== null && (
                <span className="ml-2 text-xs text-warning">
                  You only have {formatQuantity(stock.onHand)} {UNIT_LABELS[ingredient.unit]}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {missing.length > 0 && (
        <p role="alert" className="mt-3 rounded-control bg-danger-soft p-3 text-sm text-danger">
          You don&apos;t have {missing.map((i) => i.food_name).join(', ')} in your kitchen. Go back
          and untick {missing.length === 1 ? 'it' : 'them'}.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className={`${secondary} flex-1`}
          disabled={busy}
          onClick={() => setView({ name: 'pick' })}
        >
          Back
        </button>
        <button type="button" className={`${secondary} flex-1`} disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`${primary} flex-1`}
          disabled={busy || missing.length > 0}
          onClick={() => void submit(false)}
        >
          {busy ? 'Removing…' : 'Submit'}
        </button>
      </div>
    </Modal>
  )
}

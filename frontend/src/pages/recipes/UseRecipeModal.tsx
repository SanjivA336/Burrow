import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { NumberInput } from '../../components/NumberInput'
import { UsageBar } from '../../components/UsageBar'
import { apiClient, ApiError } from '../../lib/apiClient'
import { formatQuantity } from '../../lib/formatQuantity'
import { scaledQuantityLabel, stockOf } from '../../lib/ingredientStock'
import { UNIT_LABELS } from '../../lib/units'
import type { RecipeDetail, UsePreviewItem, UsePreviewResult } from '../../types/entities'
import { FoodChip, StockIcon } from './ingredientStock'

interface Props {
  recipe: RecipeDetail
  householdId: string
  // The servings chosen on the recipe page, where the modal starts. It can be changed on the
  // review step, and then only here: the recipe page keeps its own.
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
export function UseRecipeModal({
  recipe,
  householdId,
  servings: startingServings,
  onClose,
  onUsed,
}: Props) {
  const [servings, setServings] = useState(startingServings)
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

  // How much each ticked ingredient would leave in the kitchen, asked of the server (it knows which
  // items would be used and what they are stored in). Fetched when the review opens.
  const [preview, setPreview] = useState<UsePreviewItem[] | null>(null)
  const chosenKey = chosen.map((i) => i.id).join(',')
  const reviewing = view.name === 'review'
  useEffect(() => {
    if (!reviewing || !chosenKey) return
    let stale = false
    setPreview(null)
    apiClient
      .post<UsePreviewResult>(`/api/households/${householdId}/recipes/${recipe.id}/use-preview`, {
        servings,
        ingredient_ids: chosenKey.split(','),
      })
      .then((result) => {
        if (!stale) setPreview(result.items)
      })
      // The review still works without the bars; the amounts are shown as text.
      .catch(() => {
        if (!stale) setPreview([])
      })
    return () => {
      stale = true
    }
  }, [reviewing, chosenKey, servings, householdId, recipe.id])

  // One button for the bulk choices, which reads the current selection and offers the next sensible
  // step: everything ticked -> drop the optional ones; every required one ticked -> tick all; a
  // required one missing -> tick exactly the required ones. With no optional ingredients there is
  // nothing to drop once everything is ticked, so it hides.
  const requiredIds = ingredients.filter((i) => !i.is_optional).map((i) => i.id)
  const allSelected = ingredients.every((i) => selected.has(i.id))
  const requiredAllSelected = requiredIds.every((id) => selected.has(id))
  const bulk = allSelected
    ? { label: 'Deselect optional', pick: requiredIds }
    : requiredAllSelected
      ? { label: 'Select all', pick: ingredients.map((i) => i.id) }
      : { label: 'Select required', pick: requiredIds }
  const showBulk = !(allSelected && ingredients.every((i) => !i.is_optional))

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
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {chosen.length} of {ingredients.length} selected
          </span>
          {showBulk && (
            <button
              type="button"
              className="rounded-control border border-subtle px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
              onClick={() => setSelected(new Set(bulk.pick))}
            >
              {bulk.label}
            </button>
          )}
        </div>
        {/* A scrolling stack of tiles, one per ingredient. A selected tile takes the accent colour.
            Underneath each is a real (visually hidden) checkbox, so the keyboard and screen readers
            work as with any checklist. A tap on the food chip opens its popout and does not toggle. */}
        <ul className="mt-3 flex max-h-[50vh] flex-col gap-2 overflow-y-auto p-1">
          {ingredients.map((ingredient) => {
            const isSelected = selected.has(ingredient.id)
            return (
              <li key={ingredient.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
                    isSelected
                      ? 'border-primary bg-primary-soft'
                      : 'border-subtle bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => toggle(ingredient.id)}
                  />
                  <StockIcon
                    stock={stockOf(ingredient, scale).state}
                    optional={ingredient.is_optional}
                  />
                  <span className="min-w-0 flex-1 text-sm leading-7">
                    <FoodChip ingredient={ingredient} scale={scale} />
                  </span>
                </label>
              </li>
            )
          })}
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
      {/* Changing the servings scales every amount below (and the preview is fetched again). */}
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="use-recipe-servings" className="text-muted">
          Servings
        </label>
        <NumberInput
          id="use-recipe-servings"
          decimals={0}
          className="w-20 rounded-control border border-subtle bg-field px-2 py-1.5 text-sm text-text shadow-field outline-none focus:border-primary"
          value={servings}
          onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))}
        />
        <span className="text-xs text-faint">(recipe as written: {recipe.servings})</span>
      </div>
      {/* One row per ticked ingredient: its food chip, how much it uses out of what is left (in the
          unit the food is stored in), and a bar like the one in the "use item" screen: the whole bar
          is everything bought, green is what is left now, blue is what this will use. */}
      <ul className="mt-3 flex max-h-[45vh] flex-col gap-3 overflow-y-auto p-1">
        {chosen.map((ingredient) => {
          const stock = stockOf(ingredient, scale)
          const row = preview?.find((p) => p.ingredient_id === ingredient.id)
          return (
            <li key={ingredient.id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <FoodChip ingredient={ingredient} scale={scale} />
                <span className="shrink-0 font-medium">
                  {row
                    ? `${formatQuantity(Number(row.using))} of ${formatQuantity(Number(row.left))} ${UNIT_LABELS[row.unit]}`
                    : stock.state === 'none'
                      ? 'None in your kitchen'
                      : scaledQuantityLabel(ingredient, scale)}
                </span>
              </div>
              {row && (
                <div aria-hidden="true">
                  <UsageBar
                    totalInUnit={Number(row.total)}
                    remainingInUnit={Number(row.left)}
                    plannedInUnit={Number(row.using)}
                  />
                </div>
              )}
              {stock.state === 'low' && stock.onHand !== null && (
                <p className="mt-1 text-xs text-warning">
                  You only have {formatQuantity(stock.onHand)} {UNIT_LABELS[ingredient.unit]}
                </p>
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

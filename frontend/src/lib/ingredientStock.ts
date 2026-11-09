import { formatQuantity } from './formatQuantity'
import { UNIT_LABELS } from './units'
import type { RecipeIngredient } from '../types/entities'

// How an ingredient stands against this kitchen's stock, as the app sees it.
export type Stock = 'have' | 'low' | 'none'

export function stockOf(
  ingredient: Pick<RecipeIngredient, 'available' | 'available_quantity' | 'quantity'>,
  scale: number,
): { state: Stock; onHand: number | null } {
  if (!ingredient.available) return { state: 'none', onHand: null }
  if (ingredient.available_quantity !== null) {
    const onHand = Number(ingredient.available_quantity)
    if (onHand < Number(ingredient.quantity) * scale) return { state: 'low', onHand }
  }
  return {
    state: 'have',
    onHand: ingredient.available_quantity === null ? null : Number(ingredient.available_quantity),
  }
}

export function scaledQuantityLabel(
  ingredient: Pick<RecipeIngredient, 'quantity' | 'unit'>,
  scale: number,
): string {
  // Scaling e.g. 1/3 servings can produce long floats that aren't meaningful at
  // kitchen-measurement precision, so this shares the app-wide display rule:
  // at most 2 decimal places, trailing zeros dropped.
  return `${formatQuantity(Number(ingredient.quantity) * scale)} ${UNIT_LABELS[ingredient.unit]}`
}

import { FOOD_CATEGORY_DOT_CLASSES, FOOD_CATEGORY_LABELS } from '../lib/foodCategories'
import type { FoodCategory } from '../types/entities'

// A small colored dot next to a food name -- `title` gives the category
// name on hover without needing a separate visible label everywhere.
// The faint outline (the text colour at low strength, so it flips with the theme) means a pale
// category such as dairy still shows up on a white page: it reads as a hollow dot, not as nothing.
export function CategoryDot({ category }: { category: FoodCategory | null }) {
  if (!category) return null
  return (
    <span
      title={FOOD_CATEGORY_LABELS[category]}
      className={`inline-block size-2.5 shrink-0 rounded-full border border-text/25 ${FOOD_CATEGORY_DOT_CLASSES[category]}`}
    />
  )
}

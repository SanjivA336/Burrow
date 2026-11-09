import { Fragment } from 'react'
import { CategoryDot } from '../../components/CategoryDot'
import { findMentions } from '../../lib/recipeMentions'
import type { RecipeIngredient } from '../../types/entities'

interface Props {
  // A saved step: foods appear as `[Label](food-id)`.
  text: string
  ingredients: readonly Pick<
    RecipeIngredient,
    'global_food_definition_id' | 'food_name' | 'category'
  >[]
}

// A step as read on the recipe page: each saved food mention becomes a small chip with the food's
// category dot and its current name. A mention whose food is not one of the ingredients (or a
// plain `[bracket]` with no id) is shown as ordinary text, so odd brackets in older recipes do
// no harm.
export function MentionText({ text, ingredients }: Props) {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const mention of findMentions(text)) {
    const food = mention.id
      ? ingredients.find((ing) => ing.global_food_definition_id === mention.id)
      : undefined
    if (!food) continue
    if (mention.start > cursor) parts.push(text.slice(cursor, mention.start))
    parts.push(
      <span
        key={mention.start}
        className="inline-flex items-center gap-1 rounded-pill bg-primary-soft px-2 py-0.5 align-baseline text-xs font-medium text-primary"
      >
        <CategoryDot category={food.category} />
        {food.food_name}
      </span>,
    )
    cursor = mention.end
  }
  if (cursor === 0) return <>{plainText(text)}</>
  parts.push(plainText(text.slice(cursor)))
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  )
}

// What a step reads like with the id parts removed: `[Label](id)` shows as the label.
function plainText(text: string): string {
  let out = ''
  let cursor = 0
  for (const mention of findMentions(text)) {
    if (!mention.id) continue
    out += text.slice(cursor, mention.start) + mention.label
    cursor = mention.end
  }
  return out + text.slice(cursor)
}

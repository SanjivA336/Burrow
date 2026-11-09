import type { DraftRecipe } from '../../types/entities'
import type { RecipeFormInitial } from './RecipeForm'

export function draftRecipeToFormInitial(draft: DraftRecipe): RecipeFormInitial {
  return {
    name: draft.name,
    description: draft.description,
    servings: draft.servings,
    prep_time_minutes: draft.prep_time_minutes,
    cook_time_minutes: draft.cook_time_minutes,
    instructions: draft.instructions.length > 0 ? draft.instructions : [''],
    ingredients: draft.ingredients.map((ing) => ({
      // The backend resolves an exact/close name match where it can
      // (inventory first, then the wider catalog) -- pre-select that food
      // directly rather than just seeding the search box with its name.
      // No match found -> same as before, the human picks via FoodSearchInput.
      food: ing.global_food_definition_id
        ? { id: ing.global_food_definition_id, name: ing.name }
        : null,
      // A plain number is tidied the way the inventory edit form does ("2.0" -> "2"); anything
      // else the AI wrote ("a pinch") is left for the person to fix.
      quantity:
        ing.quantity && Number.isFinite(Number(ing.quantity))
          ? String(Number(ing.quantity))
          : (ing.quantity ?? ''),
      unit: ing.unit ?? '',
      note: ing.note ?? '',
      optional: ing.is_optional ?? false,
      suggestedName: ing.name,
    })),
  }
}

import { useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../../lib/apiClient'
import { usePageTitle } from '../../hooks/usePageTitle'
import type { RecipeDetail } from '../../types/entities'
import { RecipesPage } from '.'
import { RecipeForm, type RecipeSubmitBody } from './RecipeForm'
import { RecipeSheet } from './RecipeSheet'

export function AddRecipePage() {
  usePageTitle('New Recipe')
  const { householdId } = useParams<{ householdId: string }>()
  const navigate = useNavigate()

  const onSubmit = async (body: RecipeSubmitBody) => {
    const recipe = await apiClient.post<RecipeDetail>(
      `/api/households/${householdId}/recipes`,
      body,
    )
    navigate(`/households/${householdId}/recipes/${recipe.id}`)
  }

  const discard = () => navigate(`/households/${householdId}/recipes`)

  // The recipe list stays on screen behind the sheet, so closing it lands on what was there.
  return (
    <>
      <RecipesPage />
      <RecipeSheet title="New recipe" onClose={discard}>
        <RecipeForm submitLabel="Create recipe" onDiscard={discard} onSubmit={onSubmit} />
      </RecipeSheet>
    </>
  )
}

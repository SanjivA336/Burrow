from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user_id, require_household_membership
from app.core.responses import Envelope, ok
from app.schemas.member import Member
from app.schemas.recipe import (
    CreateRecipeRequest,
    Recipe,
    RecipeDetail,
    UpdateRecipeRequest,
    UsePreviewResult,
    UseRecipeRequest,
    UseRecipeResult,
)
from app.services import recipe_use as recipe_use_service
from app.services import recipes as recipe_service

# Still nested under a household in the URL -- not because recipes belong to
# one (they're a personal recipe box now, see the 0023 migration), but
# because ingredient availability is always checked against whichever
# kitchen's pantry you're currently viewing from, and require_household_membership
# is what gates that access. The recipes returned are always the caller's
# own, regardless of household_id.
router = APIRouter(prefix="/households/{household_id}/recipes", tags=["recipes"])


@router.get("", response_model=Envelope[list[Recipe]])
def list_recipes(
    household_id: UUID,
    _member: Member = Depends(require_household_membership),
    user_id: UUID = Depends(get_current_user_id),
) -> Envelope[list[Recipe]]:
    return ok(recipe_service.list_recipes(user_id))


@router.post("", response_model=Envelope[RecipeDetail], status_code=status.HTTP_201_CREATED)
def create_recipe(
    household_id: UUID,
    body: CreateRecipeRequest,
    _member: Member = Depends(require_household_membership),
    user_id: UUID = Depends(get_current_user_id),
) -> Envelope[RecipeDetail]:
    return ok(recipe_service.create_recipe(household_id, user_id, body))


@router.get("/{recipe_id}", response_model=Envelope[RecipeDetail])
def get_recipe(
    household_id: UUID,
    recipe_id: UUID,
    _member: Member = Depends(require_household_membership),
    user_id: UUID = Depends(get_current_user_id),
) -> Envelope[RecipeDetail]:
    recipe = recipe_service.get_recipe(household_id, user_id, recipe_id)
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipe not found")
    return ok(recipe)


@router.patch("/{recipe_id}", response_model=Envelope[RecipeDetail])
def update_recipe(
    household_id: UUID,
    recipe_id: UUID,
    body: UpdateRecipeRequest,
    _member: Member = Depends(require_household_membership),
    user_id: UUID = Depends(get_current_user_id),
) -> Envelope[RecipeDetail]:
    try:
        recipe = recipe_service.update_recipe(household_id, user_id, recipe_id, body)
    except recipe_service.RecipeNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipe not found") from exc
    return ok(recipe)


@router.delete("/{recipe_id}", response_model=Envelope[None])
def delete_recipe(
    household_id: UUID,
    recipe_id: UUID,
    _member: Member = Depends(require_household_membership),
    user_id: UUID = Depends(get_current_user_id),
) -> Envelope[None]:
    deleted = recipe_service.delete_recipe(user_id, recipe_id)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipe not found")
    return ok(None)


@router.post("/{recipe_id}/use", response_model=Envelope[UseRecipeResult])
def use_recipe(
    household_id: UUID,
    recipe_id: UUID,
    body: UseRecipeRequest,
    caller: Member = Depends(require_household_membership),
    user_id: UUID = Depends(get_current_user_id),
) -> Envelope[UseRecipeResult]:
    """Cook the recipe: take the ticked ingredients out of this kitchen, all or nothing."""
    try:
        result = recipe_use_service.use_recipe(household_id, caller, user_id, recipe_id, body)
    except recipe_service.RecipeNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipe not found") from exc
    except recipe_use_service.UnknownIngredientError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "That ingredient isn't in this recipe"
        ) from exc
    except recipe_use_service.CantUseError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, ". ".join(exc.problems)) from exc
    except recipe_use_service.NeedsConfirmationError as exc:
        # 409 means "ask the person first": resending with confirm_depletion set goes through.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This will use up your " + ", ".join(exc.foods),
        ) from exc
    except recipe_use_service.StockChangedError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Your kitchen changed while you were cooking. Nothing was removed; try again.",
        ) from exc
    return ok(result)


@router.post("/{recipe_id}/use-preview", response_model=Envelope[UsePreviewResult])
def preview_use_recipe(
    household_id: UUID,
    recipe_id: UUID,
    body: UseRecipeRequest,
    caller: Member = Depends(require_household_membership),
    user_id: UUID = Depends(get_current_user_id),
) -> Envelope[UsePreviewResult]:
    """What Mark as cooked would do to each ticked ingredient's stock. Changes nothing."""
    try:
        result = recipe_use_service.preview_recipe_use(
            household_id, caller, user_id, recipe_id, body
        )
    except recipe_service.RecipeNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipe not found") from exc
    except recipe_use_service.UnknownIngredientError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "That ingredient isn't in this recipe"
        ) from exc
    return ok(result)

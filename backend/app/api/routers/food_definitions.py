from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.core.responses import Envelope, ok
from app.schemas.food_definition import CreateFoodDefinitionRequest, FoodDefinition
from app.services import food_definitions as food_definitions_service
from app.services import food_matching

router = APIRouter(prefix="/food-definitions", tags=["food-definitions"])


@router.get("/search", response_model=Envelope[list[FoodDefinition]])
def search_food_definitions(
    query: str = Query(min_length=1),
    limit: int = Query(default=10, ge=1, le=50),
    _user_id: UUID = Depends(get_current_user_id),
) -> Envelope[list[FoodDefinition]]:
    return ok(food_definitions_service.search(query, limit))


class MatchTermsRequest(BaseModel):
    terms: list[str] = Field(min_length=1, max_length=food_matching.MAX_TERMS)


@router.post("/match", response_model=Envelope[list[food_matching.TermMatch]])
def match_terms(
    body: MatchTermsRequest,
    _user_id: UUID = Depends(get_current_user_id),
) -> Envelope[list[food_matching.TermMatch]]:
    """Which of these words (taken from a recipe's steps) are foods. One request for the whole
    batch, so the recipe form makes a single call however long the steps are."""
    return ok(food_matching.match_terms(body.terms))


@router.post("", response_model=Envelope[FoodDefinition], status_code=status.HTTP_201_CREATED)
def create_food_definition(
    body: CreateFoodDefinitionRequest, user_id: UUID = Depends(get_current_user_id)
) -> Envelope[FoodDefinition]:
    try:
        return ok(food_definitions_service.create(user_id, body))
    except food_definitions_service.FoodNameTakenError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A food with that name already exists. Pick it from the search results instead.",
        ) from exc

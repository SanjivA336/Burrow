from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.units import Unit
from app.services.expiry import NOT_RECOMMENDED, UNKNOWN, is_valid_code


class AccountingType(StrEnum):
    # The one split rule for anyone but a solo owner -- an equal allotment
    # per person that degrades to usage-based billing for whoever exceeds
    # theirs (see services/accounting.py's compute_item_shares). Replaces
    # the old SHARED_CONSUMABLE/UNIT_BASED distinction; there's no longer a
    # mode to choose between at purchase time.
    SHARED = "SHARED"
    PERSONAL = "PERSONAL"


class FoodCategory(StrEnum):
    PROTEINS = "PROTEINS"
    VEGETABLES_HERBS = "VEGETABLES_HERBS"
    FRUITS = "FRUITS"
    GRAINS_BREADS = "GRAINS_BREADS"
    DAIRY_ALTERNATIVES = "DAIRY_ALTERNATIVES"
    SEASONINGS_SPICES = "SEASONINGS_SPICES"
    OILS_FATS = "OILS_FATS"
    SAUCES_CONDIMENTS = "SAUCES_CONDIMENTS"
    SNACKS_SWEETS = "SNACKS_SWEETS"
    BEVERAGES = "BEVERAGES"
    OTHER = "OTHER"


class FoodDefinition(BaseModel):
    id: UUID
    name: str
    preferred_unit: Unit
    category: FoodCategory
    accounting_type_default: AccountingType
    # Shelf life per place: a number of days, or a code (-1 never expires,
    # -2 not recommended, -3 unknown). See services/expiry.py.
    pantry_shelf_life_days: int = UNKNOWN
    fridge_shelf_life_days: int = UNKNOWN
    freezer_shelf_life_days: int = UNKNOWN
    # The account that added a custom food is kept in the database but not sent
    # out: this model is what the search returns to every signed-in user, and
    # nobody should be able to tell who made a food.
    is_verified: bool
    usage_count: int
    duplicate_of_id: UUID | None
    created_at: datetime
    updated_at: datetime


class CreateFoodDefinitionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    preferred_unit: Unit
    category: FoodCategory = FoodCategory.OTHER
    accounting_type_default: AccountingType = AccountingType.SHARED
    pantry_shelf_life_days: int = UNKNOWN
    fridge_shelf_life_days: int = UNKNOWN
    freezer_shelf_life_days: int = UNKNOWN

    @field_validator(
        "pantry_shelf_life_days", "fridge_shelf_life_days", "freezer_shelf_life_days"
    )
    @classmethod
    def _valid_place_value(cls, value: int) -> int:
        # "Not recommended" is only ever set on verified foods, never by a user
        # creating their own, so it is refused here.
        if not is_valid_code(value) or value == NOT_RECOMMENDED:
            raise ValueError("Use a number of days, -1 (never expires) or -3 (unknown)")
        return value

from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel

from app.schemas.food_definition import FoodDefinition
from app.schemas.units import Unit


class BarcodeLookupStatus(StrEnum):
    # This household has scanned and confirmed this barcode before; `remembered` holds
    # exactly what they confirmed, and the product database was not asked.
    REMEMBERED = "remembered"
    # The product database knows this barcode (it may still lack a category).
    FOUND = "found"
    # Valid barcode, but nobody has added it to the product database.
    NOT_FOUND = "not_found"
    # A store-printed code (by-weight meat, deli, coupons...). It only means something
    # inside that one store, so no product database can know it.
    STORE_CODE = "store_code"


class FoodBarcode(BaseModel):
    """One remembered barcode: what a household confirmed when it finished a line."""

    gtin: str
    global_food_definition_id: UUID
    name_override: str | None = None
    # The amount in ONE container, and its unit: both set or both None.
    quantity: Decimal | None = None
    preferred_unit: Unit | None = None
    container_count: int = 1


class RememberedBarcode(BaseModel):
    """The household's own confirmed answers for a barcode, ready to fill a line. Unlike
    the product database's suggestions, a size here is a number the person confirmed
    themselves for this exact product, so it is safe to prefill."""

    food: FoodDefinition
    name_override: str | None = None
    quantity: Decimal | None = None
    unit: Unit | None = None
    container_count: int = 1


class BarcodeLookup(BaseModel):
    """What a scan suggests. Every field is a suggestion for the person to confirm,
    never a final answer, and any of the optional ones can be missing.

    Nothing from the product database carries a size: a wrong quantity the person
    trusts is worse than a blank box that makes them check. A size only ever appears
    inside `remembered`, where it is the person's own confirmed number."""

    # The barcode normalized to 14 digits (see services/gtin.normalize_gtin).
    gtin: str
    status: BarcodeLookupStatus
    product_name: str | None = None
    brand: str | None = None
    # "fairlife Nutrition Plan Vanilla": goes in the row's nickname, so the generic
    # food type stays generic.
    suggested_nickname: str | None = None
    # Catalog foods that might be the right food type, best guess first. Can be empty.
    candidates: list[FoodDefinition] = []
    # Set only when status is REMEMBERED.
    remembered: RememberedBarcode | None = None

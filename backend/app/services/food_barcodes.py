"""The household's memory of barcodes it has scanned and confirmed (table food_barcodes).

A scan only suggests; this table holds what the person confirmed when they finished the
line, so the next scan of the same product fills the whole line without asking the product
database. Last confirmed wins: remembering a barcode again replaces the earlier answers.
"""

from decimal import Decimal
from uuid import UUID

from app.core.supabase import get_service_client
from app.schemas.barcode import FoodBarcode
from app.schemas.units import Unit
from app.services.gtin import is_store_code

_TABLE = "food_barcodes"


def get(household_id: UUID, gtin: str) -> FoodBarcode | None:
    """What this household confirmed for a normalized 14-digit barcode, if anything."""
    client = get_service_client()
    result = (
        client.table(_TABLE)
        .select("*")
        .eq("household_id", str(household_id))
        .eq("gtin", gtin)
        .maybe_single()
        .execute()
    )
    return FoodBarcode(**result.data) if result and result.data else None


def remember(
    household_id: UUID,
    gtin: str,
    *,
    food_definition_id: UUID,
    name_override: str | None,
    quantity: Decimal | None,
    unit: Unit | None,
    container_count: int,
) -> bool:
    """Saves (or replaces) the household's answers for a barcode. Returns False, saving
    nothing, for a store-printed code: it means something only inside one store, so
    remembering it would only ever mislead."""
    if is_store_code(gtin):
        return False
    # Size is stored as a pair: an amount with no unit (or the reverse) is meaningless.
    has_size = quantity is not None and unit is not None
    row = {
        "household_id": str(household_id),
        "gtin": gtin,
        "global_food_definition_id": str(food_definition_id),
        "name_override": (name_override or "").strip() or None,
        "quantity": str(quantity) if has_size else None,
        "preferred_unit": unit.value if has_size else None,
        "container_count": container_count,
    }
    client = get_service_client()
    client.table(_TABLE).upsert(row, on_conflict="household_id,gtin").execute()
    return True

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.food_definition import AccountingType, FoodCategory
from app.schemas.units import Unit
from app.services.expiry import EditMeaning, Place


class InventoryItemStatus(StrEnum):
    ACTIVE = "ACTIVE"
    EMPTY = "EMPTY"
    # DISCARDED and LOST are no longer reachable from RemovalReason below
    # (see its docstring) -- kept here, and left in the Postgres enum,
    # purely so existing rows written before that change (and the Postgres
    # enum type itself, which can't cleanly drop a value) keep reading back
    # correctly. Never written by any code path anymore.
    DISCARDED = "DISCARDED"
    EXPIRED = "EXPIRED"
    LOST = "LOST"
    # A distinct terminal status from EMPTY/EXPIRED: this item's *purchase*
    # shouldn't count as a real transaction at all, for whatever reason (a
    # duplicate add, a typo, given away, taken by someone else before
    # anyone touched it) -- as opposed to something happening to real
    # stock. See RemovalReason.VOIDED / services/inventory_items.py's
    # _void for why this sometimes ends in an actual row deletion and
    # sometimes doesn't.
    VOIDED = "VOIDED"


class RemovalReason(StrEnum):
    """Manual removal reasons -- excludes ACTIVE, which isn't a removal at
    all. Trimmed to just these three: EMPTY and EXPIRED cover the two
    "something happened to real stock" cases that actually come up often
    enough to be worth their own labels; DISCARDED and LOST used to be
    separate options but were mechanically identical to each other and to
    EMPTY (a same status-flip, no consumption_events row written) with no
    functional difference anywhere downstream -- just more near-synonymous
    buttons than the distinction was worth. They're still valid
    InventoryItemStatus values for reading old rows, just not choosable
    for a new removal.

    EMPTY is distinct from the automatic EMPTY the consume_inventory_item
    DB trigger sets when a logged use brings quantity to zero: this one is
    for "I found it already empty," with no specific use to attribute to
    anyone. Both EMPTY and EXPIRED land on their matching status and go
    through the same discard() finalize-and-done path -- no
    consumption_events row is written either way, so the item's remaining
    share (if any) splits equally across its allowed members rather than
    being billed to whoever clicked the button.

    VOIDED is for "this shouldn't count as a real transaction," for any
    reason -- not just a data-entry mistake. Unlike EMPTY/EXPIRED, it's
    not always just a status flip: if nothing has been logged against the
    item yet (no consumption_events row), _void hard-deletes it and its own
    purchase_event outright, since there's no real usage history to
    protect. The moment any usage exists, it falls back to the same
    status-flip the other reasons use -- consumption_events has no
    update/delete policy and its FK to inventory_items is ON DELETE
    RESTRICT (immutable by design, same as ledger_entries/purchase_events),
    so an item with any usage logged can't be hard-deleted without either
    violating that immutability or silently discarding a real usage record.
    """

    EMPTY = "EMPTY"
    EXPIRED = "EXPIRED"
    VOIDED = "VOIDED"


class InventoryItem(BaseModel):
    id: UUID
    household_id: UUID
    household_food_variant_id: UUID
    storage_location_id: UUID
    purchase_event_id: UUID
    quantity: Decimal
    total_quantity: Decimal
    preferred_unit: Unit
    cost: Decimal
    purchased_at: datetime
    expiry_date: date | None
    # Storage-aware expiry (see services/expiry.py). The item's own copy of
    # the three place values (days, or -1 never expires / -2 not recommended /
    # -3 unknown), how much of its life is left as of `moved_at` (None = never
    # tracked, so no clock), and whether it has ever changed place.
    pantry_days: int = -3
    fridge_days: int = -3
    freezer_days: int = -3
    remaining_fraction: float | None = None
    moved_at: datetime | None = None
    has_moved: bool = False
    status: InventoryItemStatus
    accounting_type: AccountingType
    split_member_count: int | None
    # Null while the item's cost/quantity/roster are still live and directly
    # editable; set once (see services/accounting.py's finalize_item_debt)
    # the moment the item leaves ACTIVE, at which point its final share gets
    # posted as real ledger_entries and further changes need a correction.
    debt_finalized_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # A label on this specific physical item (e.g. "HEB milk" vs "Costco
    # milk" for two jugs that are both Whole Milk underneath) -- distinct
    # from food_name below, which is what actually displays (this item's
    # own override if set, else the food's name).
    name_override: str | None
    # Resolved via joins in the service layer -- never stored directly on this
    # table -- so the UI can show "Whole Milk" / "Garage Fridge" without a
    # separate round-trip per item.
    food_name: str
    # The underlying food definition's own name, always -- unlike food_name,
    # this doesn't get replaced by name_override. Lets search match "Whole
    # Milk" even on an item nicknamed "Costco milk", alongside name_override.
    food_type_name: str
    # Optional, unlike FoodDefinition.category itself: the variant's
    # global_food_definition_id can be null'd out (food deleted upstream),
    # in which case the enrichment join comes back empty.
    category: FoodCategory | None
    # True when this item's food type was removed (the type link is empty). The
    # item still has its name (see migration 0048) and is listed under Warnings
    # until someone picks a new type.
    food_type_missing: bool = False
    storage_location_name: str
    # FRIDGE / FREEZER / PANTRY / OTHER -- which shelf life applies to this item.
    storage_location_type: str | None = None
    # Resolved via the same enrichment join as food_name/storage_location_name
    # -- who's currently allowed to consume this item (see
    # inventory_item_allowed_members). Editable directly while the item's
    # debt is still live; see UpdateInventoryItemRequest.
    allowed_member_ids: list[UUID]
    # Who's on the hook as creditor for this item's cost -- set once at
    # creation (purchase_events.member_id) and never editable afterward,
    # regardless of finalize state. Shown read-only in the UI.
    buyer_member_id: UUID


class CreateInventoryItemRequest(BaseModel):
    global_food_definition_id: UUID
    storage_location_id: UUID
    quantity: Decimal = Field(gt=0)
    preferred_unit: Unit
    cost: Decimal = Field(default=Decimal(0), ge=0)
    expiry_date: date | None = None
    allowed_member_ids: list[UUID] = Field(min_length=1)
    # Optional: falls back to the chosen food definition's accounting_type_default
    # when omitted (resolved in the service layer, not the RPC -- this is a
    # product-level fallback decision, not a database invariant).
    accounting_type: AccountingType | None = None
    # A per-item label (see InventoryItem.name_override) -- not the food's
    # name, just how this household tells its own jugs/cartons apart.
    name_override: str | None = Field(default=None, max_length=200)
    # Who actually bought this -- defaults to the caller when omitted, but
    # any active member can be picked (e.g. entering a purchase your
    # roommate made). Becomes purchase_events.member_id, same as it always
    # has been; this just lets the caller name someone other than themselves.
    buyer_member_id: UUID | None = None


class ConsumeInventoryItemRequest(BaseModel):
    quantity_used: Decimal = Field(gt=0)
    # The unit `quantity_used` is expressed in. Omitted means "the item's
    # own unit" (the historical behavior). When given and different, the
    # router converts to the item's unit before decrementing -- only a
    # same-dimension unit is accepted (converting cups to grams needs a
    # density this app never asks for).
    unit: Unit | None = None


class UpdateInventoryItemRequest(BaseModel):
    """A genuine partial update -- only fields the caller actually sent are
    applied (model_fields_set, not None-checks: expiry_date/
    name_override/storage_location_id are all legitimately clearable-or-
    settable to a real value, same reasoning as UpdateRecipeRequest).

    cost, total_quantity, and allowed_member_ids are always accepted here
    but rejected by the service layer once the item's debt has been finalized
    (debt_finalized_at is not null) -- see POST .../corrections instead, which
    is the only path for those three once real ledger_entries exist.
    """

    expiry_date: date | None = None
    # Only read when the item has moved since it was added and expiry_date is
    # being changed: FIX_RULE ("the default was wrong") or THIS_ITEM ("this item
    # will expire then"). Omitted means THIS_ITEM, which always honors the date.
    expiry_edit_meaning: EditMeaning | None = None
    storage_location_id: UUID | None = None
    name_override: str | None = Field(default=None, max_length=200)
    # Same-dimension system swap only (e.g. oz -> g) -- resolved server-side
    # against the food's dimension; never a dimension change, since that's
    # tied to the food type itself, which isn't editable here.
    preferred_unit: Unit | None = None
    cost: Decimal | None = Field(default=None, ge=0)
    total_quantity: Decimal | None = Field(default=None, gt=0)
    allowed_member_ids: list[UUID] | None = Field(default=None, min_length=1)
    # Only for an item whose food type was removed: gives it a new one. Rejected for
    # an item that still has a type (changing a working type is not supported).
    global_food_definition_id: UUID | None = None


class PlaceExpiryAction(StrEnum):
    # Set the shelf life for a place from a picked date (days from the day the
    # item was added; for the place the item is in, the date is honored).
    SET_DATE = "SET_DATE"
    # Forget this item's shelf life for the place (it becomes unknown).
    REMOVE = "REMOVE"
    # Give a removed place its value back: the food's number if it has one,
    # otherwise it stays unknown until a number is typed.
    ADD_BACK = "ADD_BACK"


class PlaceExpiryRequest(BaseModel):
    place: Place
    action: PlaceExpiryAction
    expiry_date: date | None = None
    # Only read for SET_DATE on the place the item is in, after it has moved.
    expiry_edit_meaning: EditMeaning | None = None

    @model_validator(mode="after")
    def _date_needed_to_set(self) -> "PlaceExpiryRequest":
        if self.action == PlaceExpiryAction.SET_DATE and self.expiry_date is None:
            raise ValueError("expiry_date is required to set a date")
        return self


class ExpiryPreviewRequest(BaseModel):
    expiry_date: date


class ExpiryPreview(BaseModel):
    """What a date edit would do, for the prompt shown when the item has moved
    since it was added. `needs_choice` is false whenever both meanings give the
    same answer, so the prompt only appears when it matters."""

    needs_choice: bool
    this_item: date | None
    fix_rule: date | None


class CorrectInventoryItemRequest(BaseModel):
    """Only valid once an item's debt has already been finalized -- the direct-edit
    path (UpdateInventoryItemRequest) is what handles cost/quantity changes
    before that. Posts a purchase_corrections row and, for a cost change,
    a new ADJUSTMENT ledger entry per affected member for the delta."""

    new_cost: Decimal | None = Field(default=None, ge=0)
    new_total_quantity: Decimal | None = Field(default=None, gt=0)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "CorrectInventoryItemRequest":
        if self.new_cost is None and self.new_total_quantity is None:
            raise ValueError("At least one of new_cost or new_total_quantity is required")
        return self


class PurchaseCorrection(BaseModel):
    id: UUID
    household_id: UUID
    inventory_item_id: UUID
    corrected_by_member_id: UUID
    previous_cost: Decimal | None
    new_cost: Decimal | None
    previous_total_quantity: Decimal | None
    new_total_quantity: Decimal | None
    note: str | None
    created_at: datetime

"""The two routes behind the expiry screens: the date-edit preview and the
per-place change. The database is replaced with small fakes so the rules can be
exercised with an item that has genuinely spent time in two places."""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.schemas.inventory_item import InventoryItem
from app.services import inventory_items as inventory_service
from tests.conftest import auth_header, make_member

NOW = datetime.now(UTC)


def _item(household_id: uuid.UUID, **overrides) -> InventoryItem:
    """Bread added 4 days ago, moved from the pantry (5 days) to the fridge (10
    days) a day ago. It had 60% of its life left at that move, so about 50%
    now; its stored date is a few days out."""
    defaults = dict(
        id=uuid.uuid4(),
        household_id=household_id,
        household_food_variant_id=uuid.uuid4(),
        storage_location_id=uuid.uuid4(),
        purchase_event_id=uuid.uuid4(),
        quantity=Decimal("1"),
        total_quantity=Decimal("1"),
        preferred_unit="count",
        cost=Decimal("3"),
        purchased_at=NOW - timedelta(days=4),
        expiry_date=(NOW + timedelta(days=6)).date(),
        best_by_date=None,
        status="ACTIVE",
        accounting_type="SHARED",
        split_member_count=1,
        debt_finalized_at=None,
        created_at=NOW - timedelta(days=4),
        updated_at=NOW,
        food_name="Bread",
        food_type_name="Bread",
        category="GRAINS_BREADS",
        name_override=None,
        storage_location_name="Fridge",
        storage_location_type="FRIDGE",
        allowed_member_ids=[],
        buyer_member_id=uuid.uuid4(),
        pantry_days=5,
        fridge_days=10,
        freezer_days=-3,
        remaining_fraction=0.6,
        moved_at=NOW - timedelta(days=1),
        has_moved=True,
    )
    defaults.update(overrides)
    return InventoryItem(**defaults)


class _Updates:
    """Stands in for the database client and remembers the last update."""

    def __init__(self):
        self.last: dict | None = None

    def table(self, _name):
        return self

    def update(self, values):
        self.last = values
        return self

    def eq(self, *_args):
        return self

    def execute(self):
        return None


@pytest.fixture
def stub_items(monkeypatch):
    store: dict[uuid.UUID, InventoryItem] = {}
    updates = _Updates()
    monkeypatch.setattr(
        "app.services.inventory_items.get_by_id",
        lambda household_id, item_id: store.get(item_id),
    )
    monkeypatch.setattr("app.services.inventory_items.get_service_client", lambda: updates)
    monkeypatch.setattr(
        "app.services.inventory_items._food_place_values",
        lambda item: inventory_service.expiry.PlaceLives(pantry=5, fridge=10, freezer=120),
    )
    return store, updates


# ------------------------------------------------------------- preview


def test_preview_needs_a_choice_when_a_moved_item_would_land_differently(stub_items) -> None:
    store, _ = stub_items
    household_id = uuid.uuid4()
    item = _item(household_id)
    store[item.id] = item
    picked = (NOW + timedelta(days=9)).date()

    preview = inventory_service.preview_expiry_edit(household_id, item.id, picked)

    assert preview.needs_choice is True
    assert preview.this_item == picked  # "this item will expire then" lands exactly
    assert preview.fix_rule is not None and preview.fix_rule != picked


def test_preview_does_not_ask_for_an_item_that_never_moved(stub_items) -> None:
    store, _ = stub_items
    household_id = uuid.uuid4()
    item = _item(household_id, has_moved=False, moved_at=NOW - timedelta(days=4))
    store[item.id] = item

    preview = inventory_service.preview_expiry_edit(
        household_id, item.id, (NOW + timedelta(days=9)).date()
    )

    assert preview.needs_choice is False


def test_preview_for_a_date_before_it_was_added_only_offers_this_item(stub_items) -> None:
    store, _ = stub_items
    household_id = uuid.uuid4()
    item = _item(household_id)
    store[item.id] = item

    preview = inventory_service.preview_expiry_edit(
        household_id, item.id, (NOW - timedelta(days=30)).date()
    )

    assert preview.fix_rule is None
    assert preview.needs_choice is False


# -------------------------------------------------- per-place changes


def _change(household_id, item_id, **body):
    from app.schemas.inventory_item import PlaceExpiryRequest

    return inventory_service.change_place_expiry(household_id, item_id, PlaceExpiryRequest(**body))


def test_setting_another_places_date_counts_from_the_day_it_was_added(stub_items) -> None:
    store, updates = stub_items
    household_id = uuid.uuid4()
    item = _item(household_id)
    store[item.id] = item
    picked = (item.created_at + timedelta(days=12)).date()

    _change(household_id, item.id, place="PANTRY", action="SET_DATE", expiry_date=picked)

    assert updates.last is not None
    assert updates.last["pantry_days"] == 12
    assert updates.last["fridge_days"] == 10  # the place it is in is untouched


def test_removing_the_current_place_hides_the_date(stub_items) -> None:
    store, updates = stub_items
    household_id = uuid.uuid4()
    item = _item(household_id)
    store[item.id] = item

    _change(household_id, item.id, place="FRIDGE", action="REMOVE")

    assert updates.last is not None
    assert updates.last["fridge_days"] == -3
    assert updates.last["expiry_date"] is None  # no number of its own: nothing shown


def test_adding_a_place_back_uses_the_foods_number(stub_items) -> None:
    store, updates = stub_items
    household_id = uuid.uuid4()
    item = _item(household_id, freezer_days=-3)
    store[item.id] = item

    _change(household_id, item.id, place="FREEZER", action="ADD_BACK")

    assert updates.last is not None
    assert updates.last["freezer_days"] == 120


def test_adding_back_with_no_food_number_stays_unknown_not_zero(stub_items, monkeypatch) -> None:
    store, updates = stub_items
    monkeypatch.setattr(
        "app.services.inventory_items._food_place_values",
        lambda item: inventory_service.expiry.PlaceLives(),
    )
    household_id = uuid.uuid4()
    item = _item(household_id, pantry_days=-3)
    store[item.id] = item

    _change(household_id, item.id, place="PANTRY", action="ADD_BACK")

    assert updates.last is not None
    assert updates.last["pantry_days"] == -3


def test_an_untracked_items_old_date_is_kept_by_a_place_change(stub_items) -> None:
    store, updates = stub_items
    household_id = uuid.uuid4()
    legacy = date(2027, 1, 1)
    item = _item(household_id, remaining_fraction=None, has_moved=False, expiry_date=legacy)
    store[item.id] = item

    _change(household_id, item.id, place="FREEZER", action="REMOVE")

    assert updates.last is not None
    assert updates.last["expiry_date"] == legacy.isoformat()


def test_a_missing_item_raises(stub_items) -> None:
    with pytest.raises(inventory_service.ItemNotFoundError):
        _change(uuid.uuid4(), uuid.uuid4(), place="FRIDGE", action="REMOVE")


def test_setting_a_date_needs_a_date() -> None:
    from pydantic import ValidationError

    from app.schemas.inventory_item import PlaceExpiryRequest

    with pytest.raises(ValidationError):
        PlaceExpiryRequest(place="FRIDGE", action="SET_DATE")


# ------------------------------------------------------ authorization


async def test_non_members_cannot_preview_or_change_expiry(client, fake_members) -> None:
    household_id = uuid.uuid4()
    outsider = uuid.uuid4()
    item_id = uuid.uuid4()
    base = f"/api/households/{household_id}/inventory-items/{item_id}"

    preview = await client.post(
        f"{base}/expiry-preview", json={"expiry_date": "2027-01-01"}, headers=auth_header(outsider)
    )
    change = await client.post(
        f"{base}/place-expiry",
        json={"place": "FRIDGE", "action": "REMOVE"},
        headers=auth_header(outsider),
    )

    assert preview.status_code == 403
    assert change.status_code == 403


async def test_members_reach_both_routes(client, fake_members, stub_items) -> None:
    store, _ = stub_items
    household_id = uuid.uuid4()
    user_id = uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))
    item = _item(household_id)
    store[item.id] = item
    base = f"/api/households/{household_id}/inventory-items/{item.id}"

    preview = await client.post(
        f"{base}/expiry-preview",
        json={"expiry_date": (NOW + timedelta(days=9)).date().isoformat()},
        headers=auth_header(user_id),
    )
    change = await client.post(
        f"{base}/place-expiry",
        json={"place": "FRIDGE", "action": "REMOVE"},
        headers=auth_header(user_id),
    )

    assert preview.status_code == 200
    assert preview.json()["data"]["needs_choice"] is True
    assert change.status_code == 200

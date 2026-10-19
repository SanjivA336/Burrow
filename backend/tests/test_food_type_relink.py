"""Items whose food type was removed: how they are recognised, how they show up under
Warnings, and how they are given a new type (migration 0048 does the database half)."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from postgrest.exceptions import APIError

from app.schemas.inventory_item import InventoryItem, UpdateInventoryItemRequest
from app.services import inventory_items as inventory_service
from app.services import warnings as warnings_service
from tests.conftest import auth_header, make_member


def _item(**overrides) -> InventoryItem:
    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        household_id=uuid.uuid4(),
        household_food_variant_id=uuid.uuid4(),
        storage_location_id=uuid.uuid4(),
        purchase_event_id=uuid.uuid4(),
        quantity=Decimal("5"),
        total_quantity=Decimal("5"),
        preferred_unit="count",
        cost=Decimal("4.99"),
        purchased_at=now,
        expiry_date=None,
        status="ACTIVE",
        accounting_type="PERSONAL",
        split_member_count=None,
        debt_finalized_at=None,
        created_at=now,
        updated_at=now,
        food_name="Whole Milk",
        food_type_name="Whole Milk",
        category="DAIRY_ALTERNATIVES",
        name_override=None,
        storage_location_name="Test Fridge",
        allowed_member_ids=[],
        buyer_member_id=uuid.uuid4(),
    )
    defaults.update(overrides)
    return InventoryItem(**defaults)


def _untyped(**overrides) -> InventoryItem:
    """What the API builds for an item whose type is gone: no category, the type name
    falls back to "Unknown food", and the nickname (copied in by the database) is the
    name people see."""
    return _item(
        food_name="Chicken",
        food_type_name="Unknown food",
        category=None,
        name_override="Chicken",
        food_type_missing=True,
        **overrides,
    )


# --- recognising the item ------------------------------------------------------------


def _raw_row(definition) -> dict:
    now = datetime.now(UTC).isoformat()
    return {
        "id": str(uuid.uuid4()),
        "household_id": str(uuid.uuid4()),
        "household_food_variant_id": str(uuid.uuid4()),
        "storage_location_id": str(uuid.uuid4()),
        "purchase_event_id": str(uuid.uuid4()),
        "quantity": "5",
        "total_quantity": "5",
        "display_unit": "count",
        "cost": "4.99",
        "purchased_at": now,
        "expiry_date": None,
        "status": "ACTIVE",
        "accounting_type": "PERSONAL",
        "split_member_count": None,
        "debt_finalized_at": None,
        "created_at": now,
        "updated_at": now,
        "name_override": "Chicken",
        "household_food_variants": {"global_food_definitions": definition},
        "storage_locations": {"name": "Fridge", "type": "FRIDGE"},
        "inventory_item_allowed_members": [],
        "purchase_events": {"member_id": str(uuid.uuid4())},
    }


def test_an_item_whose_type_was_removed_is_marked_and_keeps_its_name() -> None:
    item = inventory_service._flatten(_raw_row(None))
    assert item.food_type_missing is True
    assert item.food_name == "Chicken"  # the nickname the database copied in
    assert item.food_type_name == "Unknown food"


def test_an_item_with_a_type_is_not_marked() -> None:
    item = inventory_service._flatten(_raw_row({"name": "Chicken Breast", "category": "PROTEINS"}))
    assert item.food_type_missing is False
    assert item.food_type_name == "Chicken Breast"


# --- the Warnings list ---------------------------------------------------------------


def _compute(monkeypatch, items):
    monkeypatch.setattr(
        "app.services.warnings.inventory_service.list_for_household", lambda hh: items
    )
    monkeypatch.setattr("app.services.warnings._fetch_ignored_expiry_item_ids", lambda hh: set())
    monkeypatch.setattr("app.services.warnings._fetch_ignored_stock_references", lambda hh: {})
    return warnings_service.compute_warnings(uuid.uuid4())


def test_an_active_item_without_a_type_is_listed_under_warnings(monkeypatch) -> None:
    lost = _untyped()
    result = _compute(monkeypatch, [lost, _item()])
    assert [w.inventory_item_id for w in result.food_type_warnings] == [lost.id]
    assert result.food_type_warnings[0].food_name == "Chicken"
    assert result.food_type_warnings[0].storage_location_name == "Test Fridge"


def test_items_that_are_finished_are_not_listed(monkeypatch) -> None:
    result = _compute(monkeypatch, [_untyped(status="EMPTY"), _untyped(status="DISCARDED")])
    assert result.food_type_warnings == []


def test_items_without_a_type_never_cause_stock_warnings(monkeypatch) -> None:
    # They all share one leftover record whatever they were, so adding them up would
    # mix chicken and milk into one "running low".
    gone = _untyped(quantity=Decimal("0"), status="EMPTY")
    result = _compute(monkeypatch, [gone])
    assert result.stock_warnings == []


# --- choosing a new type -------------------------------------------------------------


class _FakeClient:
    def __init__(self, error: APIError | None = None):
        self.error = error
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return self

    def execute(self):
        if self.error:
            raise self.error
        return self


def _patch_update(monkeypatch, item: InventoryItem, client: _FakeClient) -> None:
    monkeypatch.setattr("app.services.inventory_items.get_service_client", lambda: client)
    monkeypatch.setattr("app.services.inventory_items.get_by_id", lambda hh, item_id: item)


def _db_error(message: str, code: str) -> APIError:
    return APIError({"message": message, "code": code, "hint": None, "details": None})


def test_choosing_a_type_for_an_item_without_one_asks_the_database_to_relink(monkeypatch) -> None:
    item = _untyped()
    client = _FakeClient()
    _patch_update(monkeypatch, item, client)
    new_type = uuid.uuid4()

    inventory_service.update_item(
        item.household_id, item.id, UpdateInventoryItemRequest(global_food_definition_id=new_type)
    )

    assert client.calls == [
        (
            "relink_inventory_item_food_type",
            {
                "p_household_id": str(item.household_id),
                "p_item_id": str(item.id),
                "p_global_food_definition_id": str(new_type),
            },
        )
    ]


def test_an_item_that_still_has_a_type_cannot_be_given_another(monkeypatch) -> None:
    item = _item()
    client = _FakeClient()
    _patch_update(monkeypatch, item, client)

    with pytest.raises(inventory_service.ItemHasFoodTypeError):
        inventory_service.update_item(
            item.household_id,
            item.id,
            UpdateInventoryItemRequest(global_food_definition_id=uuid.uuid4()),
        )
    assert client.calls == []


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("item_has_food_type", inventory_service.ItemHasFoodTypeError),
        ("food_type_not_found", inventory_service.FoodDefinitionNotFoundError),
        ("item_not_found", inventory_service.ItemNotFoundError),
    ],
)
def test_the_databases_refusals_become_the_apps_own_errors(monkeypatch, message, expected) -> None:
    item = _untyped()
    _patch_update(monkeypatch, item, _FakeClient(_db_error(message, "P0001")))

    with pytest.raises(expected):
        inventory_service.update_item(
            item.household_id,
            item.id,
            UpdateInventoryItemRequest(global_food_definition_id=uuid.uuid4()),
        )


def test_any_other_database_error_is_not_hidden(monkeypatch) -> None:
    item = _untyped()
    _patch_update(monkeypatch, item, _FakeClient(_db_error("boom", "XX000")))

    with pytest.raises(APIError):
        inventory_service.update_item(
            item.household_id,
            item.id,
            UpdateInventoryItemRequest(global_food_definition_id=uuid.uuid4()),
        )


async def test_the_route_answers_409_when_the_item_already_has_a_type(
    client, fake_members, monkeypatch
) -> None:
    household_id = uuid.uuid4()
    user_id = uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))

    def refuse(hh, item_id, body):
        raise inventory_service.ItemHasFoodTypeError

    monkeypatch.setattr("app.services.inventory_items.update_item", refuse)
    response = await client.patch(
        f"/api/households/{household_id}/inventory-items/{uuid.uuid4()}",
        json={"global_food_definition_id": str(uuid.uuid4())},
        headers=auth_header(user_id),
    )
    assert response.status_code == 409
    assert "already has a food type" in response.json()["error"]["message"]

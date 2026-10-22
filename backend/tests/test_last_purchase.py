"""Adding a food you have bought before starts from the last purchase: how much, in which
unit, at what cost, put where, and for whom."""

import uuid
from decimal import Decimal

from app.services import inventory_items as inventory_service
from tests.conftest import auth_header, make_member


class _Rows:
    def __init__(self, data):
        self.data = data


class _FakeClient:
    """Answers each table with a canned result; every chained call returns itself."""

    def __init__(self, answers: dict[str, object]):
        self.answers = answers
        self.table_name = ""
        self.filters: list[tuple[str, str, object]] = []

    def table(self, name):
        self.table_name = name
        return self

    def __getattr__(self, method):
        def chain(*args, **kwargs):
            if method in ("eq", "neq"):
                self.filters.append((method, args[0], args[1]))
            return self

        return chain

    def execute(self):
        return _Rows(self.answers[self.table_name])


def _setup(monkeypatch, item_rows, variant=None, active=()):
    variant = {"id": str(uuid.uuid4())} if variant is None else variant
    client = _FakeClient({"household_food_variants": variant, "inventory_items": item_rows})
    monkeypatch.setattr("app.services.inventory_items.get_service_client", lambda: client)
    monkeypatch.setattr(
        "app.services.inventory_items.list_active_member_ids", lambda hh: set(active)
    )
    return client


def test_no_history_means_no_suggestion(monkeypatch) -> None:
    _setup(monkeypatch, [], variant=None)
    assert inventory_service.find_last_purchase(uuid.uuid4(), uuid.uuid4()) is None


def test_a_food_with_no_purchases_has_no_suggestion(monkeypatch) -> None:
    _setup(monkeypatch, [])
    assert inventory_service.find_last_purchase(uuid.uuid4(), uuid.uuid4()) is None


def test_the_last_purchase_is_described_in_the_unit_it_was_bought_in(monkeypatch) -> None:
    ana, ben, gone = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    place = uuid.uuid4()
    client = _setup(
        monkeypatch,
        [
            {
                "total_quantity": "1893.5",  # stored in ml
                "display_unit": "ml",
                "cost": "4.50",
                "storage_location_id": str(place),
                "inventory_item_allowed_members": [
                    {"member_id": str(ana)},
                    {"member_id": str(ben)},
                    {"member_id": str(gone)},
                ],
            }
        ],
        active=(ana, ben),
    )

    result = inventory_service.find_last_purchase(uuid.uuid4(), uuid.uuid4())

    assert result is not None
    assert result.quantity == Decimal("1893.500")
    assert result.unit == "ml"
    assert result.cost == Decimal("4.50")
    assert result.storage_location_id == place
    assert result.allowed_member_ids == [ana, ben]  # the member who left is dropped
    assert ("neq", "status", "VOIDED") in client.filters  # a voided purchase never counts


async def test_non_member_cannot_get_last_purchase(client, fake_members) -> None:
    household_id = uuid.uuid4()

    response = await client.get(
        f"/api/households/{household_id}/inventory-items/last-purchase",
        params={"global_food_definition_id": str(uuid.uuid4())},
        headers=auth_header(uuid.uuid4()),
    )

    assert response.status_code == 403


async def test_last_purchase_route_returns_null_without_history(
    client, fake_members, monkeypatch
) -> None:
    household_id = uuid.uuid4()
    user_id = uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))
    monkeypatch.setattr(
        "app.services.inventory_items.find_last_purchase", lambda hh, food, nickname=None: None
    )

    response = await client.get(
        f"/api/households/{household_id}/inventory-items/last-purchase",
        params={"global_food_definition_id": str(uuid.uuid4())},
        headers=auth_header(user_id),
    )

    assert response.status_code == 200
    assert response.json()["data"] is None


def _row(nickname, cost):
    return {
        "total_quantity": "2",
        "display_unit": "count",
        "cost": cost,
        "storage_location_id": str(uuid.uuid4()),
        "name_override": nickname,
        "inventory_item_allowed_members": [],
    }


def test_a_matching_nickname_beats_a_newer_purchase(monkeypatch) -> None:
    # Newest first, as the database returns them.
    _setup(monkeypatch, [_row(None, "9.00"), _row("HEB milk", "4.50"), _row("Store milk", "3.00")])

    result = inventory_service.find_last_purchase(uuid.uuid4(), uuid.uuid4(), "  heb MILK ")

    assert result is not None
    assert result.cost == Decimal("4.50")
    assert result.nickname == "HEB milk"


def test_without_a_matching_nickname_the_newest_purchase_is_used(monkeypatch) -> None:
    _setup(monkeypatch, [_row(None, "9.00"), _row("HEB milk", "4.50")])

    assert inventory_service.find_last_purchase(
        uuid.uuid4(), uuid.uuid4(), "other"
    ).cost == Decimal("9.00")
    assert inventory_service.find_last_purchase(uuid.uuid4(), uuid.uuid4()).cost == Decimal("9.00")

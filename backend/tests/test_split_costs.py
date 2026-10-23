"""A burrow can turn cost splitting off (migration 0052): new items are saved as personal and
shared with everyone, so the ledger never sees them, and the Balances page reads real
purchases for its spending charts."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from app.schemas.food_definition import AccountingType
from app.schemas.inventory_item import CreateInventoryItemRequest
from app.services import expiry
from app.services import inventory_items as inventory_service
from app.services import spending as spending_service
from tests.conftest import auth_header, make_household, make_member

# --- turning it off ------------------------------------------------------------------------


async def test_new_burrows_split_costs_by_default(client, fake_members, fake_households) -> None:
    household_id = uuid.uuid4()
    user_id = uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))
    fake_households["store"][household_id] = make_household(household_id)

    response = await client.get(f"/api/households/{household_id}", headers=auth_header(user_id))

    assert response.json()["data"]["split_costs"] is True


async def test_an_admin_can_turn_splitting_off(client, fake_members, fake_households) -> None:
    household_id = uuid.uuid4()
    user_id = uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id, is_admin=True))
    fake_households["store"][household_id] = make_household(household_id)

    response = await client.patch(
        f"/api/households/{household_id}",
        json={"split_costs": False},
        headers=auth_header(user_id),
    )

    assert response.status_code == 200
    assert response.json()["data"]["split_costs"] is False


async def test_a_member_who_is_not_an_admin_cannot_change_it(
    client, fake_members, fake_households
) -> None:
    household_id = uuid.uuid4()
    user_id = uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id, is_admin=False))
    fake_households["store"][household_id] = make_household(household_id)

    response = await client.patch(
        f"/api/households/{household_id}",
        json={"split_costs": False},
        headers=auth_header(user_id),
    )

    assert response.status_code == 403


# --- what a new item becomes ---------------------------------------------------------------


class _RpcRecorder:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return self

    def execute(self):
        class _Result:
            data = [{"id": str(uuid.uuid4())}]

        return _Result()


def _create(monkeypatch, *, split_costs: bool, roster: list[uuid.UUID], active: set[uuid.UUID]):
    household_id = uuid.uuid4()
    recorder = _RpcRecorder()
    monkeypatch.setattr("app.services.inventory_items.get_service_client", lambda: recorder)
    monkeypatch.setattr(
        "app.services.inventory_items._load_creation_inputs",
        lambda body: (AccountingType.SHARED, expiry.PlaceLives(), "FRIDGE"),
    )
    monkeypatch.setattr(
        "app.services.households.get_household",
        lambda hh: make_household(household_id, split_costs=split_costs),
    )
    monkeypatch.setattr("app.services.inventory_items.list_active_member_ids", lambda hh: active)
    monkeypatch.setattr("app.services.inventory_items.get_by_id", lambda hh, item_id: _Item())
    monkeypatch.setattr(
        "app.services.inventory_items._remember_measurement_choice", lambda *a: None
    )
    body = CreateInventoryItemRequest(
        global_food_definition_id=uuid.uuid4(),
        storage_location_id=uuid.uuid4(),
        quantity=Decimal("2"),
        preferred_unit="count",
        cost=Decimal("4.50"),
        allowed_member_ids=roster,
        accounting_type="SHARED",
    )
    inventory_service.create_manual(household_id, uuid.uuid4(), body)
    return recorder.calls[0][1]


class _Item:
    household_food_variant_id = uuid.uuid4()


def test_with_splitting_off_an_item_is_personal_and_shared_with_everyone(monkeypatch) -> None:
    ana, ben, cy = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

    params = _create(monkeypatch, split_costs=False, roster=[ana], active={ana, ben, cy})

    assert params["p_accounting_type"] == "PERSONAL"
    assert sorted(params["p_allowed_member_ids"]) == sorted(str(m) for m in (ana, ben, cy))
    assert params["p_cost"] == "4.50"  # cost is still recorded


def test_with_splitting_on_the_request_is_used_as_sent(monkeypatch) -> None:
    ana, ben = uuid.uuid4(), uuid.uuid4()

    params = _create(monkeypatch, split_costs=True, roster=[ana], active={ana, ben})

    assert params["p_accounting_type"] == "SHARED"
    assert params["p_allowed_member_ids"] == [str(ana)]


# --- spending -------------------------------------------------------------------------------


def _row(cost, when, name="Milk", override=None):
    return {
        "cost": cost,
        "purchased_at": when,
        "name_override": override,
        "household_food_variants": {"global_food_definitions": {"name": name}} if name else None,
    }


def test_spending_is_totalled_per_month_and_per_food() -> None:
    rows = [
        _row("4.50", "2026-10-03T10:00:00+00:00", "Milk"),
        _row("5.00", "2026-10-20T10:00:00+00:00", "Milk"),
        _row("3.00", "2026-09-15T10:00:00+00:00", "Eggs"),
    ]

    summary = spending_service.aggregate(rows, months=3, today=date(2026, 10, 23))

    assert [m.month for m in summary.months] == ["2026-08", "2026-09", "2026-10"]
    assert [m.total for m in summary.months] == [Decimal(0), Decimal("3.00"), Decimal("9.50")]
    assert summary.months[2].purchases == 2
    assert summary.total == Decimal("12.50")
    assert [(f.name, f.total, f.purchases) for f in summary.foods] == [
        ("Milk", Decimal("9.50"), 2),
        ("Eggs", Decimal("3.00"), 1),
    ]


def test_purchases_older_than_the_window_are_left_out() -> None:
    rows = [_row("10.00", "2025-01-05T10:00:00+00:00"), _row("2.00", "2026-10-01T00:00:00+00:00")]

    summary = spending_service.aggregate(rows, months=2, today=date(2026, 10, 23))

    assert summary.total == Decimal("2.00")
    assert len(summary.months) == 2


def test_a_food_whose_type_was_removed_is_listed_by_its_nickname() -> None:
    rows = [_row("3.00", "2026-10-05T00:00:00+00:00", name=None, override="Chicken")]

    summary = spending_service.aggregate(rows, months=1, today=date(2026, 10, 23))

    assert summary.foods[0].name == "Chicken"


def test_a_purchase_with_no_cost_still_counts_as_bought() -> None:
    rows = [_row(None, "2026-10-05T00:00:00+00:00"), _row("0", "2026-10-06T00:00:00+00:00")]

    summary = spending_service.aggregate(rows, months=1, today=date(2026, 10, 23))

    assert summary.total == Decimal(0)
    assert summary.foods[0].purchases == 2


def test_spending_reads_every_page_of_purchases(monkeypatch) -> None:
    pages = [
        [_row("1.00", "2026-10-01T00:00:00+00:00")] * spending_service._PAGE_SIZE,
        [_row("1.00", "2026-10-02T00:00:00+00:00")] * 3,
    ]

    class _Client:
        def __init__(self):
            self.starts: list[int] = []

        def table(self, _name):
            return self

        def select(self, *_a):
            return self

        def eq(self, *_a):
            return self

        def neq(self, *_a):
            return self

        def order(self, *_a, **_k):
            return self

        def range(self, start, _end):
            self.starts.append(start)
            self._page = pages[len(self.starts) - 1]
            return self

        def execute(self):
            class _R:
                pass

            r = _R()
            r.data = self._page
            return r

    client = _Client()
    monkeypatch.setattr("app.services.spending.get_service_client", lambda: client)

    rows = spending_service._fetch_purchases(uuid.uuid4())

    assert len(rows) == spending_service._PAGE_SIZE + 3
    assert client.starts == [0, spending_service._PAGE_SIZE]


async def test_only_members_can_read_spending(client, fake_members) -> None:
    response = await client.get(
        f"/api/households/{uuid.uuid4()}/spending", headers=auth_header(uuid.uuid4())
    )
    assert response.status_code == 403


async def test_a_member_can_read_spending(client, fake_members, monkeypatch) -> None:
    household_id = uuid.uuid4()
    user_id = uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))
    monkeypatch.setattr(
        "app.services.spending._fetch_purchases",
        lambda hh: [_row("4.50", datetime.now(UTC).isoformat())],
    )

    response = await client.get(
        f"/api/households/{household_id}/spending?months=2", headers=auth_header(user_id)
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data["months"]) == 2
    assert Decimal(data["total"]) == Decimal("4.50")

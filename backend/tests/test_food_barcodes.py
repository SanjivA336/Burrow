import uuid
from decimal import Decimal

import pytest

from app.schemas.purchase_session import PurchaseSessionItem
from app.schemas.units import Unit
from app.services import food_barcodes, purchase_sessions

_HOUSEHOLD_ID = uuid.uuid4()
_FOOD_ID = uuid.uuid4()
_GTIN = "00811620124171"


class _Result:
    def __init__(self, data) -> None:
        self.data = data


class _FakeClient:
    """Just enough of the Supabase client for food_barcodes: records upserts, and answers
    a select with whatever `row` holds."""

    def __init__(self, row=None) -> None:
        self.row = row
        self.upserts: list[tuple[dict, str | None]] = []
        self.filters: dict[str, str] = {}
        self._last = "select"

    def table(self, name: str):
        assert name == "food_barcodes"
        return self

    def select(self, *_args):
        self._last = "select"
        return self

    def eq(self, column: str, value: str):
        self.filters[column] = value
        return self

    def maybe_single(self):
        return self

    def upsert(self, row: dict, on_conflict: str | None = None):
        self._last = "upsert"
        self.upserts.append((row, on_conflict))
        return self

    def execute(self):
        return _Result(self.row if self._last == "select" else [{}])


@pytest.fixture
def client(monkeypatch):
    fake = _FakeClient()
    monkeypatch.setattr("app.services.food_barcodes.get_service_client", lambda: fake)
    return fake


def _remember(**overrides) -> bool:
    args = {
        "food_definition_id": _FOOD_ID,
        "name_override": "fairlife Nutrition Plan Vanilla",
        "quantity": Decimal("340"),
        "unit": Unit.ML,
        "container_count": 4,
    }
    args.update(overrides)
    return food_barcodes.remember(_HOUSEHOLD_ID, _GTIN, **args)


def test_remember_saves_what_the_person_confirmed(client) -> None:
    assert _remember() is True

    ((row, on_conflict),) = client.upserts
    assert on_conflict == "household_id,gtin"  # one row per household and barcode
    assert row == {
        "household_id": str(_HOUSEHOLD_ID),
        "gtin": _GTIN,
        "global_food_definition_id": str(_FOOD_ID),
        "name_override": "fairlife Nutrition Plan Vanilla",
        "quantity": "340",
        "preferred_unit": "ml",
        "container_count": 4,
    }


def test_a_blank_nickname_is_saved_as_none(client) -> None:
    _remember(name_override="   ")
    assert client.upserts[0][0]["name_override"] is None


@pytest.mark.parametrize(
    ("quantity", "unit"), [(None, None), (Decimal("5"), None), (None, Unit.ML)]
)
def test_a_size_is_saved_only_as_a_complete_pair(client, quantity, unit) -> None:
    _remember(quantity=quantity, unit=unit)
    row = client.upserts[0][0]
    assert row["quantity"] is None
    assert row["preferred_unit"] is None


def test_a_store_printed_code_is_never_remembered(client) -> None:
    # UPC-A starting 2: a by-weight label that only means something inside one store.
    store_code = "00212345678902"
    assert (
        food_barcodes.remember(
            _HOUSEHOLD_ID,
            store_code,
            food_definition_id=_FOOD_ID,
            name_override=None,
            quantity=None,
            unit=None,
            container_count=1,
        )
        is False
    )
    assert client.upserts == []


def test_get_returns_the_confirmed_row(client) -> None:
    client.row = {
        "id": str(uuid.uuid4()),
        "household_id": str(_HOUSEHOLD_ID),
        "gtin": _GTIN,
        "global_food_definition_id": str(_FOOD_ID),
        "name_override": "Shake",
        "quantity": "340.000",
        "preferred_unit": "ml",
        "container_count": 2,
        "created_at": "2026-11-06T00:00:00+00:00",
        "updated_at": "2026-11-06T00:00:00+00:00",
    }

    found = food_barcodes.get(_HOUSEHOLD_ID, _GTIN)

    assert found is not None
    assert (found.global_food_definition_id, found.quantity, found.preferred_unit) == (
        _FOOD_ID,
        Decimal("340"),
        Unit.ML,
    )
    # Only this household's row: the lookup is filtered by household as well as barcode.
    assert client.filters == {"household_id": str(_HOUSEHOLD_ID), "gtin": _GTIN}


def test_get_returns_none_when_nothing_was_confirmed(client) -> None:
    assert food_barcodes.get(_HOUSEHOLD_ID, _GTIN) is None


# --- Finalize hook -----------------------------------------------------------------


def _line(**overrides) -> PurchaseSessionItem:
    fields = {
        "scanned_barcode": _GTIN,
        "global_food_definition_id": _FOOD_ID,
        "name_override": "Shake",
        "quantity": Decimal("340"),
        "preferred_unit": Unit.ML,
        "container_count": 3,
    }
    fields.update(overrides)
    return PurchaseSessionItem.model_construct(**fields)


@pytest.fixture
def remembered(monkeypatch):
    calls: list[tuple] = []

    def fake_remember(household_id, gtin, **kwargs):
        calls.append((household_id, gtin, kwargs))
        return True

    monkeypatch.setattr("app.services.food_barcodes.remember", fake_remember)
    return calls


def test_finalize_remembers_a_scanned_line(remembered) -> None:
    purchase_sessions._remember_scanned_barcode(_HOUSEHOLD_ID, _line())

    assert remembered == [
        (
            _HOUSEHOLD_ID,
            _GTIN,
            {
                "food_definition_id": _FOOD_ID,
                "name_override": "Shake",
                "quantity": Decimal("340"),
                "unit": Unit.ML,
                "container_count": 3,
            },
        )
    ]


def test_finalize_remembers_nothing_for_a_line_that_was_not_scanned(remembered) -> None:
    purchase_sessions._remember_scanned_barcode(_HOUSEHOLD_ID, _line(scanned_barcode=None))
    assert remembered == []


def test_a_failed_memory_write_never_fails_the_purchase(monkeypatch, caplog) -> None:
    def explode(*_args, **_kwargs):
        raise RuntimeError("database hiccup")

    monkeypatch.setattr("app.services.food_barcodes.remember", explode)

    # Must not raise: the items are already in the inventory by the time this runs.
    purchase_sessions._remember_scanned_barcode(_HOUSEHOLD_ID, _line())

    assert "Couldn't remember scanned barcode" in caplog.text

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from app.schemas.barcode import BarcodeLookup, BarcodeLookupStatus, FoodBarcode, RememberedBarcode
from app.schemas.food_definition import AccountingType, FoodCategory, FoodDefinition
from app.schemas.units import Unit
from app.services import barcode_lookup as svc
from app.services import gtin as codes
from tests.conftest import auth_header, make_member

_HOUSEHOLD_ID = uuid.uuid4()


def _valid(body: str) -> str:
    """Appends the right check digit to a barcode body, so tests can use any prefix."""
    return next(body + str(d) for d in range(10) if codes.check_digit_ok(body + str(d)))


def _food(name: str) -> FoodDefinition:
    now = datetime.now(UTC)
    return FoodDefinition(
        id=uuid.uuid4(),
        name=name,
        preferred_unit=Unit.COUNT,
        category=FoodCategory.BEVERAGES,
        accounting_type_default=AccountingType.SHARED,
        is_verified=True,
        usage_count=0,
        duplicate_of_id=None,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture(autouse=True)
def memory(monkeypatch):
    """Fakes the household's barcode memory so no test reaches the database; seed it with
    `memory[gtin] = FoodBarcode(...)`."""
    store: dict[str, FoodBarcode] = {}
    monkeypatch.setattr(
        "app.services.food_barcodes.get", lambda household_id, gtin: store.get(gtin)
    )
    return store


# --- Product database --------------------------------------------------------------


def _patch_get(monkeypatch, handler) -> list[dict]:
    calls: list[dict] = []

    def fake_get(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return handler()

    monkeypatch.setattr("app.services.barcode_lookup.httpx.get", fake_get)
    return calls


def test_fetch_sends_our_user_agent_and_returns_the_product(monkeypatch) -> None:
    calls = _patch_get(
        monkeypatch,
        lambda: httpx.Response(200, json={"status": 1, "product": {"product_name": "Milk"}}),
    )
    assert svc._fetch_product("0811620124171") == {"product_name": "Milk"}
    assert calls[0]["url"].endswith("/0811620124171.json")
    assert calls[0]["headers"]["User-Agent"]


def test_fetch_treats_an_unknown_barcode_as_not_found(monkeypatch) -> None:
    _patch_get(monkeypatch, lambda: httpx.Response(404, json={"status": 0}))
    assert svc._fetch_product("0000000000000") is None
    _patch_get(monkeypatch, lambda: httpx.Response(200, json={"status": 0}))
    assert svc._fetch_product("0000000000000") is None


def test_fetch_reports_provider_failures(monkeypatch) -> None:
    _patch_get(monkeypatch, lambda: httpx.Response(503))
    with pytest.raises(svc.BarcodeProviderError):
        svc._fetch_product("0811620124171")

    def timeout():
        raise httpx.ReadTimeout("slow")

    _patch_get(monkeypatch, timeout)
    with pytest.raises(svc.BarcodeProviderError):
        svc._fetch_product("0811620124171")


# --- Whole lookup ------------------------------------------------------------------


@pytest.fixture
def searches(monkeypatch):
    """Fakes the catalog search; `state["foods"]` maps a query to what it returns."""
    state: dict = {"foods": {}, "queries": []}

    def fake_search(query, limit=10):
        state["queries"].append(query)
        return state["foods"].get(query, [])

    monkeypatch.setattr("app.services.food_definitions.search", fake_search)
    return state


def test_thin_record_still_gives_a_nickname(monkeypatch, searches) -> None:
    # The real shape of the first sample barcode: a name and a brand, little else.
    monkeypatch.setattr(
        svc,
        "_fetch_product",
        lambda code: {
            "product_name": "Nutrition Plan Vanilla",
            "brands": "fairlife",
        },
    )
    result = svc.lookup(_HOUSEHOLD_ID, "0811620124171")

    assert result.status is BarcodeLookupStatus.FOUND
    assert result.gtin == "00811620124171"
    assert result.suggested_nickname == "fairlife Nutrition Plan Vanilla"
    # No category data, so the name's words are the only clue: the whole phrase, then each word.
    assert searches["queries"] == ["nutrition plan vanilla", "nutrition", "plan", "vanilla"]
    assert result.candidates == []


def test_categories_drive_the_food_suggestions(monkeypatch, searches) -> None:
    milk = _food("Whole Milk")
    searches["foods"] = {"milk": [milk], "whole milk": [milk]}
    monkeypatch.setattr(
        svc,
        "_fetch_product",
        lambda code: {
            "product_name": "Organic Whole Milk",
            "brands": "Horizon, Other",
            "categories_tags": ["en:beverages", "en:milks", "fr:laits"],
        },
    )
    result = svc.lookup(_HOUSEHOLD_ID, "036000291452")

    assert result.candidates == [milk]  # found twice, listed once
    assert "organic" not in searches["queries"]  # filler words are never searched
    assert result.brand == "Horizon"


def test_brand_already_in_the_name_is_not_repeated(monkeypatch, searches) -> None:
    monkeypatch.setattr(
        svc,
        "_fetch_product",
        lambda code: {"product_name": "Fairlife Whole Milk", "brands": "fairlife"},
    )
    assert svc.lookup(_HOUSEHOLD_ID, "036000291452").suggested_nickname == "Fairlife Whole Milk"


def test_unknown_barcode_is_not_found(monkeypatch, searches) -> None:
    monkeypatch.setattr(svc, "_fetch_product", lambda code: None)
    result = svc.lookup(_HOUSEHOLD_ID, "036000291452")
    assert result.status is BarcodeLookupStatus.NOT_FOUND
    assert result.candidates == []


def test_store_code_never_reaches_the_product_database(monkeypatch, searches) -> None:
    def boom(code):
        raise AssertionError("a store code must not be looked up")

    monkeypatch.setattr(svc, "_fetch_product", boom)
    result = svc.lookup(_HOUSEHOLD_ID, _valid("21234567890"))
    assert result.status is BarcodeLookupStatus.STORE_CODE


# --- Route -------------------------------------------------------------------------


def _url(household_id: uuid.UUID, barcode: str = "036000291452") -> str:
    return f"/api/households/{household_id}/barcodes/{barcode}"


async def test_non_member_cannot_look_up(client, fake_members) -> None:
    response = await client.get(_url(uuid.uuid4()), headers=auth_header(uuid.uuid4()))
    assert response.status_code == 403


async def test_an_ordinary_member_gets_the_lookup(client, fake_members, monkeypatch) -> None:
    household_id, user_id = uuid.uuid4(), uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))
    monkeypatch.setattr(
        "app.services.barcode_lookup.lookup",
        lambda household_id, barcode: BarcodeLookup(
            gtin="00036000291452",
            status=BarcodeLookupStatus.FOUND,
            product_name="Milk",
        ),
    )

    response = await client.get(_url(household_id), headers=auth_header(user_id))

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert (data["status"], data["product_name"]) == ("found", "Milk")


async def test_bad_barcode_is_a_422(client, fake_members, monkeypatch) -> None:
    household_id, user_id = uuid.uuid4(), uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))

    response = await client.get(_url(household_id, "036000291453"), headers=auth_header(user_id))

    assert response.status_code == 422


async def test_provider_outage_is_a_502(client, fake_members, monkeypatch) -> None:
    household_id, user_id = uuid.uuid4(), uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))

    def down(household_id, barcode):
        raise svc.BarcodeProviderError("down")

    monkeypatch.setattr("app.services.barcode_lookup.lookup", down)

    response = await client.get(_url(household_id), headers=auth_header(user_id))

    assert response.status_code == 502


def test_product_database_suggestions_never_carry_a_size() -> None:
    # A wrong size the person trusts is worse than a blank box, so nothing from the product
    # database is a size. The only size in a lookup is the person's own confirmed one, inside
    # `remembered`. Adding a size field back should be a conscious decision.
    sizeish = {"quantity", "unit", "container_count", "size_source", "serving_size"}
    assert not sizeish & set(BarcodeLookup.model_fields)
    assert {"quantity", "unit", "container_count"} <= set(RememberedBarcode.model_fields)


# --- The household's memory --------------------------------------------------------


def test_a_remembered_barcode_fills_the_line_and_skips_the_product_database(
    monkeypatch, memory
) -> None:
    milk = _food("Protein Shake")
    memory["00811620124171"] = FoodBarcode(
        gtin="00811620124171",
        global_food_definition_id=milk.id,
        name_override="fairlife Nutrition Plan Vanilla",
        quantity=Decimal("340"),
        preferred_unit=Unit.ML,
        container_count=4,
    )
    monkeypatch.setattr("app.services.food_definitions.get_by_id", lambda food_id: milk)

    def boom(code):
        raise AssertionError("a remembered barcode must not ask the product database")

    monkeypatch.setattr(svc, "_fetch_product", boom)

    result = svc.lookup(_HOUSEHOLD_ID, "0811620124171")

    assert result.status is BarcodeLookupStatus.REMEMBERED
    assert result.remembered is not None
    assert result.remembered.food == milk
    assert result.remembered.name_override == "fairlife Nutrition Plan Vanilla"
    assert (
        result.remembered.quantity,
        result.remembered.unit,
        result.remembered.container_count,
    ) == (Decimal("340"), Unit.ML, 4)


def test_a_remembered_barcode_whose_food_is_gone_falls_back_to_the_product_database(
    monkeypatch, memory
) -> None:
    memory["00036000291452"] = FoodBarcode(
        gtin="00036000291452", global_food_definition_id=uuid.uuid4()
    )
    monkeypatch.setattr("app.services.food_definitions.get_by_id", lambda food_id: None)
    monkeypatch.setattr(svc, "_fetch_product", lambda code: None)

    assert svc.lookup(_HOUSEHOLD_ID, "036000291452").status is BarcodeLookupStatus.NOT_FOUND


def test_a_barcode_remembered_in_the_upc_a_form_matches_the_ean_13_scan(
    monkeypatch, memory
) -> None:
    food = _food("Milk")
    memory["00036000291452"] = FoodBarcode(gtin="00036000291452", global_food_definition_id=food.id)
    monkeypatch.setattr("app.services.food_definitions.get_by_id", lambda food_id: food)

    assert svc.lookup(_HOUSEHOLD_ID, "0036000291452").status is BarcodeLookupStatus.REMEMBERED


def test_an_unreadable_memory_falls_back_to_the_product_database(monkeypatch) -> None:
    def broken(household_id, gtin):
        raise RuntimeError("relation food_barcodes does not exist")

    monkeypatch.setattr("app.services.food_barcodes.get", broken)
    monkeypatch.setattr(svc, "_fetch_product", lambda code: None)

    # A scan still works when the memory can't be read; it just can't use it.
    assert svc.lookup(_HOUSEHOLD_ID, "036000291452").status is BarcodeLookupStatus.NOT_FOUND


def test_name_words_drop_the_brand_and_filler() -> None:
    assert svc._name_words("Kraft Parmesan & Romano Cheese", "Kraft") == [
        "parmesan",
        "romano",
        "cheese",
    ]
    assert svc._name_words("The Original Peanut Butter and Jelly", None) == [
        "peanut",
        "butter",
        "jelly",
    ]


def test_foods_matching_more_of_the_name_come_first(monkeypatch, searches) -> None:
    # The real case: the catalog has "Parmesan Cheese", not "Parmesan & Romano Cheese".
    # The categories alone only find generic cheeses, which used to crowd it out.
    cheddar, parmesan = _food("Cheddar Cheese"), _food("Parmesan Cheese")
    searches["foods"] = {"cheese": [cheddar], "parmesan": [parmesan]}
    monkeypatch.setattr(
        svc,
        "_fetch_product",
        lambda code: {
            "product_name": "Parmesan & Romano Cheese",
            "brands": "Kraft",
            "categories_tags": ["en:cheeses", "en:grated-cheese"],
        },
    )
    result = svc.lookup(_HOUSEHOLD_ID, "021000615414")

    assert [food.name for food in result.candidates] == ["Parmesan Cheese", "Cheddar Cheese"]

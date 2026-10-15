"""Storage-aware expiry, end to end through the API against a real database.

The rules themselves are unit-tested in test_expiry.py; this checks that the
columns, the create function and the item routes actually carry them out.
Run explicitly with `uv run pytest -m integration`.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.helpers.foods import find_or_create_food
from tests.helpers.supabase_test_users import create_test_user, delete_test_user, sign_in

pytestmark = pytest.mark.integration

_PASSWORD = "Burrow-Integration-Test-123!"


def _today():
    return datetime.now(UTC).date()


@pytest.fixture
async def api_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def household(api_client):
    """A real user and household with a fridge, a pantry and a freezer."""
    suffix = uuid.uuid4().hex[:8]
    user = await create_test_user(f"burrow-expiry-test-{suffix}@example.com", _PASSWORD)
    token = await sign_in(user["email"], _PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    created = await api_client.post(
        "/api/households", json={"name": "Expiry Test House", "nickname": "Tester"}, headers=headers
    )
    assert created.status_code == 201, created.text
    household_id = created.json()["data"]["id"]
    members = await api_client.get(f"/api/households/{household_id}/members", headers=headers)
    member_id = members.json()["data"][0]["id"]

    places = {}
    for name, type_ in (("Fridge", "FRIDGE"), ("Pantry", "PANTRY"), ("Freezer", "FREEZER")):
        resp = await api_client.post(
            f"/api/households/{household_id}/storage-locations",
            json={"name": name, "type": type_},
            headers=headers,
        )
        assert resp.status_code in (200, 201), resp.text
        places[type_] = resp.json()["data"]["id"]

    yield {
        "household_id": household_id,
        "member_id": member_id,
        "places": places,
        "headers": headers,
    }

    await api_client.delete(f"/api/households/{household_id}", headers=headers)
    await delete_test_user(user["id"])


async def _food(api_client, household, **lives) -> dict:
    # A food of this test's own: the catalog can't be counted on to hold one.
    name = f"Expiry Test Food {uuid.uuid4().hex[:8]}"
    return await find_or_create_food(api_client, household["headers"], name, **lives)


async def _add(api_client, household, food, place: str, **extra) -> dict:
    response = await api_client.post(
        f"/api/households/{household['household_id']}/inventory-items",
        json={
            "global_food_definition_id": food["id"],
            "storage_location_id": household["places"][place],
            "quantity": "2",
            "preferred_unit": "count",
            "allowed_member_ids": [household["member_id"]],
            **extra,
        },
        headers=household["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def _patch(api_client, household, item_id: str, body: dict) -> dict:
    response = await api_client.patch(
        f"/api/households/{household['household_id']}/inventory-items/{item_id}",
        json=body,
        headers=household["headers"],
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_new_item_copies_the_foods_place_values_and_gets_the_default_date(
    api_client, household
) -> None:
    food = await _food(api_client, household, pantry_shelf_life_days=5, fridge_shelf_life_days=10)
    item = await _add(api_client, household, food, "FRIDGE")

    assert (item["pantry_days"], item["fridge_days"], item["freezer_days"]) == (5, 10, -3)
    assert item["remaining_fraction"] == pytest.approx(1.0)
    assert item["has_moved"] is False
    assert item["expiry_date"] == (_today() + timedelta(days=10)).isoformat()


async def test_typed_date_wins_and_becomes_the_items_own_shelf_life(api_client, household) -> None:
    food = await _food(api_client, household, fridge_shelf_life_days=10)
    typed = _today() + timedelta(days=20)
    item = await _add(api_client, household, food, "FRIDGE", expiry_date=typed.isoformat())

    assert item["expiry_date"] == typed.isoformat()
    assert item["fridge_days"] == 20


async def test_explicit_null_date_means_no_date_but_leaving_it_out_means_default(
    api_client, household
) -> None:
    food = await _food(api_client, household, fridge_shelf_life_days=10)
    url = f"/api/households/{household['household_id']}/inventory-items"
    base = {
        "global_food_definition_id": food["id"],
        "storage_location_id": household["places"]["FRIDGE"],
        "quantity": "1",
        "preferred_unit": "count",
        "allowed_member_ids": [household["member_id"]],
    }

    cleared = await api_client.post(
        url, json={**base, "expiry_date": None}, headers=household["headers"]
    )
    assert cleared.status_code == 201, cleared.text
    assert cleared.json()["data"]["expiry_date"] is None
    assert cleared.json()["data"]["remaining_fraction"] is None

    defaulted = await api_client.post(url, json=base, headers=household["headers"])
    assert defaulted.json()["data"]["expiry_date"] == (_today() + timedelta(days=10)).isoformat()


async def test_food_with_no_shelf_life_is_untracked_until_a_date_is_typed(
    api_client, household
) -> None:
    food = await _food(api_client, household)
    item = await _add(api_client, household, food, "FRIDGE")
    assert item["remaining_fraction"] is None
    assert item["expiry_date"] is None

    moved = await _patch(
        api_client, household, item["id"], {"storage_location_id": household["places"]["PANTRY"]}
    )
    assert moved["expiry_date"] is None  # a move never invents a date

    typed = _today() + timedelta(days=9)
    edited = await _patch(api_client, household, item["id"], {"expiry_date": typed.isoformat()})
    assert edited["expiry_date"] == typed.isoformat()
    assert edited["remaining_fraction"] is not None


async def test_freezer_with_no_number_pauses_and_the_date_comes_back(api_client, household) -> None:
    food = await _food(api_client, household, pantry_shelf_life_days=5, fridge_shelf_life_days=10)
    item = await _add(api_client, household, food, "FRIDGE")
    default_date = item["expiry_date"]

    frozen = await _patch(
        api_client, household, item["id"], {"storage_location_id": household["places"]["FREEZER"]}
    )
    assert frozen["has_moved"] is True
    assert frozen["expiry_date"] is None  # paused: nothing to count down
    assert frozen["remaining_fraction"] == pytest.approx(1.0, abs=0.001)

    thawed = await _patch(
        api_client, household, item["id"], {"storage_location_id": household["places"]["PANTRY"]}
    )
    # Full life carried into the pantry's 5 days.
    assert thawed["expiry_date"] == (_today() + timedelta(days=5)).isoformat()
    assert thawed["expiry_date"] != default_date


async def test_moving_between_known_places_rescales_the_share_of_life(
    api_client, household
) -> None:
    food = await _food(api_client, household, pantry_shelf_life_days=5, fridge_shelf_life_days=10)
    item = await _add(api_client, household, food, "PANTRY")
    assert item["expiry_date"] == (_today() + timedelta(days=5)).isoformat()

    moved = await _patch(
        api_client, household, item["id"], {"storage_location_id": household["places"]["FRIDGE"]}
    )
    # Just bought, so (almost) all of the life is left: it gets the fridge's 10 days.
    assert moved["expiry_date"] == (_today() + timedelta(days=10)).isoformat()


async def test_editing_a_moved_items_date_honors_the_meaning_chosen(api_client, household) -> None:
    food = await _food(api_client, household, pantry_shelf_life_days=5, fridge_shelf_life_days=10)
    item = await _add(api_client, household, food, "FRIDGE")
    await _patch(
        api_client, household, item["id"], {"storage_location_id": household["places"]["PANTRY"]}
    )

    target = _today() + timedelta(days=3)
    this_item = await _patch(
        api_client,
        household,
        item["id"],
        {"expiry_date": target.isoformat(), "expiry_edit_meaning": "THIS_ITEM"},
    )
    assert this_item["expiry_date"] == target.isoformat()
    assert this_item["pantry_days"] == 5  # the rule is untouched

    fix_rule_date = _today() + timedelta(days=8)
    fixed = await _patch(
        api_client,
        household,
        item["id"],
        {"expiry_date": fix_rule_date.isoformat(), "expiry_edit_meaning": "FIX_RULE"},
    )
    assert fixed["pantry_days"] == 8  # days from the day it was added


async def test_user_made_foods_cannot_use_not_recommended(api_client, household) -> None:
    response = await api_client.post(
        "/api/food-definitions",
        json={
            "name": f"Expiry Test Food {uuid.uuid4().hex[:8]}",
            "preferred_unit": "g",
            "fridge_shelf_life_days": -2,
        },
        headers=household["headers"],
    )
    assert response.status_code == 422


async def test_zero_days_is_refused(api_client, household) -> None:
    response = await api_client.post(
        "/api/food-definitions",
        json={
            "name": f"Expiry Test Food {uuid.uuid4().hex[:8]}",
            "preferred_unit": "g",
            "pantry_shelf_life_days": 0,
        },
        headers=household["headers"],
    )
    assert response.status_code == 422


async def test_moving_to_another_households_location_is_refused(api_client, household) -> None:
    food = await _food(api_client, household, fridge_shelf_life_days=10)
    item = await _add(api_client, household, food, "FRIDGE")
    response = await api_client.patch(
        f"/api/households/{household['household_id']}/inventory-items/{item['id']}",
        json={"storage_location_id": str(uuid.uuid4())},
        headers=household["headers"],
    )
    assert response.status_code == 400

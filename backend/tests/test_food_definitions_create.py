"""Creating a food whose name is already in the shared catalog is a clear
"already exists", not a server error."""

import uuid
from datetime import UTC, datetime

import pytest
from postgrest.exceptions import APIError

from app.schemas.food_definition import CreateFoodDefinitionRequest, FoodDefinition
from app.services import food_definitions as food_definitions_service
from tests.conftest import auth_header


class _RaisingClient:
    def __init__(self, error: APIError):
        self.error = error

    def table(self, _name):
        return self

    def insert(self, _values):
        return self

    def execute(self):
        raise self.error


def _request() -> CreateFoodDefinitionRequest:
    return CreateFoodDefinitionRequest(name="Milk", preferred_unit="ml")


def test_a_taken_name_raises_the_dedicated_error(monkeypatch) -> None:
    error = APIError({"message": "duplicate key", "code": "23505", "hint": None, "details": None})
    monkeypatch.setattr(
        "app.services.food_definitions.get_service_client", lambda: _RaisingClient(error)
    )
    with pytest.raises(food_definitions_service.FoodNameTakenError):
        food_definitions_service.create(uuid.uuid4(), _request())


def test_other_database_errors_are_not_hidden(monkeypatch) -> None:
    error = APIError({"message": "boom", "code": "XX000", "hint": None, "details": None})
    monkeypatch.setattr(
        "app.services.food_definitions.get_service_client", lambda: _RaisingClient(error)
    )
    with pytest.raises(APIError):
        food_definitions_service.create(uuid.uuid4(), _request())


async def test_the_route_answers_409_for_a_taken_name(client, monkeypatch) -> None:
    def taken(user_id, body):
        raise food_definitions_service.FoodNameTakenError

    monkeypatch.setattr("app.services.food_definitions.create", taken)
    monkeypatch.setattr("app.core.auth.user_exists", lambda user_id: True, raising=False)
    response = await client.post(
        "/api/food-definitions",
        json={"name": "Milk", "preferred_unit": "ml"},
        headers=auth_header(uuid.uuid4()),
    )
    assert response.status_code == 409
    assert "already exists" in response.json()["error"]["message"]


async def test_the_response_never_says_who_created_a_food(client, monkeypatch) -> None:
    # The database row does hold the creator's account id; the API must not pass it on.
    now = datetime.now(UTC)
    creator = uuid.uuid4()
    row = {
        "id": str(uuid.uuid4()),
        "name": "Grandma's Chili",
        "preferred_unit": "g",
        "category": "OTHER",
        "accounting_type_default": "SHARED",
        "created_by_user_id": str(creator),
        "is_verified": False,
        "usage_count": 0,
        "duplicate_of_id": None,
        "created_at": now,
        "updated_at": now,
    }
    monkeypatch.setattr(
        "app.services.food_definitions.create", lambda user_id, body: FoodDefinition(**row)
    )
    monkeypatch.setattr("app.core.auth.user_exists", lambda user_id: True, raising=False)
    response = await client.post(
        "/api/food-definitions",
        json={"name": "Grandma's Chili", "preferred_unit": "g"},
        headers=auth_header(uuid.uuid4()),
    )
    assert response.status_code == 201
    assert "created_by_user_id" not in response.json()["data"]
    assert str(creator) not in response.text

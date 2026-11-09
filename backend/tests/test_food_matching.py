import threading
import uuid
from datetime import UTC, datetime

import pytest

from app.schemas.food_definition import AccountingType, FoodCategory, FoodDefinition
from app.schemas.units import Unit
from app.services import food_matching as svc
from tests.conftest import auth_header


def _food(name: str) -> FoodDefinition:
    now = datetime.now(UTC)
    return FoodDefinition(
        id=uuid.uuid4(),
        name=name,
        preferred_unit=Unit.COUNT,
        category=FoodCategory.OTHER,
        accounting_type_default=AccountingType.SHARED,
        is_verified=True,
        usage_count=0,
        duplicate_of_id=None,
        created_at=now,
        updated_at=now,
    )


# --- Scoring -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("term", "name", "expected"),
    [
        ("butter", "Butter", 1.0),
        ("onions", "Onion", 1.0),
        ("Olive Oil", "olive oil", 1.0),
        ("berries", "Berry", 1.0),
    ],
)
def test_the_same_food_scores_one(term, name, expected) -> None:
    assert svc.score(term, name) == expected


def test_part_of_a_name_scores_above_the_cutoff_but_below_exact() -> None:
    assert svc.MIN_SCORE <= svc.score("parmesan", "Parmesan Cheese") < 1.0


def test_a_name_inside_the_term_scores_above_the_cutoff() -> None:
    assert svc.score("grated parmesan cheese", "Parmesan Cheese") >= svc.MIN_SCORE


def test_closer_coverage_scores_higher() -> None:
    assert (
        svc.score("oil", "Oil")
        > svc.score("oil", "Olive Oil")
        > svc.score("oil", "Peanut Butter Oil")
    )


@pytest.mark.parametrize(
    ("term", "name"),
    [("bowl", "Bowtie Pasta"), ("pepper", "Peanut"), ("milk", "Mill Stone Flour"), ("", "Milk")],
)
def test_a_spelling_close_name_with_no_shared_words_scores_zero(term, name) -> None:
    assert svc.score(term, name) == 0.0


# --- The batch ---------------------------------------------------------------------


@pytest.fixture
def catalog(monkeypatch):
    """Fakes the catalog search: `catalog[term] = [foods]` is what that term returns. Records
    each searched term (from several threads at once, hence the lock)."""
    answers: dict[str, list[FoodDefinition]] = {}
    searched: list[str] = []
    lock = threading.Lock()

    def fake_search(query, limit=10):
        with lock:
            searched.append(query)
        return answers.get(query, [])

    monkeypatch.setattr("app.services.food_definitions.search", fake_search)
    answers["__searched__"] = searched  # type: ignore[assignment]
    return answers


def test_only_terms_with_a_good_match_are_returned(catalog) -> None:
    catalog["butter"] = [_food("Butter"), _food("Peanut Butter")]
    catalog["bowl"] = [_food("Bowtie Pasta")]  # fuzzy only

    result = svc.match_terms(["butter", "bowl"])

    assert [m.term for m in result] == ["butter"]
    assert [s.food.name for s in result[0].matches] == ["Butter", "Peanut Butter"]
    assert result[0].matches[0].score == 1.0


def test_matches_are_best_first_and_capped(catalog) -> None:
    catalog["cheese"] = [
        _food("Parmesan Cheese"),
        _food("Cheese"),
        _food("Cream Cheese"),
        _food("Goat Cheese"),
        _food("Blue Cheese"),
    ]

    names = [s.food.name for s in svc.match_terms(["cheese"])[0].matches]

    assert names[0] == "Cheese"
    assert len(names) == 3


def test_terms_are_cleaned_and_deduplicated(catalog) -> None:
    catalog["milk"] = [_food("Milk")]

    result = svc.match_terms(["  milk ", "MILK", "", "   "])

    assert [m.term for m in result] == ["milk"]
    assert catalog["__searched__"] == ["milk"]  # type: ignore[comparison-overlap]


def test_the_batch_is_capped(catalog) -> None:
    svc.match_terms([f"word{i}" for i in range(svc.MAX_TERMS + 40)])

    assert len(catalog["__searched__"]) == svc.MAX_TERMS  # type: ignore[arg-type]


def test_results_keep_the_order_the_terms_were_given(catalog) -> None:
    for name in ("zucchini", "apple", "milk"):
        catalog[name] = [_food(name.title())]

    result = svc.match_terms(["zucchini", "apple", "milk"])

    assert [m.term for m in result] == ["zucchini", "apple", "milk"]


# --- The route ---------------------------------------------------------------------


async def test_the_route_returns_matches_for_a_signed_in_user(client, catalog) -> None:
    catalog["butter"] = [_food("Butter")]

    response = await client.post(
        "/api/food-definitions/match",
        json={"terms": ["butter", "bowl"]},
        headers=auth_header(uuid.uuid4()),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert [row["term"] for row in data] == ["butter"]
    assert data[0]["matches"][0]["food"]["name"] == "Butter"


async def test_the_route_needs_a_login(client) -> None:
    response = await client.post("/api/food-definitions/match", json={"terms": ["butter"]})

    assert response.status_code in (401, 403, 422)  # refused, whichever way the header is checked


async def test_the_route_refuses_an_empty_or_oversized_batch(client) -> None:
    headers = auth_header(uuid.uuid4())

    empty = await client.post("/api/food-definitions/match", json={"terms": []}, headers=headers)
    huge = await client.post(
        "/api/food-definitions/match",
        json={"terms": [f"w{i}" for i in range(svc.MAX_TERMS + 1)]},
        headers=headers,
    )

    assert empty.status_code == 422
    assert huge.status_code == 422

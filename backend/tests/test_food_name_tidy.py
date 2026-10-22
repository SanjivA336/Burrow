"""How a new food's name is written (see tidy_food_name)."""

import pytest
from pydantic import ValidationError

from app.schemas.food_definition import CreateFoodDefinitionRequest, tidy_food_name


@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("milk", "Milk"),
        ("  chicken    breast ", "Chicken Breast"),
        ("salt and pepper", "Salt and Pepper"),
        ("the best bread", "The Best Bread"),
        ("rice (cooked)", "Rice (Cooked)"),
        ("(cooked) rice", "(Cooked) Rice"),
        ("bbq sauce", "Bbq Sauce"),
        ("BBQ sauce", "BBQ Sauce"),
        ("McIntosh apple", "McIntosh Apple"),
        ("2% milk", "2% Milk"),
        ("half & half", "Half & Half"),
        ("half-and-half", "Half-and-half"),
        ("Already Fine", "Already Fine"),
    ],
)
def test_names_are_written_the_same_way(typed: str, expected: str) -> None:
    assert tidy_food_name(typed) == expected


def test_the_request_tidies_the_name() -> None:
    body = CreateFoodDefinitionRequest(name="  oat   milk ", preferred_unit="ml")
    assert body.name == "Oat Milk"


def test_a_name_of_only_spaces_is_refused() -> None:
    with pytest.raises(ValidationError):
        CreateFoodDefinitionRequest(name="     ", preferred_unit="ml")

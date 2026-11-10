import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from postgrest.exceptions import APIError

from app.schemas.recipe import RecipeDetail, RecipeIngredient, UseRecipeRequest
from app.schemas.units import Dimension
from app.services import recipe_use as use
from app.services import recipes as recipe_service
from tests.conftest import auth_header, make_developer, make_member

NOW = datetime(2026, 11, 1, tzinfo=UTC)


def _ingredient(food_id, name="Milk", quantity="500", unit="ml", **overrides) -> RecipeIngredient:
    values = dict(
        id=uuid.uuid4(),
        recipe_id=uuid.uuid4(),
        global_food_definition_id=food_id,
        food_name=name,
        category=None,
        quantity=Decimal(quantity),
        unit=unit,
        note=None,
        position=0,
        is_optional=False,
        available=True,
        available_quantity=None,
    )
    values.update(overrides)
    return RecipeIngredient(**values)


def _recipe(*ingredients: RecipeIngredient, servings: int = 4) -> RecipeDetail:
    return RecipeDetail(
        id=uuid.uuid4(),
        created_by_user_id=uuid.uuid4(),
        name="Pancakes",
        description=None,
        servings=servings,
        prep_time_minutes=None,
        cook_time_minutes=None,
        instructions=[],
        created_at=NOW,
        updated_at=NOW,
        ingredients=list(ingredients),
    )


def _stock(food_id, quantity, expiry=None, days_old=0, dimension=Dimension.VOLUME, allowed=True):
    return use.StockItem(
        id=uuid.uuid4(),
        food_id=food_id,
        quantity=Decimal(quantity),
        dimension=dimension,
        expiry=expiry,
        created_at=NOW - timedelta(days=days_old),
        allowed=allowed,
    )


def _plan(recipe, stock, servings="4", chosen=None):
    ids = chosen if chosen is not None else [i.id for i in recipe.ingredients]
    return use.plan_use(recipe, ids, Decimal(servings), stock)


# --- which item is used, and how much -------------------------------------------------------


def test_one_item_that_covers_it_is_only_partly_used() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"))
    item = _stock(milk, "1000")

    plan = _plan(recipe, [item])

    assert plan.takes == {item.id: Decimal("500")}
    assert plan.emptied == {}
    assert plan.used[0].quantity == Decimal("500")
    assert plan.used[0].short_by == 0


def test_the_item_expiring_soonest_is_used_first() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"))
    later = _stock(milk, "1000", expiry=date(2026, 12, 20))
    sooner = _stock(milk, "1000", expiry=date(2026, 11, 20))

    plan = _plan(recipe, [later, sooner])

    assert list(plan.takes) == [sooner.id]


def test_an_item_with_no_expiry_date_is_used_last() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"))
    undated = _stock(milk, "100")
    dated = _stock(milk, "1000", expiry=date(2027, 1, 1))

    plan = _plan(recipe, [undated, dated])

    assert list(plan.takes) == [dated.id]


def test_the_same_expiry_uses_the_one_with_the_least_in_it_first() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"))
    big = _stock(milk, "2000", expiry=date(2026, 11, 20))
    small = _stock(milk, "800", expiry=date(2026, 11, 20))

    plan = _plan(recipe, [big, small])

    assert list(plan.takes) == [small.id]


def test_what_one_item_cannot_cover_carries_over_to_the_next() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"))
    small = _stock(milk, "200", expiry=date(2026, 11, 20))
    big = _stock(milk, "1000", expiry=date(2026, 11, 20))

    plan = _plan(recipe, [big, small])

    assert plan.takes == {small.id: Decimal("200"), big.id: Decimal("300")}
    # Using the small one up is what the person is warned about.
    assert plan.emptied == {small.id: milk}
    assert plan.used[0].short_by == 0


def test_using_exactly_what_is_left_counts_as_using_it_up() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"))
    item = _stock(milk, "500")

    plan = _plan(recipe, [item])

    assert plan.emptied == {item.id: milk}


def test_needing_more_than_there_is_uses_it_all_and_says_how_short() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"))
    item = _stock(milk, "300")

    plan = _plan(recipe, [item])

    assert plan.takes == {item.id: Decimal("300")}
    assert plan.emptied == {item.id: milk}
    assert plan.used[0].quantity == Decimal("300")
    assert plan.used[0].short_by == Decimal("200")


def test_servings_scale_the_amount() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"), servings=4)
    item = _stock(milk, "5000")

    assert _plan(recipe, [item], servings="8").takes == {item.id: Decimal("1000")}
    assert _plan(recipe, [item], servings="2").takes == {item.id: Decimal("250")}


def test_a_unit_other_than_the_base_is_converted() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="1", unit="cup"))
    item = _stock(milk, "1000")

    plan = _plan(recipe, [item], servings="4")

    assert plan.takes[item.id] == Decimal("236.588")  # one US cup, in ml
    assert plan.used[0].unit.value == "cup"
    assert plan.used[0].quantity == Decimal("1")


def test_two_ingredients_of_the_same_food_do_not_count_the_same_stock_twice() -> None:
    milk = uuid.uuid4()
    first = _ingredient(milk, quantity="300")
    second = _ingredient(milk, quantity="300")
    recipe = _recipe(first, second)
    item = _stock(milk, "400")

    plan = _plan(recipe, [item])

    assert plan.takes == {item.id: Decimal("400")}
    assert plan.used[0].short_by == 0
    assert plan.used[1].short_by == Decimal("200")


def test_only_the_ticked_ingredients_are_used() -> None:
    milk, egg = uuid.uuid4(), uuid.uuid4()
    milk_ing = _ingredient(milk, quantity="500")
    egg_ing = _ingredient(egg, name="Egg", quantity="2", unit="count")
    recipe = _recipe(milk_ing, egg_ing)
    stock = [_stock(milk, "1000"), _stock(egg, "6", dimension=Dimension.COUNT)]

    plan = _plan(recipe, stock, chosen=[milk_ing.id])

    assert len(plan.used) == 1
    assert set(plan.takes) == {stock[0].id}


# --- what cannot be used --------------------------------------------------------------------


def test_an_ingredient_that_is_not_in_the_kitchen_is_an_error() -> None:
    recipe = _recipe(_ingredient(uuid.uuid4(), name="Garlic"))

    with pytest.raises(use.CantUseError) as caught:
        _plan(recipe, [])

    assert "Garlic" in str(caught.value)
    assert "in your kitchen" in str(caught.value)


def test_every_problem_is_listed_not_just_the_first() -> None:
    recipe = _recipe(
        _ingredient(uuid.uuid4(), name="Garlic"), _ingredient(uuid.uuid4(), name="Basil")
    )

    with pytest.raises(use.CantUseError) as caught:
        _plan(recipe, [])

    assert len(caught.value.problems) == 2


def test_stock_measured_in_another_dimension_cannot_be_compared() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, name="Milk", quantity="500", unit="ml"))
    weighed = _stock(milk, "1000", dimension=Dimension.WEIGHT)

    with pytest.raises(use.CantUseError) as caught:
        _plan(recipe, [weighed])

    assert "can't be compared" in str(caught.value)


def test_items_the_person_may_not_use_are_not_used() -> None:
    milk = uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"))
    private = _stock(milk, "1000", expiry=date(2026, 11, 5), allowed=False)
    shared = _stock(milk, "1000", expiry=date(2026, 12, 5))

    assert list(_plan(recipe, [private, shared]).takes) == [shared.id]

    with pytest.raises(use.CantUseError) as caught:
        _plan(recipe, [private])
    assert "can use" in str(caught.value)


def test_an_ingredient_that_is_not_in_the_recipe_is_rejected() -> None:
    recipe = _recipe(_ingredient(uuid.uuid4()))

    with pytest.raises(use.UnknownIngredientError):
        _plan(recipe, [], chosen=[uuid.uuid4()])


# --- all or nothing -------------------------------------------------------------------------


class _Rpc:
    def __init__(self, fail_with: str | None = None) -> None:
        self.calls: list[tuple[str, dict]] = []
        self._fail_with = fail_with

    def rpc(self, name, params):
        self.calls.append((name, params))
        outer = self

        class _Query:
            def execute(self):
                if outer._fail_with:
                    raise APIError({"message": outer._fail_with})

        return _Query()


@pytest.fixture
def cooking(monkeypatch):
    """A kitchen with two items of milk and one of eggs, and the recipe that uses both."""
    milk, egg = uuid.uuid4(), uuid.uuid4()
    recipe = _recipe(_ingredient(milk, quantity="500"), _ingredient(egg, "Egg", "2", "count"))
    stock = [
        _stock(milk, "1000", expiry=date(2026, 12, 1)),
        _stock(egg, "6", dimension=Dimension.COUNT),
    ]
    rpc = _Rpc()
    finalized: list[uuid.UUID] = []
    monkeypatch.setattr(recipe_service, "get_recipe", lambda h, u, r: recipe)
    monkeypatch.setattr(use, "_fetch_stock", lambda h, m, f: stock)
    monkeypatch.setattr(use, "get_service_client", lambda: rpc)
    monkeypatch.setattr(use.accounting_service, "finalize_item_debt", finalized.append)
    return recipe, stock, rpc, finalized


def _request(recipe, **overrides) -> UseRecipeRequest:
    values = dict(servings=4, ingredient_ids=[i.id for i in recipe.ingredients])
    values.update(overrides)
    return UseRecipeRequest(**values)


def test_every_item_goes_to_the_database_in_one_call(cooking) -> None:
    recipe, stock, rpc, _ = cooking
    member = make_member(uuid.uuid4(), uuid.uuid4())

    result = use.use_recipe(uuid.uuid4(), member, uuid.uuid4(), recipe.id, _request(recipe))

    assert len(rpc.calls) == 1  # one transaction, so it is all or nothing
    name, params = rpc.calls[0]
    assert name == "use_recipe_stock"
    assert {u["item_id"] for u in params["p_uses"]} == {str(s.id) for s in stock}
    assert result.emptied == []


def test_using_something_up_asks_first_and_changes_nothing(cooking) -> None:
    recipe, stock, rpc, finalized = cooking
    stock[1].quantity = Decimal("2")  # exactly the two eggs the recipe needs
    member = make_member(uuid.uuid4(), uuid.uuid4())

    with pytest.raises(use.NeedsConfirmationError) as caught:
        use.use_recipe(uuid.uuid4(), member, uuid.uuid4(), recipe.id, _request(recipe))

    assert caught.value.foods == ["Egg"]
    assert rpc.calls == []
    assert finalized == []


def test_saying_yes_empties_the_item(cooking) -> None:
    recipe, stock, rpc, finalized = cooking
    stock[1].quantity = Decimal("2")
    member = make_member(uuid.uuid4(), uuid.uuid4())

    result = use.use_recipe(
        uuid.uuid4(), member, uuid.uuid4(), recipe.id, _request(recipe, confirm_depletion=True)
    )

    assert result.emptied == ["Egg"]
    assert finalized == [stock[1].id]
    assert len(rpc.calls) == 1


def test_a_problem_with_one_ingredient_removes_nothing(cooking) -> None:
    recipe, stock, rpc, _ = cooking
    stock.pop(1)  # no eggs in the kitchen
    member = make_member(uuid.uuid4(), uuid.uuid4())

    with pytest.raises(use.CantUseError):
        use.use_recipe(uuid.uuid4(), member, uuid.uuid4(), recipe.id, _request(recipe))

    assert rpc.calls == []


def test_stock_that_changed_underneath_is_reported_and_nothing_stays_changed(
    cooking, monkeypatch
) -> None:
    recipe, _, _, finalized = cooking
    failing = _Rpc(fail_with="INSUFFICIENT_QUANTITY")
    monkeypatch.setattr(use, "get_service_client", lambda: failing)
    member = make_member(uuid.uuid4(), uuid.uuid4())

    with pytest.raises(use.StockChangedError):
        use.use_recipe(uuid.uuid4(), member, uuid.uuid4(), recipe.id, _request(recipe))

    assert finalized == []  # no bookkeeping for something that did not happen


def test_the_feed_records_each_ingredient_with_the_recipe(cooking, captured_activity) -> None:
    recipe, _, _, _ = cooking
    member = make_member(uuid.uuid4(), uuid.uuid4())

    use.use_recipe(uuid.uuid4(), member, uuid.uuid4(), recipe.id, _request(recipe))

    consumed = [e for e in captured_activity if e["type"].value == "ITEM_CONSUMED"]
    assert {e["subject_name"] for e in consumed} == {"Milk", "Egg"}
    assert all(e["detail"]["recipe"] == "Pancakes" for e in consumed)


# --- the route ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("error", "status_code"),
    [
        (recipe_service.RecipeNotFoundError(), 404),
        (use.UnknownIngredientError(), 400),
        (use.CantUseError(["You don't have Garlic in your kitchen"]), 400),
        (use.NeedsConfirmationError(["Milk"]), 409),
        (use.StockChangedError(), 400),
    ],
)
async def test_the_route_maps_each_failure_to_a_status(
    client, fake_members, monkeypatch, error, status_code
) -> None:
    household_id, user_id = uuid.uuid4(), uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))
    make_developer(monkeypatch, user_id)

    def raising(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(use, "use_recipe", raising)

    response = await client.post(
        f"/api/households/{household_id}/recipes/{uuid.uuid4()}/use",
        json={"servings": 4, "ingredient_ids": [str(uuid.uuid4())]},
        headers=auth_header(user_id),
    )

    assert response.status_code == status_code


async def test_the_route_needs_a_login(client) -> None:
    response = await client.post(
        f"/api/households/{uuid.uuid4()}/recipes/{uuid.uuid4()}/use",
        json={"servings": 4, "ingredient_ids": [str(uuid.uuid4())]},
    )

    assert response.status_code in (401, 403, 422)


async def test_the_route_is_for_developer_accounts_only(client, fake_members) -> None:
    household_id, user_id = uuid.uuid4(), uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))

    response = await client.post(
        f"/api/households/{household_id}/recipes/{uuid.uuid4()}/use",
        json={"servings": 4, "ingredient_ids": [str(uuid.uuid4())]},
        headers=auth_header(user_id),
    )

    assert response.status_code == 403


async def test_the_route_wants_at_least_one_ingredient(client, fake_members, monkeypatch) -> None:
    household_id, user_id = uuid.uuid4(), uuid.uuid4()
    fake_members.seed(make_member(household_id, user_id))
    make_developer(monkeypatch, user_id)

    response = await client.post(
        f"/api/households/{household_id}/recipes/{uuid.uuid4()}/use",
        json={"servings": 4, "ingredient_ids": []},
        headers=auth_header(user_id),
    )

    assert response.status_code == 422

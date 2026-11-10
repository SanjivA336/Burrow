"""Cooking a recipe: take the ingredients you used out of the kitchen, all or nothing.

Two halves, kept apart on purpose:

* `plan_use` is pure (no database): given the recipe's ingredients and what is in the kitchen, it
  decides which items to take from and how much. That is the interesting logic, so it can be tested
  with plain numbers.
* `use_recipe` fetches the stock, calls `plan_use`, hands the plan to one database function
  (`use_recipe_stock`, migration 0056) that applies every change in a single transaction, and then
  does the follow-up bookkeeping (debts, the activity feed).

Which item is used first when a food is stocked more than once: the one that expires soonest, then
the one with the least in it. If one item cannot cover the amount, it is used up and the rest
carries over to the next.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from postgrest.exceptions import APIError

from app.core.supabase import get_service_client
from app.schemas.activity import ActivityType
from app.schemas.member import Member
from app.schemas.recipe import (
    RecipeDetail,
    RecipeIngredient,
    UsedIngredient,
    UseRecipeRequest,
    UseRecipeResult,
)
from app.schemas.units import Dimension, Unit
from app.services import accounting as accounting_service
from app.services import activity as activity_service
from app.services import recipes as recipe_service
from app.services import units as units_service

# Stored quantities have three decimal places (numeric(10, 3)).
_QUANTUM = Decimal("0.001")


class UnknownIngredientError(Exception):
    pass


class CantUseError(Exception):
    """Something ticked can't be used at all (not in the kitchen, or not comparable)."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


class NeedsConfirmationError(Exception):
    """The use would empty these foods' items and the person has not said yes yet."""

    def __init__(self, foods: list[str]) -> None:
        super().__init__(", ".join(foods))
        self.foods = foods


class StockChangedError(Exception):
    """Someone else used the stock between planning and applying; nothing was changed."""


@dataclass
class StockItem:
    id: UUID
    food_id: UUID
    quantity: Decimal  # base units
    dimension: Dimension
    expiry: date | None
    created_at: datetime
    # Whether the person cooking is allowed to use this item (some are private to a few members).
    allowed: bool = True


@dataclass
class Plan:
    # Base units to take from each item.
    takes: dict[UUID, Decimal] = field(default_factory=dict)
    used: list[UsedIngredient] = field(default_factory=list)
    # The items that end up empty, with the food each belongs to.
    emptied: dict[UUID, UUID] = field(default_factory=dict)


def _order(item: StockItem) -> tuple:
    # Soonest expiry first (no date last), then the one with the least in it, then the oldest.
    return (item.expiry is None, item.expiry or date.max, item.quantity, item.created_at)


def allocate(
    need: Decimal, items: list[StockItem], remaining: dict[UUID, Decimal]
) -> dict[UUID, Decimal]:
    """Take `need` (base units) from `items`, soonest expiry then least in it, carrying over.

    `remaining` is how much is left in each item and is updated as items are used, so two
    ingredients that share a food do not both count the same stock. Returns how much was taken
    from each item; the total is less than `need` when the kitchen does not have enough.
    """
    taken: dict[UUID, Decimal] = {}
    left = need
    for item in sorted(items, key=_order):
        if left <= 0:
            break
        have = remaining[item.id]
        if have <= 0:
            continue
        take = min(have, left)
        taken[item.id] = take
        remaining[item.id] = have - take
        left -= take
    return taken


def plan_use(
    recipe: RecipeDetail,
    chosen: list[UUID],
    servings: Decimal,
    stock: list[StockItem],
    names: dict[UUID, str] | None = None,
) -> Plan:
    """Work out what cooking `chosen` ingredients for `servings` takes from `stock`.

    Raises UnknownIngredientError for an ingredient not in the recipe, and CantUseError (listing
    every problem at once) when a ticked ingredient has nothing usable in the kitchen.
    """
    by_id = {ingredient.id: ingredient for ingredient in recipe.ingredients}
    if any(ingredient_id not in by_id for ingredient_id in chosen):
        raise UnknownIngredientError
    scale = servings / Decimal(recipe.servings) if recipe.servings else Decimal(1)

    remaining = {item.id: item.quantity for item in stock}
    plan = Plan()
    problems: list[str] = []
    wanted: list[tuple[RecipeIngredient, Decimal, list[StockItem]]] = []

    for ingredient_id in dict.fromkeys(chosen):  # in order, once each
        ingredient = by_id[ingredient_id]
        in_kitchen = [s for s in stock if s.food_id == ingredient.global_food_definition_id]
        if not in_kitchen:
            problems.append(f"You don't have {ingredient.food_name} in your kitchen")
            continue
        dimension = units_service.guess_dimension(ingredient.unit)
        comparable = [s for s in in_kitchen if s.dimension == dimension]
        if not comparable:
            problems.append(
                f"{ingredient.food_name} is in your kitchen, but measured in a way that can't be "
                f"compared with this recipe's {ingredient.unit.value}"
            )
            continue
        usable = [s for s in comparable if s.allowed]
        if not usable:
            problems.append(f"None of your {ingredient.food_name} is something you can use")
            continue
        need = units_service.to_base(ingredient.quantity * scale, ingredient.unit)
        wanted.append((ingredient, need.quantize(_QUANTUM, rounding=ROUND_HALF_UP), usable))

    if problems:
        raise CantUseError(problems)

    for ingredient, need, usable in wanted:
        taken = allocate(need, usable, remaining)
        got = sum(taken.values(), Decimal(0))
        for item_id, amount in taken.items():
            plan.takes[item_id] = plan.takes.get(item_id, Decimal(0)) + amount
        short = need - got
        plan.used.append(
            UsedIngredient(
                ingredient_id=ingredient.id,
                food_name=ingredient.food_name,
                quantity=units_service.display_quantity(got, ingredient.unit),
                unit=ingredient.unit,
                short_by=units_service.display_quantity(short, ingredient.unit),
            )
        )

    food_of = {item.id: item.food_id for item in stock}
    for item_id in plan.takes:
        if remaining[item_id] <= 0:
            plan.emptied[item_id] = food_of[item_id]
    return plan


def _fetch_stock(household_id: UUID, member_id: UUID, food_ids: set[UUID]) -> list[StockItem]:
    client = get_service_client()
    variants = (
        client.table("household_food_variants")
        .select("id, global_food_definition_id")
        .eq("household_id", str(household_id))
        .in_("global_food_definition_id", [str(f) for f in food_ids])
        .execute()
    )
    food_of_variant = {row["id"]: UUID(row["global_food_definition_id"]) for row in variants.data}
    if not food_of_variant:
        return []
    rows = (
        client.table("inventory_items")
        .select("id, household_food_variant_id, quantity, display_unit, expiry_date, created_at")
        .eq("household_id", str(household_id))
        .eq("status", "ACTIVE")
        .in_("household_food_variant_id", list(food_of_variant))
        .execute()
    ).data
    if not rows:
        return []
    allowed = (
        client.table("inventory_item_allowed_members")
        .select("inventory_item_id")
        .eq("member_id", str(member_id))
        .in_("inventory_item_id", [row["id"] for row in rows])
        .execute()
    ).data
    allowed_ids = {row["inventory_item_id"] for row in allowed}
    return [
        StockItem(
            id=UUID(row["id"]),
            food_id=food_of_variant[row["household_food_variant_id"]],
            quantity=Decimal(str(row["quantity"])),
            dimension=units_service.guess_dimension(Unit(row["display_unit"])),
            expiry=date.fromisoformat(row["expiry_date"]) if row["expiry_date"] else None,
            created_at=datetime.fromisoformat(row["created_at"]),
            allowed=row["id"] in allowed_ids,
        )
        for row in rows
    ]


def use_recipe(
    household_id: UUID, caller: Member, user_id: UUID, recipe_id: UUID, body: UseRecipeRequest
) -> UseRecipeResult:
    recipe = recipe_service.get_recipe(household_id, user_id, recipe_id)
    if recipe is None:
        raise recipe_service.RecipeNotFoundError
    by_id = {ingredient.id: ingredient for ingredient in recipe.ingredients}
    foods = {by_id[i].global_food_definition_id for i in body.ingredient_ids if i in by_id}
    stock = _fetch_stock(household_id, caller.id, foods) if foods else []
    plan = plan_use(recipe, body.ingredient_ids, body.servings, stock)

    emptied_foods = sorted(
        {
            next(i.food_name for i in recipe.ingredients if i.global_food_definition_id == food_id)
            for food_id in plan.emptied.values()
        }
    )
    if emptied_foods and not body.confirm_depletion:
        raise NeedsConfirmationError(emptied_foods)

    uses = [
        {"item_id": str(item_id), "quantity_used": str(amount)}
        for item_id, amount in plan.takes.items()
        if amount > 0
    ]
    if uses:
        try:
            get_service_client().rpc(
                "use_recipe_stock",
                {
                    "p_household_id": str(household_id),
                    "p_member_id": str(caller.id),
                    "p_uses": uses,
                },
            ).execute()
        except APIError as exc:
            if "INSUFFICIENT_QUANTITY" in str(exc) or "MEMBER_NOT_ALLOWED" in str(exc):
                raise StockChangedError from exc
            raise

    # The stock is already out. What follows is bookkeeping, done like using an item by hand.
    for item_id in plan.emptied:
        accounting_service.finalize_item_debt(item_id)
    for used in plan.used:
        if used.quantity > 0:
            activity_service.record(
                household_id,
                ActivityType.ITEM_CONSUMED,
                actor=caller,
                subject_name=used.food_name,
                detail={
                    "amount": str(used.quantity),
                    "unit": used.unit.value,
                    "recipe": recipe.name,
                },
            )
    for food in emptied_foods:
        activity_service.record(
            household_id,
            ActivityType.ITEM_REMOVED,
            actor=None,
            subject_name=food,
            detail={"reason": "USED_UP"},
        )
    return UseRecipeResult(used=plan.used, emptied=emptied_foods)

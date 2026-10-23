from decimal import Decimal

from pydantic import BaseModel


class MonthlySpending(BaseModel):
    month: str  # "2026-10"
    total: Decimal
    purchases: int


class FoodSpending(BaseModel):
    name: str
    total: Decimal
    purchases: int


class SpendingSummary(BaseModel):
    """What a burrow spent over the last N months, from the purchases themselves."""

    months: list[MonthlySpending]
    foods: list[FoodSpending]
    total: Decimal

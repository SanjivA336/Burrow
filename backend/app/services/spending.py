"""What a burrow has actually spent on groceries.

The Balances dashboard used to be built from ledger entries, which only record what each
non-buyer owes (the buyer's own share never appears) and which do not exist at all in a
burrow that does not split costs. This reads the purchases themselves instead: every item
that was really bought, at the cost that was entered, whatever the burrow's split setting.
"""

from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from app.core.supabase import get_service_client
from app.schemas.spending import FoodSpending, MonthlySpending, SpendingSummary

# The data API returns at most 1000 rows per request.
_PAGE_SIZE = 1000
_SELECT = (
    "cost, purchased_at, name_override, household_food_variants(global_food_definitions(name))"
)


def _month_start(year: int, month: int, back: int) -> tuple[int, int]:
    """The (year, month) that is `back` months before the given one."""
    index = year * 12 + (month - 1) - back
    return index // 12, index % 12 + 1


def _food_name(row: dict) -> str:
    variant = row.get("household_food_variants") or {}
    definition = variant.get("global_food_definitions") or {}
    return definition.get("name") or (row.get("name_override") or "").strip() or "Unknown food"


def aggregate(rows: list[dict], months: int, today: date) -> SpendingSummary:
    """Monthly totals and per-food totals for the last `months` calendar months (including
    the current one). Months with no purchases are included as zeros so a chart has no gaps.
    Dates are read in UTC."""
    first_year, first_month = _month_start(today.year, today.month, months - 1)
    window_start = (first_year, first_month)

    month_totals: dict[tuple[int, int], Decimal] = defaultdict(Decimal)
    month_counts: dict[tuple[int, int], int] = defaultdict(int)
    food_totals: dict[str, Decimal] = defaultdict(Decimal)
    food_counts: dict[str, int] = defaultdict(int)

    for row in rows:
        purchased = datetime.fromisoformat(str(row["purchased_at"]).replace("Z", "+00:00"))
        key = (purchased.astimezone(UTC).year, purchased.astimezone(UTC).month)
        if key < window_start:
            continue
        cost = Decimal(str(row.get("cost") or 0))
        month_totals[key] += cost
        month_counts[key] += 1
        name = _food_name(row)
        food_totals[name] += cost
        food_counts[name] += 1

    month_list = []
    for back in range(months - 1, -1, -1):
        year, month = _month_start(today.year, today.month, back)
        month_list.append(
            MonthlySpending(
                month=f"{year:04d}-{month:02d}",
                total=month_totals.get((year, month), Decimal(0)),
                purchases=month_counts.get((year, month), 0),
            )
        )
    foods = sorted(
        (FoodSpending(name=n, total=food_totals[n], purchases=food_counts[n]) for n in food_totals),
        key=lambda f: (-f.total, -f.purchases, f.name),
    )
    return SpendingSummary(
        months=month_list, foods=foods, total=sum(month_totals.values(), Decimal(0))
    )


def _fetch_purchases(household_id: UUID) -> list[dict]:
    client = get_service_client()
    rows: list[dict] = []
    start = 0
    while True:
        page = (
            client.table("inventory_items")
            .select(_SELECT)
            .eq("household_id", str(household_id))
            # Voided means "this should not count as a real purchase".
            .neq("status", "VOIDED")
            .order("purchased_at", desc=True)
            .range(start, start + _PAGE_SIZE - 1)
            .execute()
            .data
        )
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            return rows
        start += _PAGE_SIZE


def summarize(household_id: UUID, months: int = 12) -> SpendingSummary:
    return aggregate(_fetch_purchases(household_id), months, datetime.now(UTC).date())

"""One-time data loader: seeds global_food_definitions with official entries.

Run from the backend/ directory: `uv run python scripts/seed_food_definitions.py`

Inserts are upserted on `name` so this script is safe to re-run: it won't
create duplicates if some entries already exist.

Each entry gives a shelf life per place as `pantry_shelf_life_days`,
`fridge_shelf_life_days` and `freezer_shelf_life_days`: a number of days, or a
code (-1 never expires, -2 not recommended, -3 unknown). A place left out
becomes -3. An old-style `shelf_life_days` is ignored with a warning, because it
never said which place its number belonged to.
"""

import json
from pathlib import Path

from app.core.supabase import get_service_client
from app.services.expiry import UNKNOWN, is_valid_code

PLACE_KEYS = ("pantry_shelf_life_days", "fridge_shelf_life_days", "freezer_shelf_life_days")

# The seed file predates the SHARED / PERSONAL split rule; anything that was
# a shared or per-unit default is just SHARED now.
_ACCOUNTING = {"PERSONAL": "PERSONAL"}


def _row(entry: dict) -> dict:
    row = {
        "name": entry["name"],
        "preferred_unit": entry["preferred_unit"],
        "category": entry["category"],
        "accounting_type_default": _ACCOUNTING.get(entry.get("accounting_type_default"), "SHARED"),
        "created_by_user_id": None,
        "is_verified": True,
        "usage_count": 0,
    }
    for key in PLACE_KEYS:
        value = entry.get(key)
        if value is None:
            value = UNKNOWN
        if not is_valid_code(value):
            raise ValueError(f"{entry['name']}: {key} must be days or -1, -2, -3 (got {value})")
        row[key] = value
    return row


def main() -> None:
    seed_path = Path(__file__).parent / "food_definitions_seed.json"
    entries = json.loads(seed_path.read_text(encoding="utf-8"))

    legacy = [e["name"] for e in entries if "shelf_life_days" in e]
    if legacy:
        print(
            f"Warning: {len(legacy)} entries still have the old single shelf_life_days "
            "and will load with pantry and fridge unknown (-3)."
        )
    rows = [_row(entry) for entry in entries]

    client = get_service_client()
    result = (
        client.table("global_food_definitions")
        .upsert(rows, on_conflict="name", ignore_duplicates=True)
        .execute()
    )
    print(f"Seeded {len(result.data)} food definitions (of {len(rows)} in the seed file).")


if __name__ == "__main__":
    main()

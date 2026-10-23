"""Exports every table in the live database's public schema to JSON files, without Docker.

This is a safety net next to the manual `supabase db dump` (which needs Docker). It copies
rows, not structure: the migrations in supabase/migrations/ are the structure, so a backup
here plus the migrations is enough to rebuild the data.

    cd backend
    uv run python -m scripts.export_data                  # to ~/BurrowBackups/<date>/
    uv run python -m scripts.export_data --out D:/backups # somewhere else
    uv run python -m scripts.export_data --keep 12        # keep the 12 newest backups

Run it weekly (Windows: Task Scheduler, "uv run python -m scripts.export_data" with the
working folder set to this repo's backend folder).

What it does NOT cover:
  - Login accounts. Passwords and emails live in Supabase Auth (the `auth` schema), which the
    data API cannot read. `users` (public) mirrors the ids, so a restore keeps ownership
    links, but people would need to sign up again. Supabase's own dump covers `auth`.
  - Receipt photos in Storage.

The files contain personal data (emails, nicknames, spending). Keep them out of git and off
shared drives. The default folder is outside the repo for that reason.
"""

import argparse
import json
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.core.supabase import get_service_client

PAGE_SIZE = 1000


def discover_tables() -> list[str]:
    """Every table and view the data API exposes, read from its own description of itself,
    so a table added by a future migration is included without touching this script."""
    settings = get_settings()
    response = httpx.get(
        f"{settings.supabase_url}/rest/v1/",
        headers={
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
        },
        timeout=30.0,
    )
    response.raise_for_status()
    paths = response.json().get("paths", {})
    # Table endpoints look like "/households"; functions are "/rpc/...".
    return sorted(p.lstrip("/") for p in paths if p != "/" and not p.startswith("/rpc/"))


def export_table(client, table: str, out_dir: Path) -> int:
    rows: list[dict] = []
    start = 0
    while True:
        page = client.table(table).select("*").range(start, start + PAGE_SIZE - 1).execute().data
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    (out_dir / f"{table}.json").write_text(
        json.dumps(rows, indent=1, ensure_ascii=False, default=str) + "\n", encoding="utf-8"
    )
    return len(rows)


def prune_old(root: Path, keep: int) -> list[str]:
    backups = sorted(p for p in root.iterdir() if p.is_dir() and p.name[:4].isdigit())
    removed = []
    for old in backups[: max(0, len(backups) - keep)]:
        shutil.rmtree(old)
        removed.append(old.name)
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", type=Path, default=Path.home() / "BurrowBackups")
    parser.add_argument("--keep", type=int, default=8, help="how many backups to keep")
    args = parser.parse_args()

    stamp = datetime.now(UTC).strftime("%Y-%m-%d_%H%M%S")
    out_dir = args.out / stamp
    out_dir.mkdir(parents=True, exist_ok=False)

    client = get_service_client()
    counts: dict[str, int] = {}
    failures: dict[str, str] = {}
    for table in discover_tables():
        try:
            counts[table] = export_table(client, table, out_dir)
        except Exception as exc:  # one unreadable table must not lose the rest
            failures[table] = str(exc)[:200]

    (out_dir / "_manifest.json").write_text(
        json.dumps(
            {"exported_at": datetime.now(UTC).isoformat(), "rows": counts, "failed": failures},
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    removed = prune_old(args.out, args.keep)

    print(f"Wrote {len(counts)} tables ({sum(counts.values())} rows) to {out_dir}")
    for table, count in counts.items():
        print(f"  {table}: {count}")
    if failures:
        print("FAILED:", failures, file=sys.stderr)
    if removed:
        print("Removed old backups:", ", ".join(removed))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

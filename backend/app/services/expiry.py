"""Storage-aware expiry: how long an item lasts depends on where it is kept.

This module is the one place that knows the rules. It is pure (no database, no
clock of its own), so every rule can be tested with plain values and a fixed
`now`. Services read an item's row into a `Clock`, call one function here, and
write the result back.

The model, in short:

* A food has a shelf life for each place (pantry, fridge, freezer), stored as
  ONE integer per place: a positive number of days, or a code (see below).
  Each item keeps its own copy of the three values (taken when it was added),
  so correcting the catalog later never shifts a clock that is already running.
* An item stores how much of its life is left as a fraction (1.0 = fresh,
  0.0 = expired) as of the last time that was settled (`moved_at`). Nothing is
  written daily: the current fraction is worked out when it is needed.
* The expiry date is always derived from the fraction, never typed in
  directly. (A typed date becomes a shelf life for that place instead.)
* "Settle before change": any event that changes how fast the clock runs
  first writes the progress made so far, then applies the change from now.

All the raw integer codes stay inside this module and `PlaceLives`. Callers
get "days / never expires / unknown" back, so a stray -3 can never leak into
date arithmetic.
"""

import math
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum

# --- The codes -------------------------------------------------------------

NEVER_EXPIRES = -1
NOT_RECOMMENDED = -2  # seeded foods only; behaves exactly like UNKNOWN for now
UNKNOWN = -3  # the default

_CODES = (NEVER_EXPIRES, NOT_RECOMMENDED, UNKNOWN)


def is_valid_code(value: int) -> bool:
    """A place value is a positive number of days or one of the three codes.
    Zero would mean "expired the moment it was bought", so it is refused."""
    return value > 0 or value in _CODES


class Place(StrEnum):
    PANTRY = "PANTRY"
    FRIDGE = "FRIDGE"
    FREEZER = "FREEZER"


def place_for_storage_type(storage_type: str) -> Place:
    """Storage locations come in four types; "Other" uses the pantry's rules."""
    if storage_type == "FRIDGE":
        return Place.FRIDGE
    if storage_type == "FREEZER":
        return Place.FREEZER
    return Place.PANTRY


@dataclass(frozen=True)
class PlaceLives:
    """The three place values (positive days or a code) for a food or an item."""

    pantry: int = UNKNOWN
    fridge: int = UNKNOWN
    freezer: int = UNKNOWN

    def __post_init__(self) -> None:
        for value in (self.pantry, self.fridge, self.freezer):
            if not is_valid_code(value):
                raise ValueError(f"Invalid shelf life value: {value}")

    def get(self, place: Place) -> int:
        return {
            Place.PANTRY: self.pantry,
            Place.FRIDGE: self.fridge,
            Place.FREEZER: self.freezer,
        }[place]

    def with_place(self, place: Place, value: int) -> "PlaceLives":
        if not is_valid_code(value):
            raise ValueError(f"Invalid shelf life value: {value}")
        return replace(self, **{place.value.lower(): value})


def own_days(lives: PlaceLives, place: Place) -> int | None:
    """The place's own shelf life in days, or None if it has no number."""
    value = lives.get(place)
    return value if value > 0 else None


def ticking_max(lives: PlaceLives, place: Place) -> int | None:
    """The shelf life, in days, the clock runs against while the item is in
    `place`. None means the clock is not running at all.

    * Its own number, if the place has one.
    * "Never expires" means no clock.
    * Otherwise (unknown / not recommended) the fridge and the pantry borrow
      each other's number. They never borrow the freezer's, which is far
      longer and would make a fridge item look good for months.
    * The freezer never borrows: a freezer with no number simply pauses.
    """
    value = lives.get(place)
    if value > 0:
        return value
    if value == NEVER_EXPIRES or place == Place.FREEZER:
        return None
    other = Place.FRIDGE if place == Place.PANTRY else Place.PANTRY
    return own_days(lives, other)


def is_paused(lives: PlaceLives, place: Place) -> bool:
    """In a freezer with no shelf life of its own: the clock is stopped."""
    return place == Place.FREEZER and own_days(lives, place) is None


# --- The item's clock ------------------------------------------------------


@dataclass(frozen=True)
class Clock:
    """Everything an item needs to answer "when does this expire?"."""

    # Share of life left as of `moved_at` (1.0 fresh .. 0.0 expired).
    # None means never tracked: no shelf life was ever known, so there is no
    # clock, and no move or edit may invent a date.
    remaining_fraction: float | None
    moved_at: datetime
    created_at: datetime
    place: Place
    lives: PlaceLives
    # True once the item has ever changed place. Needed because a printed
    # date only means something as a whole-life shelf life while the item has
    # stayed where it started.
    has_moved: bool = False


def _days_between(later: datetime, earlier: datetime) -> float:
    return max(0.0, (later - earlier).total_seconds() / 86400)


def _utc_date(moment: datetime) -> date:
    return moment.astimezone(UTC).date()


def _clamp(value: float) -> float:
    return min(1.0, max(0.0, value))


def fraction_now(clock: Clock, now: datetime) -> float | None:
    """Share of life left right now. Unchanged while the clock is not running."""
    if clock.remaining_fraction is None:
        return None
    max_days = ticking_max(clock.lives, clock.place)
    if max_days is None:
        return clock.remaining_fraction
    return _clamp(clock.remaining_fraction - _days_between(now, clock.moved_at) / max_days)


def settle(clock: Clock, now: datetime) -> Clock:
    """Write the progress so far, restarting the measuring point at `now`."""
    return replace(clock, remaining_fraction=fraction_now(clock, now), moved_at=now)


def shown_expiry(clock: Clock, previous: date | None = None) -> date | None:
    """The expiry date to show and store, or None for "no expiry date found".

    Only a place with its own number shows a date: an item that is borrowing
    another place's number keeps a hidden clock but displays nothing. Rounds
    down, so a date is never later than the clock says. An already-expired
    item keeps its earlier date instead of drifting to "today".
    """
    if clock.remaining_fraction is None:
        return None
    days = own_days(clock.lives, clock.place)
    if days is None:
        return None
    # The one-second nudge keeps a date that lands exactly on a day boundary
    # from slipping to the day before through floating-point dust.
    moment = clock.moved_at + timedelta(days=clock.remaining_fraction * days, seconds=1)
    derived = _utc_date(moment)
    if clock.remaining_fraction == 0 and previous is not None:
        return min(previous, derived)
    return derived


# --- Creating an item ------------------------------------------------------


def initial_clock(
    lives: PlaceLives,
    place: Place,
    now: datetime,
    typed_expiry: date | None = None,
    no_date: bool = False,
) -> tuple[Clock, date | None]:
    """The clock for a brand-new item, and the expiry date to store with it.

    A typed date wins: it becomes this item's shelf life for the place it
    starts in (days from today). With no typed date the food's number for the
    place is used. An item with no shelf life anywhere is left untracked, and
    so is one the user explicitly asked to have no date (`no_date`).
    """
    base = Clock(remaining_fraction=None, moved_at=now, created_at=now, place=place, lives=lives)
    if no_date and typed_expiry is None:
        return base, None
    if typed_expiry is not None:
        days = (typed_expiry - _utc_date(now)).days
        if days <= 0:
            # Already expired when added: tracked at zero, and the typed date
            # is kept as it is (it is in the past, so nothing derives it).
            return replace(base, remaining_fraction=0.0), typed_expiry
        clock = replace(base, remaining_fraction=1.0, lives=lives.with_place(place, days))
        return clock, shown_expiry(clock)
    if ticking_max(lives, place) is not None:
        clock = replace(base, remaining_fraction=1.0)
        return clock, shown_expiry(clock)
    if is_paused(lives, place) and any(own_days(lives, p) for p in Place):
        # Bought straight into a freezer with no number of its own: fresh and
        # paused. The other places' numbers take over when it comes out.
        return replace(base, remaining_fraction=1.0), None
    return base, None


# --- Moving an item --------------------------------------------------------


def move(clock: Clock, new_place: Place, now: datetime) -> Clock:
    """The item changes storage place. Progress carries over as a share of
    life, so 60% left stays 60% left under the new place's shelf life."""
    if new_place == clock.place:
        return clock
    if clock.remaining_fraction is None:
        # Never tracked: nothing to carry, and a move never invents a date.
        return replace(clock, place=new_place, moved_at=now, has_moved=True)
    return replace(settle(clock, now), place=new_place, has_moved=True)


# --- Editing the expiry date ----------------------------------------------


class EditMeaning(StrEnum):
    """What a date typed after the item has moved means.

    FIX_RULE: "the default was wrong" - this food keeps that long in this place.
    THIS_ITEM: "this item will expire then" - an override of this item's progress.
    """

    FIX_RULE = "FIX_RULE"
    THIS_ITEM = "THIS_ITEM"


def _whole_life_rebase(clock: Clock, new_date: date, now: datetime) -> tuple[Clock, date | None]:
    """The item is still in the place it started: the picked date describes
    its whole life from the day it was added."""
    days = (new_date - _utc_date(clock.created_at)).days
    if days <= 0:
        return replace(clock, remaining_fraction=0.0, moved_at=now), new_date
    lives = clock.lives.with_place(clock.place, days)
    fraction = _clamp(1.0 - _days_between(now, clock.created_at) / days)
    rebuilt = replace(clock, remaining_fraction=fraction, moved_at=now, lives=lives)
    return rebuilt, shown_expiry(rebuilt)


def _restart(clock: Clock, new_date: date, now: datetime) -> tuple[Clock, date | None]:
    """Restart the clock at full life, ending on `new_date`."""
    days = (new_date - _utc_date(now)).days
    if days <= 0:
        return replace(clock, remaining_fraction=0.0, moved_at=now), new_date
    restarted = replace(
        clock,
        remaining_fraction=1.0,
        moved_at=now,
        lives=clock.lives.with_place(clock.place, days),
    )
    return restarted, shown_expiry(restarted)


def edit_current_date(
    clock: Clock,
    new_date: date | None,
    now: datetime,
    meaning: EditMeaning = EditMeaning.THIS_ITEM,
    previous: date | None = None,
) -> tuple[Clock, date | None]:
    """The user sets the expiry date for the place the item is in now.

    Returns the new clock and the date to store. When the item has moved and
    `meaning` is not given, THIS_ITEM is used: it always honors the date the
    user picked.
    """
    if new_date is None:
        # Cleared: no date. The item stops being tracked.
        return replace(clock, remaining_fraction=None, moved_at=now), None

    if clock.remaining_fraction is None or not clock.has_moved:
        return _whole_life_rebase(clock, new_date, now)

    settled = settle(clock, now)
    if settled.remaining_fraction == 0 and new_date > _utc_date(now):
        # Expired, then given a later date: a renewal, not a history edit.
        return _restart(settled, new_date, now)

    if meaning == EditMeaning.FIX_RULE:
        days = (new_date - _utc_date(clock.created_at)).days
        if days <= 0:
            raise ValueError("That date is before the item was added")
        fixed = replace(settled, lives=settled.lives.with_place(settled.place, days))
        return fixed, shown_expiry(fixed, previous)

    # THIS_ITEM: override this item's progress so it lands on the picked date.
    days_to_go = (new_date - _utc_date(now)).days
    if days_to_go <= 0:
        return replace(settled, remaining_fraction=0.0), new_date
    max_days = own_days(settled.lives, settled.place)
    if max_days is not None and days_to_go <= max_days:
        overridden = replace(settled, remaining_fraction=days_to_go / max_days)
        return overridden, shown_expiry(overridden)
    # Longer than the place allows, or the place has no number of its own:
    # restart with this item's own shelf life for the place.
    return _restart(settled, new_date, now)


def preview_edit(
    clock: Clock, new_date: date, now: datetime, previous: date | None = None
) -> dict[EditMeaning, date | None]:
    """What each meaning would leave as the expiry date, for the prompt shown
    when an item that has moved gets its date edited."""
    return {
        meaning: edit_current_date(clock, new_date, now, meaning, previous)[1]
        for meaning in EditMeaning
    }


def edit_place_days(
    clock: Clock, place: Place, new_date: date, now: datetime
) -> tuple[Clock, date | None]:
    """Set the shelf life for a place the item is NOT in, from a picked date.

    Meaning: "if it had been kept there since it was added, it would expire
    on this date", so the days run from the day the item was added.
    """
    days = (new_date - _utc_date(clock.created_at)).days
    if days <= 0:
        raise ValueError("That date is before the item was added")
    settled = settle(clock, now)
    changed = replace(settled, lives=settled.lives.with_place(place, days))
    return changed, shown_expiry(changed)


def remove_place(
    clock: Clock, place: Place, now: datetime, previous: date | None = None
) -> tuple[Clock, date | None]:
    """Forget this item's shelf life for a place (it becomes unknown)."""
    settled = settle(clock, now)
    changed = replace(settled, lives=settled.lives.with_place(place, UNKNOWN))
    return changed, shown_expiry(changed, previous)


def add_place_back(
    clock: Clock, place: Place, food_value: int, now: datetime, previous: date | None = None
) -> tuple[Clock, date | None]:
    """Give a removed place its value again: the food's number if it has one,
    otherwise it stays unknown (never zero) until a positive number is typed."""
    restored = food_value if food_value > 0 or food_value == NEVER_EXPIRES else UNKNOWN
    settled = settle(clock, now)
    changed = replace(settled, lives=settled.lives.with_place(place, restored))
    return changed, shown_expiry(changed, previous)


def round_fraction(value: float | None) -> float | None:
    """What the database column holds (eight decimals: for a one-year shelf
    life that is a few hundredths of a second)."""
    return None if value is None else math.floor(value * 100_000_000 + 0.5) / 100_000_000

"""The storage-aware expiry rules (app/services/expiry.py). Every row of the
plan's rule tables is one test here; no database is involved."""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.services import expiry
from app.services.expiry import (
    NEVER_EXPIRES,
    NOT_RECOMMENDED,
    UNKNOWN,
    Clock,
    EditMeaning,
    Place,
    PlaceLives,
)

NOW = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
TODAY = NOW.date()


def at(days: float) -> datetime:
    return NOW + timedelta(days=days)


def on(days: int) -> date:
    return TODAY + timedelta(days=days)


BREAD = PlaceLives(pantry=5, fridge=10, freezer=UNKNOWN)


def new_clock(lives: PlaceLives = BREAD, place: Place = Place.PANTRY, typed=None):
    return expiry.initial_clock(lives, place, NOW, typed)


# ---------------------------------------------------------------- the codes


def test_valid_codes():
    assert expiry.is_valid_code(1)
    assert expiry.is_valid_code(365)
    for code in (NEVER_EXPIRES, NOT_RECOMMENDED, UNKNOWN):
        assert expiry.is_valid_code(code)


def test_zero_and_unknown_negatives_are_refused():
    assert not expiry.is_valid_code(0)
    assert not expiry.is_valid_code(-4)
    with pytest.raises(ValueError):
        PlaceLives(pantry=0)
    with pytest.raises(ValueError):
        PlaceLives().with_place(Place.FRIDGE, -9)


def test_place_for_storage_type_maps_other_to_pantry():
    assert expiry.place_for_storage_type("FRIDGE") == Place.FRIDGE
    assert expiry.place_for_storage_type("FREEZER") == Place.FREEZER
    assert expiry.place_for_storage_type("PANTRY") == Place.PANTRY
    assert expiry.place_for_storage_type("OTHER") == Place.PANTRY


# --------------------------------------------------------- effective max


def test_own_number_is_used():
    assert expiry.ticking_max(BREAD, Place.PANTRY) == 5
    assert expiry.ticking_max(BREAD, Place.FRIDGE) == 10


def test_never_expires_has_no_clock_and_does_not_borrow():
    lives = PlaceLives(pantry=NEVER_EXPIRES, fridge=10)
    assert expiry.ticking_max(lives, Place.PANTRY) is None


@pytest.mark.parametrize("code", [UNKNOWN, NOT_RECOMMENDED])
def test_pantry_borrows_the_fridge_and_fridge_borrows_the_pantry(code):
    assert expiry.ticking_max(PlaceLives(pantry=code, fridge=10), Place.PANTRY) == 10
    assert expiry.ticking_max(PlaceLives(pantry=5, fridge=code), Place.FRIDGE) == 5


def test_nothing_borrows_from_the_freezer():
    lives = PlaceLives(pantry=UNKNOWN, fridge=UNKNOWN, freezer=180)
    assert expiry.ticking_max(lives, Place.PANTRY) is None
    assert expiry.ticking_max(lives, Place.FRIDGE) is None


def test_freezer_never_borrows_it_pauses():
    lives = PlaceLives(pantry=5, fridge=10, freezer=UNKNOWN)
    assert expiry.ticking_max(lives, Place.FREEZER) is None
    assert expiry.is_paused(lives, Place.FREEZER)


def test_known_freezer_ticks():
    lives = PlaceLives(pantry=5, fridge=10, freezer=90)
    assert expiry.ticking_max(lives, Place.FREEZER) == 90
    assert not expiry.is_paused(lives, Place.FREEZER)


# --------------------------------------------------------------- creating


def test_new_item_takes_the_place_default():
    clock, date_out = new_clock()
    assert clock.remaining_fraction == 1.0
    assert date_out == on(5)


def test_typed_date_becomes_this_items_shelf_life_for_the_place():
    clock, date_out = new_clock(typed=on(14))
    assert date_out == on(14)
    assert clock.lives.pantry == 14
    assert clock.lives.fridge == 10  # other places untouched


def test_typed_date_wins_even_when_the_place_is_unknown():
    clock, date_out = new_clock(PlaceLives(), Place.FRIDGE, typed=on(7))
    assert date_out == on(7)
    assert clock.lives.fridge == 7


def test_typed_date_in_the_past_is_expired_and_kept():
    clock, date_out = new_clock(typed=on(-2))
    assert clock.remaining_fraction == 0.0
    assert date_out == on(-2)


def test_explicitly_no_date_leaves_the_item_untracked():
    clock, date_out = expiry.initial_clock(BREAD, Place.PANTRY, NOW, no_date=True)
    assert clock.remaining_fraction is None
    assert date_out is None
    assert clock.lives == BREAD  # the place values are still copied


def test_a_typed_date_beats_the_no_date_flag():
    clock, date_out = expiry.initial_clock(BREAD, Place.PANTRY, NOW, on(3), no_date=True)
    assert date_out == on(3)


def test_borrowed_clock_runs_but_shows_no_date():
    clock, date_out = new_clock(PlaceLives(pantry=UNKNOWN, fridge=10), Place.PANTRY)
    assert clock.remaining_fraction == 1.0
    assert date_out is None


def test_item_with_no_shelf_life_anywhere_is_untracked():
    clock, date_out = new_clock(PlaceLives(freezer=180), Place.FRIDGE)
    assert clock.remaining_fraction is None
    assert date_out is None


def test_unknown_freezer_item_starts_paused_without_a_date():
    clock, date_out = new_clock(BREAD, Place.FREEZER)
    assert date_out is None
    assert expiry.is_paused(clock.lives, clock.place)


# ----------------------------------------------------------- reading time


def test_fraction_falls_with_time():
    clock, _ = new_clock()
    assert expiry.fraction_now(clock, at(2)) == pytest.approx(0.6)


def test_fraction_stops_at_zero():
    clock, _ = new_clock()
    assert expiry.fraction_now(clock, at(50)) == 0.0


def test_paused_clock_does_not_move():
    clock, _ = new_clock(BREAD, Place.FREEZER)
    assert expiry.fraction_now(clock, at(400)) == 1.0


def test_never_expires_clock_does_not_move():
    clock = Clock(1.0, NOW, NOW, Place.PANTRY, PlaceLives(pantry=NEVER_EXPIRES))
    assert expiry.fraction_now(clock, at(400)) == 1.0


def test_expiry_rounds_down_never_later_than_the_clock():
    clock = Clock(0.46, NOW, NOW, Place.PANTRY, PlaceLives(pantry=5))  # 2.3 days left
    assert expiry.shown_expiry(clock) == on(2)  # noon + 2.3 days is the evening of day 2


def test_expired_item_keeps_its_earlier_date():
    clock = Clock(0.0, at(9), NOW, Place.PANTRY, PlaceLives(pantry=5))
    assert expiry.shown_expiry(clock, previous=on(5)) == on(5)


# ------------------------------------------------------------------ moves


def test_the_bread_example_pantry_to_fridge():
    clock, _ = new_clock()  # day 0, pantry (5)
    day3 = expiry.move(clock, Place.FRIDGE, at(3))
    assert day3.remaining_fraction == pytest.approx(0.4)
    assert expiry.fraction_now(day3, at(4)) == pytest.approx(0.3)  # ticks at 1/10 a day
    assert expiry.shown_expiry(day3) == on(3 + 4)  # 0.4 x 10 = 4 days from day 3


def test_a_move_marks_the_item_as_moved_but_a_no_op_does_not():
    clock, _ = new_clock()
    assert not clock.has_moved
    assert expiry.move(clock, Place.PANTRY, at(1)) is clock
    assert expiry.move(clock, Place.FRIDGE, at(1)).has_moved


def test_other_storage_counts_as_pantry_so_pantry_to_other_changes_nothing():
    clock, _ = new_clock()
    moved = expiry.move(clock, expiry.place_for_storage_type("OTHER"), at(1))
    assert moved is clock


def test_into_an_unknown_freezer_pauses_the_clock():
    clock, _ = new_clock()
    frozen = expiry.move(clock, Place.FREEZER, at(2))
    assert frozen.remaining_fraction == pytest.approx(0.6)
    assert expiry.fraction_now(frozen, at(400)) == pytest.approx(0.6)
    assert expiry.shown_expiry(frozen) is None


def test_out_of_a_paused_freezer_keeps_the_share_of_life():
    clock, _ = new_clock()
    frozen = expiry.move(clock, Place.FREEZER, at(2))  # 60% left
    thawed = expiry.move(frozen, Place.FRIDGE, at(62))  # 60 days later
    assert thawed.remaining_fraction == pytest.approx(0.6)
    assert expiry.shown_expiry(thawed) == on(62 + 6)  # 0.6 x 10 days from day 62


def test_known_freezer_ticks_slowly_and_thaws_with_what_is_left():
    lives = PlaceLives(pantry=5, fridge=10, freezer=100)
    clock, _ = new_clock(lives)
    frozen = expiry.move(clock, Place.FREEZER, at(0))
    thawed = expiry.move(frozen, Place.PANTRY, at(30))  # 30 of 100 freezer days used
    assert thawed.remaining_fraction == pytest.approx(0.7)
    assert expiry.shown_expiry(thawed) == on(30 + 4)  # noon + 3.5 days = midnight starting day 34


def test_expired_item_stays_expired_through_a_freeze():
    clock, _ = new_clock()
    late = at(9)  # past its 5 days
    frozen = expiry.move(clock, Place.FREEZER, late)
    assert frozen.remaining_fraction == 0.0
    thawed = expiry.move(frozen, Place.FRIDGE, at(60))
    assert thawed.remaining_fraction == 0.0


def test_never_tracked_item_gets_no_date_from_a_move():
    clock, _ = new_clock(PlaceLives(), Place.FRIDGE)
    moved = expiry.move(clock, Place.PANTRY, at(3))
    assert moved.remaining_fraction is None
    assert expiry.shown_expiry(moved) is None


def test_moving_to_a_place_with_no_number_keeps_ticking_on_a_borrowed_one():
    lives = PlaceLives(pantry=UNKNOWN, fridge=10)
    clock, _ = new_clock(lives, Place.FRIDGE)
    moved = expiry.move(clock, Place.PANTRY, at(2))
    assert moved.remaining_fraction == pytest.approx(0.8)
    assert expiry.fraction_now(moved, at(3)) == pytest.approx(0.7)  # still 1/10 a day
    assert expiry.shown_expiry(moved) is None  # hidden: a borrowed number


def test_many_moves_carry_the_share_without_any_history():
    lives = PlaceLives(pantry=5, fridge=10, freezer=100)
    clock, _ = new_clock(lives)
    clock = expiry.move(clock, Place.FRIDGE, at(1))  # 0.8 left
    clock = expiry.move(clock, Place.FREEZER, at(3))  # 0.6 left (2 fridge days)
    clock = expiry.move(clock, Place.FRIDGE, at(13))  # 10 freezer days: 0.5 left
    clock = expiry.move(clock, Place.PANTRY, at(15))  # 2 fridge days: 0.3 left
    assert clock.remaining_fraction == pytest.approx(0.3)
    assert expiry.fraction_now(clock, at(16)) == pytest.approx(0.1)  # 1 pantry day = 0.2


# --------------------------------------------------- editing the main date


def test_date_edit_on_an_item_that_never_moved_is_honored_exactly():
    clock, _ = new_clock()
    edited, date_out = expiry.edit_current_date(clock, on(14), at(4))
    assert date_out == on(14)
    assert edited.lives.pantry == 14
    # 4 of its 14 days are used: the share left is 10/14, not 60%.
    assert edited.remaining_fraction == pytest.approx(10 / 14)


def test_date_edit_on_an_untracked_item_starts_a_clock():
    clock, _ = new_clock(PlaceLives(), Place.PANTRY)
    edited, date_out = expiry.edit_current_date(clock, on(10), at(1))
    assert date_out == on(10)
    assert edited.remaining_fraction is not None


def _moved_bread():
    """Added day 0 in the pantry (5), moved to the fridge (10) on day 3."""
    clock, _ = new_clock()
    return expiry.move(clock, Place.FRIDGE, at(3))


def test_moved_item_this_item_honors_the_picked_date_without_touching_the_rule():
    edited, date_out = expiry.edit_current_date(
        _moved_bread(), on(12), at(4), EditMeaning.THIS_ITEM
    )
    assert date_out == on(12)
    assert edited.lives.fridge == 10
    assert edited.remaining_fraction == pytest.approx(0.8)


def test_moved_item_fix_rule_changes_the_rule_and_keeps_progress():
    edited, date_out = expiry.edit_current_date(_moved_bread(), on(12), at(4), EditMeaning.FIX_RULE)
    assert edited.lives.fridge == 12
    assert edited.remaining_fraction == pytest.approx(0.3)
    assert date_out == on(8)  # 0.3 x 12 = 3.6 days from day 4, rounded down


def test_default_meaning_for_a_moved_item_is_this_item():
    edited, date_out = expiry.edit_current_date(_moved_bread(), on(9), at(4))
    assert date_out == on(9)


def test_this_item_longer_than_the_place_allows_restarts_the_clock():
    edited, date_out = expiry.edit_current_date(
        _moved_bread(), on(30), at(4), EditMeaning.THIS_ITEM
    )
    assert date_out == on(30)
    assert edited.lives.fridge == 26
    assert edited.remaining_fraction == 1.0


def test_this_item_on_a_place_with_no_number_restarts_with_its_own():
    clock, _ = new_clock(PlaceLives(pantry=5, fridge=UNKNOWN), Place.PANTRY)
    moved = expiry.move(clock, Place.FRIDGE, at(2))  # borrows the pantry's 5, shows nothing
    edited, date_out = expiry.edit_current_date(moved, on(8), at(3))
    assert date_out == on(8)
    assert edited.lives.fridge == 5


def test_expired_item_with_a_later_date_is_a_renewal():
    moved = expiry.move(new_clock()[0], Place.FRIDGE, at(1))
    for meaning in EditMeaning:
        edited, date_out = expiry.edit_current_date(moved, on(60), at(40), meaning)
        assert date_out == on(60)
        assert edited.remaining_fraction == 1.0


def test_picking_a_past_date_marks_the_item_expired():
    edited, date_out = expiry.edit_current_date(_moved_bread(), on(-1), at(4))
    assert edited.remaining_fraction == 0.0
    assert date_out == on(-1)


def test_fix_rule_before_the_item_was_added_is_refused():
    with pytest.raises(ValueError):
        expiry.edit_current_date(_moved_bread(), on(-1), at(0.5), EditMeaning.FIX_RULE)


def test_clearing_the_date_stops_tracking_the_item():
    edited, date_out = expiry.edit_current_date(_moved_bread(), None, at(4))
    assert date_out is None
    assert edited.remaining_fraction is None


def test_preview_shows_both_outcomes_for_the_prompt():
    preview = expiry.preview_edit(_moved_bread(), on(12), at(4))
    assert preview[EditMeaning.THIS_ITEM] == on(12)
    assert preview[EditMeaning.FIX_RULE] == on(8)


# -------------------------------------------------- other places' numbers


def test_setting_another_places_days_counts_from_the_day_it_was_added():
    clock, _ = new_clock()
    edited, _ = expiry.edit_place_days(clock, Place.FRIDGE, on(12), at(1))
    assert edited.lives.fridge == 12


def test_setting_another_places_days_before_it_was_added_is_refused():
    clock, _ = new_clock()
    with pytest.raises(ValueError):
        expiry.edit_place_days(clock, Place.FRIDGE, on(-1), at(1))


def test_editing_the_place_an_item_borrows_from_settles_first():
    lives = PlaceLives(pantry=UNKNOWN, fridge=10)
    clock, _ = new_clock(lives, Place.PANTRY)  # borrowing the fridge's 10
    edited, _ = expiry.edit_place_days(clock, Place.FRIDGE, on(5), at(5))
    # 5 days passed at 1/10 a day, then the rule changed: 0.5 left, ticking at 1/5.
    assert edited.remaining_fraction == pytest.approx(0.5)
    assert expiry.fraction_now(edited, at(6)) == pytest.approx(0.3)


def test_removing_a_place_makes_it_unknown_after_settling():
    clock, _ = new_clock()
    edited, date_out = expiry.remove_place(clock, Place.PANTRY, at(2))
    assert edited.lives.pantry == UNKNOWN
    assert edited.remaining_fraction == pytest.approx(0.6)
    assert date_out is None  # no number of its own any more: nothing shown


def test_adding_a_place_back_uses_the_foods_number():
    clock, _ = expiry.remove_place(new_clock()[0], Place.PANTRY, at(0))
    edited, _ = expiry.add_place_back(clock, Place.PANTRY, 5, at(0))
    assert edited.lives.pantry == 5


def test_adding_a_place_back_with_no_default_stays_unknown_not_zero():
    clock, _ = expiry.remove_place(new_clock()[0], Place.PANTRY, at(0))
    for food_value in (UNKNOWN, NOT_RECOMMENDED):
        edited, _ = expiry.add_place_back(clock, Place.PANTRY, food_value, at(0))
        assert edited.lives.pantry == UNKNOWN


def test_adding_a_place_back_can_restore_never_expires():
    clock, _ = expiry.remove_place(new_clock()[0], Place.PANTRY, at(0))
    edited, _ = expiry.add_place_back(clock, Place.PANTRY, NEVER_EXPIRES, at(0))
    assert edited.lives.pantry == NEVER_EXPIRES


# ------------------------------------------------------------- storage


def test_round_fraction_matches_the_column():
    assert expiry.round_fraction(None) is None
    assert expiry.round_fraction(0.123456789) == pytest.approx(0.12345679)

"""split_cost: dividing one cost over several containers without losing or inventing a cent."""

from decimal import Decimal

import pytest

from app.services.inventory_items import split_cost


def test_leftover_cents_go_on_the_first_containers():
    assert split_cost(Decimal("10.00"), 3) == [Decimal("3.34"), Decimal("3.33"), Decimal("3.33")]


def test_an_even_split_is_equal():
    assert split_cost(Decimal("9.00"), 3) == [Decimal("3.00")] * 3


def test_one_cent_over_three_gives_it_to_the_first_only():
    assert split_cost(Decimal("0.01"), 3) == [Decimal("0.01"), Decimal("0"), Decimal("0")]


def test_zero_cost_stays_zero():
    assert split_cost(Decimal("0"), 4) == [Decimal("0")] * 4


def test_one_container_gets_everything():
    assert split_cost(Decimal("4.99"), 1) == [Decimal("4.99")]


@pytest.mark.parametrize("count", [2, 3, 7, 24])
@pytest.mark.parametrize("total", ["0.01", "1.00", "10.00", "19.99", "100.03"])
def test_the_parts_always_add_up_to_the_total(total, count):
    parts = split_cost(Decimal(total), count)
    assert len(parts) == count
    assert sum(parts) == Decimal(total)
    assert max(parts) - min(parts) <= Decimal("0.01")

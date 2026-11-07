"""Turns a scanned barcode into suggestions for the add-item wizard.

The barcode itself is only a number (a GTIN); everything useful -- the product's name
and brand -- comes from a product database. Open Food Facts is that database for
now: free, no key, crowdsourced, so records vary a lot in quality. Everything returned
here is therefore a suggestion for the person to confirm, never a final answer.

Package size is deliberately NOT looked up. Records often lack it, and the nearest
substitute (a serving size) is a different number that looks just as plausible; a
wrong size the person trusts is worse than a blank box that makes them check.
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import UUID

import httpx

from app.core.config import get_settings
from app.schemas.barcode import BarcodeLookup, BarcodeLookupStatus, RememberedBarcode
from app.schemas.food_definition import FoodDefinition
from app.services import food_barcodes as food_barcodes_service
from app.services import food_definitions as food_definitions_service
from app.services.gtin import database_code, is_store_code, normalize_gtin

_logger = logging.getLogger(__name__)

_OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
_OFF_FIELDS = ",".join(
    [
        "product_name",
        "generic_name",
        "brands",
        "categories_tags",
    ]
)
_FETCH_TIMEOUT_SECONDS = 10.0

_MAX_CANDIDATES = 6
_MAX_QUERIES = 5


class BarcodeProviderError(Exception):
    """The product database couldn't be reached or answered badly. Worth a retry,
    unlike a barcode it simply doesn't know."""


# --- Product database --------------------------------------------------------------


def _fetch_product(code: str) -> dict[str, Any] | None:
    """The product record, or None when the database doesn't know the barcode."""
    try:
        response = httpx.get(
            _OFF_PRODUCT_URL.format(code=code),
            params={"fields": _OFF_FIELDS},
            headers={"User-Agent": get_settings().barcode_user_agent},
            timeout=_FETCH_TIMEOUT_SECONDS,
            follow_redirects=True,
        )
    except httpx.TimeoutException as exc:
        raise BarcodeProviderError("The product database took too long to answer.") from exc
    except httpx.RequestError as exc:
        raise BarcodeProviderError("Couldn't reach the product database.") from exc

    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise BarcodeProviderError(
            f"The product database returned an error ({response.status_code})."
        )
    try:
        data = response.json()
    except ValueError as exc:
        raise BarcodeProviderError("The product database sent an unreadable answer.") from exc
    if data.get("status") != 1:
        return None
    product = data.get("product")
    return product if isinstance(product, dict) else None


# --- Food type suggestions ---------------------------------------------------------


def _tag_to_phrase(tag: str) -> str:
    """ "en:whole-milks" -> "whole milks". Non-English tags give "" (skipped)."""
    language, _, name = tag.partition(":")
    return name.replace("-", " ") if language == "en" and name else ""


def _singular(phrase: str) -> str:
    return phrase[:-1] if phrase.endswith("s") and not phrase.endswith("ss") else phrase


def _without_brand(name: str, brand: str | None) -> str:
    if not brand:
        return name.strip()
    return re.sub(re.escape(brand), "", name, flags=re.IGNORECASE).strip()


def _category_queries(product: dict[str, Any]) -> list[str]:
    queries: list[str] = []
    generic = (product.get("generic_name") or "").strip()
    if generic:
        queries.append(generic)
    # Open Food Facts lists tags general-to-specific, so the last ones fit best.
    for tag in reversed(product.get("categories_tags") or []):
        phrase = _tag_to_phrase(tag)
        if not phrase:
            continue
        for variant in (phrase, _singular(phrase)):
            if variant not in queries:
                queries.append(variant)
        if len(queries) >= _MAX_QUERIES:
            break
    return queries[:_MAX_QUERIES]


# Words that say nothing about WHAT the food is: joiners, packaging and marketing. Searching
# for "and" or "original" only adds noise.
_STOPWORDS = frozenset(
    "a an and or the of with in for from to by on at as & "
    "original classic regular natural style flavor flavored flavour brand "
    "new fresh premium real pure organic "
    "oz ml fl lb lbs pack count ct".split()
)
_MAX_NAME_WORDS = 4


def _name_words(name: str, brand: str | None) -> list[str]:
    """The meaningful words of a product name: brand and filler removed, no repeats.
    "Kraft Parmesan & Romano Cheese" -> ["parmesan", "romano", "cheese"]."""
    words: list[str] = []
    for word in re.findall(r"[a-z]+", _without_brand(name, brand).lower()):
        if len(word) > 2 and word not in _STOPWORDS and word not in words:
            words.append(word)
    return words[:_MAX_NAME_WORDS]


def _search_all(queries: list[str]) -> list[FoodDefinition]:
    """Catalog search for each query (independent, so run side by side), merged in
    query order with duplicates dropped."""
    if not queries:
        return []
    with ThreadPoolExecutor(max_workers=min(len(queries), 8)) as pool:
        results = list(pool.map(lambda q: food_definitions_service.search(q, limit=4), queries))
    seen: set[UUID] = set()
    merged: list[FoodDefinition] = []
    for result in results:
        for food in result:
            if food.id not in seen:
                seen.add(food.id)
                merged.append(food)
    return merged


def _words_matched(food: FoodDefinition, words: list[str]) -> int:
    """How many of the product's name words appear in the food's name."""
    name = food.name.lower()
    return sum(1 for word in words if word in name or _singular(word) in name)


def _suggest_foods(product: dict[str, Any], brand: str | None) -> list[FoodDefinition]:
    """Catalog foods that might be this product, best guess first.

    The product's own name words are searched one by one (a whole name rarely matches a
    catalog entry: "Parmesan & Romano Cheese" vs "Parmesan Cheese"), alongside its
    categories. Foods are then ranked by how many of the name's words they contain, so
    "Parmesan Cheese" (2 of 3) beats "Cheddar Cheese" (1 of 3). The sort is stable, so
    ties keep the order they were found in: name searches first, then categories.
    """
    words = _name_words(product.get("product_name") or "", brand)
    queries: list[str] = []
    if len(words) > 1:
        queries.append(" ".join(words))
    queries += words
    for query in _category_queries(product):
        if query not in queries:
            queries.append(query)

    candidates = _search_all(queries)
    candidates.sort(key=lambda food: -_words_matched(food, words))
    return candidates[:_MAX_CANDIDATES]


# --- Entry point -------------------------------------------------------------------


def _first_brand(product: dict[str, Any]) -> str | None:
    brands = (product.get("brands") or "").split(",")
    return brands[0].strip() or None


def _remembered_lookup(household_id: UUID, gtin: str) -> BarcodeLookup | None:
    """The household's own confirmed answers for this barcode, or None if it has none."""
    try:
        remembered = food_barcodes_service.get(household_id, gtin)
    except Exception:
        # The memory is a shortcut, not a requirement: if it can't be read, fall back to the
        # product database rather than failing the scan.
        _logger.exception("Couldn't read the barcode memory for %s", gtin)
        return None
    if remembered is None:
        return None
    food = food_definitions_service.get_by_id(remembered.global_food_definition_id)
    if food is None:
        return None
    return BarcodeLookup(
        gtin=gtin,
        status=BarcodeLookupStatus.REMEMBERED,
        remembered=RememberedBarcode(
            food=food,
            name_override=remembered.name_override,
            quantity=remembered.quantity,
            unit=remembered.preferred_unit,
            container_count=remembered.container_count,
        ),
    )


def lookup(household_id: UUID, raw_barcode: str) -> BarcodeLookup:
    """What a scan suggests: the household's own memory first, then the product database.

    Raises InvalidBarcodeError for a number that isn't a real barcode, and
    BarcodeProviderError when the product database can't be reached.
    """
    gtin = normalize_gtin(raw_barcode)
    if is_store_code(gtin):
        return BarcodeLookup(gtin=gtin, status=BarcodeLookupStatus.STORE_CODE)

    # What the household already confirmed beats any guess, and costs no network call.
    remembered = _remembered_lookup(household_id, gtin)
    if remembered is not None:
        return remembered

    product = _fetch_product(database_code(gtin))
    if product is None:
        return BarcodeLookup(gtin=gtin, status=BarcodeLookupStatus.NOT_FOUND)

    name = (product.get("product_name") or "").strip() or None
    brand = _first_brand(product)
    nickname = name
    if name and brand and brand.lower() not in name.lower():
        nickname = f"{brand} {name}"

    return BarcodeLookup(
        gtin=gtin,
        status=BarcodeLookupStatus.FOUND,
        product_name=name,
        brand=brand,
        suggested_nickname=nickname,
        candidates=_suggest_foods(product, brand),
    )

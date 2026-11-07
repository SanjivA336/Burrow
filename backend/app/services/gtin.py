"""Barcode numbers (GTINs): validating them and giving each product one canonical key.

Pure functions only -- no network, no database -- so both the barcode lookup and the
barcode memory can use them without depending on each other.
"""

import re


class InvalidBarcodeError(Exception):
    """The text isn't a real barcode number (wrong length, or the check digit fails)."""


def check_digit_ok(digits: str) -> bool:
    """GS1 check digit: from the right, skipping the check digit itself, weight the
    digits 3, 1, 3, 1...; the total plus the check digit must be a multiple of 10."""
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def normalize_gtin(raw: str) -> str:
    """Any scanned retail barcode (EAN-8, UPC-A, EAN-13, GTIN-14) as one 14-digit key.

    A UPC-A is just an EAN-13 with a leading 0, so padding everything to 14 digits
    means the same product always gets the same key. Raises InvalidBarcodeError for
    anything that isn't a real barcode, which also catches most camera misreads.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) not in (8, 12, 13, 14):
        raise InvalidBarcodeError("That doesn't look like a product barcode.")
    if not check_digit_ok(digits):
        raise InvalidBarcodeError("That barcode number doesn't check out. Try scanning again.")
    return digits.zfill(14)


def is_store_code(gtin14: str) -> bool:
    """True for store-printed codes: by-weight meat, deli and bakery labels (UPC-A
    starting 2, EAN-13 starting 20-29), store-use codes (4) and coupons (5). They
    embed that one store's own price or weight, so no product database knows them."""
    ean13 = gtin14[-13:]
    return ean13[0] == "2" or ean13[:2] in ("02", "04", "05")


def database_code(gtin14: str) -> str:
    """The form Open Food Facts files a product under: 13 digits for UPC-A/EAN-13, or
    the plain 8 digits of an EAN-8."""
    core = gtin14.lstrip("0")
    return core.zfill(13) if len(core) > 8 else core.zfill(8)

import pytest

from app.services import gtin as codes


def _valid(body: str) -> str:
    """Appends the right check digit to a barcode body, so tests can use any prefix."""
    return next(body + str(d) for d in range(10) if codes.check_digit_ok(body + str(d)))


def test_normalize_pads_every_length_to_the_same_key() -> None:
    upc_a = "036000291452"
    ean_13 = "0036000291452"
    assert codes.normalize_gtin(upc_a) == codes.normalize_gtin(ean_13) == "00036000291452"


def test_normalize_ignores_spaces_and_dashes() -> None:
    assert codes.normalize_gtin("0-36000-29145-2") == "00036000291452"


def test_normalize_accepts_ean_8() -> None:
    assert codes.normalize_gtin("96385074") == "00000096385074"


@pytest.mark.parametrize("raw", ["", "abc", "12345", "036000291453", "0811620124172"])
def test_normalize_rejects_non_barcodes_and_bad_check_digits(raw: str) -> None:
    with pytest.raises(codes.InvalidBarcodeError):
        codes.normalize_gtin(raw)


def test_database_code_matches_how_the_database_files_products() -> None:
    assert codes.database_code("00811620124171") == "0811620124171"
    assert codes.database_code("00036000291452") == "0036000291452"
    assert codes.database_code("00000096385074") == "96385074"


@pytest.mark.parametrize(
    "body",
    [
        "21234567890",  # UPC-A starting 2: by-weight meat/deli labels
        "201234567890",  # EAN-13 starting 20: the same idea outside the US
        "40123456789",  # UPC-A starting 4: store use
        "50123456789",  # UPC-A starting 5: coupons
    ],
)
def test_store_codes_are_detected(body: str) -> None:
    assert codes.is_store_code(codes.normalize_gtin(_valid(body)))


@pytest.mark.parametrize("raw", ["036000291452", "0811620124171"])
def test_product_barcodes_are_not_store_codes(raw: str) -> None:
    assert not codes.is_store_code(codes.normalize_gtin(raw))

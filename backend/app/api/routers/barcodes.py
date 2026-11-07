from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import require_household_membership
from app.core.responses import Envelope, ok
from app.schemas.barcode import BarcodeLookup
from app.schemas.member import Member
from app.services import barcode_lookup as barcode_lookup_service
from app.services.gtin import InvalidBarcodeError

# Household-scoped because the lookup checks what this household has already scanned and
# confirmed (the food_barcodes memory) before asking the product database. Any member of the
# household can use it.
router = APIRouter(prefix="/households/{household_id}/barcodes", tags=["barcodes"])


@router.get("/{barcode}", response_model=Envelope[BarcodeLookup])
def look_up_barcode(
    household_id: UUID,
    barcode: str,
    _member: Member = Depends(require_household_membership),
) -> Envelope[BarcodeLookup]:
    try:
        return ok(barcode_lookup_service.lookup(household_id, barcode))
    except InvalidBarcodeError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except barcode_lookup_service.BarcodeProviderError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Couldn't reach the product database right now. Try again, or enter the item by hand.",
        ) from exc

"""A small per-client-IP rate limiter, hand-rolled instead of pulled from a
library: slowapi (the usual choice here) silently no-ops against this
project's FastAPI/Starlette version -- it introspects `app.routes` to find
which endpoint a request matches, and that version's routing internals
(lazily-resolved `_IncludedRouter`/`_EffectiveRouteContext` wrappers, not
the flat list of plain `APIRoute` objects slowapi expects) make every
lookup come back empty, which slowapi treats as "no handler found, exempt."
It reports itself as enabled and correctly configured the whole time --
the requests just never actually got counted. This avoids all of that by
never touching FastAPI's route representation at all.

A token bucket, in memory, per process. Each client IP has a bucket holding up
to `max_requests` tokens that refills steadily, `max_requests` per
`window_seconds`; a request spends one token, and with none left it is refused.
So "300 per minute" means a burst of up to 300 and then about 5 a second.
Compared with counting in fixed one-minute blocks, a refused client only has to
wait for the next token (about a second), not for the end of the block, which is
what lets the app's automatic retry actually clear it. Refused requests spend
nothing. Good enough for a single backend instance (this app's current and
near-term deployment target); would need a shared store (Redis, etc.) the
moment there's more than one instance.
"""

import math
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.responses import error_envelope

# Paths that skip the limit entirely -- health checks are meant to be
# polled frequently by uptime monitors, not real client traffic.
_EXEMPT_PATHS = {"/health"}


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self, app, *, max_requests: int, window_seconds: float, enabled: bool = True
    ) -> None:
        super().__init__(app)
        self._capacity = float(max_requests)
        # Tokens added per second.
        self._refill_per_second = max_requests / window_seconds
        self._enabled = enabled
        # {client_key: (tokens_left, time_of_last_refill)}; a client we have not
        # seen starts with a full bucket.
        self._buckets: dict[str, tuple[float, float]] = {}
        # When stale buckets were last swept out (see _prune).
        self._last_prune = time.monotonic()
        self._prune_every_seconds = window_seconds

    def _prune(self, now: float) -> None:
        """Forget clients whose bucket has refilled completely.

        A full bucket is exactly what a client we have never seen starts with, so
        dropping it changes nothing for that client. Without this the dict gains an
        entry for every address that ever called and never shrinks. Runs at most once
        per window, so the cost is a pass over the dict about once a minute.
        """
        if now - self._last_prune < self._prune_every_seconds:
            return
        self._last_prune = now
        self._buckets = {
            key: (tokens, last)
            for key, (tokens, last) in self._buckets.items()
            if tokens + (now - last) * self._refill_per_second < self._capacity
        }

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not self._enabled or request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        client_key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        self._prune(now)
        tokens, last = self._buckets.get(client_key, (self._capacity, now))
        tokens = min(self._capacity, tokens + (now - last) * self._refill_per_second)

        if tokens < 1:
            # Refused: nothing is spent, so retrying cannot dig the hole deeper.
            self._buckets[client_key] = (tokens, now)
            retry_after = max(1, math.ceil((1 - tokens) / self._refill_per_second))
            return JSONResponse(
                status_code=429,
                content=error_envelope(
                    "429", "Too many requests -- slow down and try again"
                ).model_dump(mode="json"),
                headers={"Retry-After": str(retry_after)},
            )

        self._buckets[client_key] = (tokens - 1, now)
        return await call_next(request)

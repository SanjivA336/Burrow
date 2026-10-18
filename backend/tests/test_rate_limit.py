"""The rate limiter, tried on a tiny app of its own.

The real app turns the limiter off under pytest (the whole suite shares one app and
its counters, see main.py), so these tests build a small Starlette app with the
middleware switched on instead.
"""

import time

import pytest
from pydantic import ValidationError
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.rate_limit import RateLimitMiddleware
from app.main import app as real_app


def _client(max_requests: int, window_seconds: float = 60.0) -> TestClient:
    async def ok(_request):
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/api/x", ok), Route("/health", ok)])
    app.add_middleware(
        RateLimitMiddleware, max_requests=max_requests, window_seconds=window_seconds
    )
    return TestClient(app)


def test_requests_up_to_the_limit_pass_and_the_next_is_refused():
    client = _client(max_requests=3)
    assert [client.get("/api/x").status_code for _ in range(3)] == [200, 200, 200]
    refused = client.get("/api/x")
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "429"


def test_a_refusal_says_how_long_to_wait_in_whole_seconds_at_least_one():
    client = _client(max_requests=1)
    client.get("/api/x")
    refused = client.get("/api/x")
    assert refused.status_code == 429
    # One token every 60 seconds here, so the wait is the whole minute at most.
    assert 1 <= int(refused.headers["Retry-After"]) <= 60


def test_at_the_default_rate_a_refused_client_is_told_to_wait_about_a_second():
    # The default is 300 a minute: 5 tokens a second, so the next one is under a second
    # away. Same rate here with a small bucket (2 per 0.4s), which drains before it can
    # refill, unlike 300 real requests that take over a second to send.
    client = _client(max_requests=2, window_seconds=0.4)
    assert client.get("/api/x").status_code == 200
    assert client.get("/api/x").status_code == 200
    refused = client.get("/api/x")
    assert refused.status_code == 429
    assert refused.headers["Retry-After"] == "1"


def test_tokens_come_back_over_time():
    # 2 tokens per 0.2s: one every 0.1s.
    client = _client(max_requests=2, window_seconds=0.2)
    assert client.get("/api/x").status_code == 200
    assert client.get("/api/x").status_code == 200
    assert client.get("/api/x").status_code == 429
    time.sleep(0.25)
    assert client.get("/api/x").status_code == 200


def test_refused_requests_do_not_use_up_tokens():
    # Refills 2 tokens per 0.4s (one per 0.2s). The 20 refused requests below take
    # a few milliseconds, well under 0.2s, so no token comes back by accident.
    client = _client(max_requests=2, window_seconds=0.4)
    client.get("/api/x")
    client.get("/api/x")
    # A client hammering while refused must not push its own recovery further away.
    assert all(client.get("/api/x").status_code == 429 for _ in range(20))
    time.sleep(0.3)
    assert client.get("/api/x").status_code == 200


def test_health_checks_are_never_counted():
    client = _client(max_requests=1)
    assert all(client.get("/health").status_code == 200 for _ in range(5))
    assert client.get("/api/x").status_code == 200


def test_the_default_limit_is_300_a_minute(monkeypatch):
    # Settings reads the environment too; make sure a developer's own override
    # cannot change what the code's default is.
    monkeypatch.delenv("RATE_LIMIT_MAX_REQUESTS", raising=False)
    monkeypatch.delenv("RATE_LIMIT_WINDOW_SECONDS", raising=False)
    defaults = Settings(_env_file=None)
    assert defaults.rate_limit_max_requests == 300
    assert defaults.rate_limit_window_seconds == 60.0


def test_the_real_app_lets_the_browser_read_retry_after():
    # Without this a browser hides the header from the page, and the app would fall
    # back to guessed waits without anything failing.
    origins = get_settings().cors_origin_list
    assert origins
    response = TestClient(real_app).get("/health", headers={"Origin": origins[0]})
    exposed = response.headers.get("access-control-expose-headers", "")
    assert "retry-after" in exposed.lower()


def test_one_client_running_out_does_not_affect_another():
    client_a = _client(max_requests=1)
    assert client_a.get("/api/x").status_code == 200
    assert client_a.get("/api/x").status_code == 429
    # Same app, a different address: its own full bucket.
    client_b = TestClient(client_a.app, client=("203.0.113.9", 50000))
    assert client_b.get("/api/x").status_code == 200


def test_buckets_that_have_fully_refilled_are_forgotten(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr("app.core.rate_limit.time.monotonic", lambda: clock[0])
    middleware = RateLimitMiddleware(None, max_requests=2, window_seconds=10.0)
    middleware._buckets["spent"] = (0.0, clock[0])
    middleware._buckets["partly"] = (1.0, clock[0])
    clock[0] += 4.0  # refills 0.8 tokens: "spent" is at 0.8, "partly" at 1.8, neither full
    middleware._last_prune = 0.0
    middleware._prune(clock[0])
    assert set(middleware._buckets) == {"spent", "partly"}
    clock[0] += 10.0  # both are full by now
    middleware._prune(clock[0])
    assert middleware._buckets == {}


def test_pruning_runs_at_most_once_per_window(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr("app.core.rate_limit.time.monotonic", lambda: clock[0])
    middleware = RateLimitMiddleware(None, max_requests=2, window_seconds=10.0)
    middleware._buckets["idle"] = (2.0, clock[0])  # already full
    clock[0] += 5.0  # half a window since the last sweep
    middleware._prune(clock[0])
    assert "idle" in middleware._buckets
    clock[0] += 5.0
    middleware._prune(clock[0])
    assert "idle" not in middleware._buckets


@pytest.mark.parametrize("field", ["rate_limit_max_requests", "rate_limit_window_seconds"])
def test_a_zero_limit_setting_is_rejected_at_startup(field):
    with pytest.raises(ValidationError, match=field):
        Settings(_env_file=None, **{field: 0})

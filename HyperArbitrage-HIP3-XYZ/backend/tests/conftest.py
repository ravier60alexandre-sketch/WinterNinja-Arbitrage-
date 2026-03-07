import asyncio
import time
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_exchange():
    exchange = AsyncMock()
    exchange.place_order = AsyncMock(return_value={
        "response": {
            "data": {
                "statuses": [{
                    "filled": {
                        "oid": "test_order_123",
                        "avgPx": "100.50",
                        "totalSz": "10.0",
                    }
                }]
            }
        }
    })
    exchange.cancel_order = AsyncMock(return_value=True)
    exchange.market_close = AsyncMock(return_value=True)
    exchange.bulk_orders = AsyncMock()
    return exchange


@pytest.fixture
def mock_hl_info():
    info = MagicMock()
    info.user_fees = MagicMock(return_value={
        "taker": "0.00035",
        "maker": "0.0001",
    })
    info.meta = MagicMock(return_value={
        "universe": [
            {"name": "XYZ", "funding": "0.0001", "markPx": "100.0"},
            {"name": "CASH", "funding": "0.00005", "markPx": "99.5"},
        ]
    })
    return info


@pytest.fixture
def mock_redis():
    with patch("app.core.redis.redis_get", new_callable=AsyncMock) as mock_get, \
         patch("app.core.redis.redis_set", new_callable=AsyncMock) as mock_set, \
         patch("app.core.redis.redis_delete", new_callable=AsyncMock) as mock_del:
        mock_get.return_value = None
        mock_set.return_value = True
        mock_del.return_value = True
        yield {"get": mock_get, "set": mock_set, "delete": mock_del}


@pytest.fixture
def fixed_time():
    with patch("time.perf_counter_ns", return_value=1000000000):
        with patch("time.time", return_value=1700000000.0):
            with patch("time.monotonic", return_value=100.0):
                yield


@pytest.fixture
def mock_fill_queue():
    return asyncio.Queue()

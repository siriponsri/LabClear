from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from fastapi import Request

from config import settings


@dataclass
class _Window:
    started_at: float
    count: int = 0


class LocalRateLimiter:
    """Bound local-demo traffic; use shared infrastructure for multi-instance deployments."""

    def __init__(self) -> None:
        self._windows: dict[str, _Window] = {}
        self._guard = threading.Lock()

    @staticmethod
    def _client_key(request: Request) -> str:
        return request.client.host if request.client and request.client.host else "unknown-client"

    def allow(self, request: Request) -> bool:
        limit = max(0, settings.CHAT_RATE_LIMIT_REQUESTS)
        window_seconds = max(1, settings.CHAT_RATE_LIMIT_WINDOW_SECONDS)
        now = time.monotonic()
        key = self._client_key(request)
        with self._guard:
            current = self._windows.get(key)
            if current is None or now - current.started_at >= window_seconds:
                self._windows[key] = _Window(now, 1)
                return limit > 0
            if current.count >= limit:
                return False
            current.count += 1
            return True

    def clear(self) -> None:
        with self._guard:
            self._windows.clear()


request_rate_limiter = LocalRateLimiter()

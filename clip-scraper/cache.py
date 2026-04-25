"""Cache avec backend pluggable :
- In-memory (par défaut, single instance)
- Redis (multi-instance, partagé entre VPS)

Active Redis avec REDIS_URL=redis://host:port/0 dans .env
"""
import os
import json
import time
import logging
from typing import Any, Optional

log = logging.getLogger("cache")
REDIS_URL = (os.environ.get("REDIS_URL") or "").strip() or None


class Cache:
    """Interface unique. Choisit le backend Redis si REDIS_URL défini, sinon mémoire."""

    def __init__(self, default_ttl: int = 1800):
        self._default_ttl = default_ttl
        self._store: dict[str, tuple[float, Any]] = {}
        self._redis = None
        if REDIS_URL:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(REDIS_URL, decode_responses=True)
                log.info(f"Cache: Redis activé ({REDIS_URL.split('@')[-1] if '@' in REDIS_URL else 'local'})")
            except ImportError:
                log.warning("Cache: redis package non installé, fallback in-memory")
            except Exception as e:
                log.warning(f"Cache: Redis init failed ({e}), fallback in-memory")

    def get(self, key: str) -> Optional[Any]:
        # Sync API for backward compat. Redis async is wrapped by aget below.
        if self._redis:
            return None  # Use aget for Redis
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if time.time() > expires_at:
            self._store.pop(key, None)
            return None
        return value

    async def aget(self, key: str) -> Optional[Any]:
        if self._redis:
            try:
                raw = await self._redis.get(key)
                return json.loads(raw) if raw else None
            except Exception as e:
                log.warning(f"Cache aget error: {e}")
                return None
        return self.get(key)

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        ttl = ttl or self._default_ttl
        if not self._redis:
            self._store[key] = (time.time() + ttl, value)

    async def aset(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        ttl = ttl or self._default_ttl
        if self._redis:
            try:
                await self._redis.setex(key, ttl, json.dumps(value, default=str))
                return
            except Exception as e:
                log.warning(f"Cache aset error: {e}")
        self._store[key] = (time.time() + ttl, value)

    def clear(self) -> None:
        self._store.clear()

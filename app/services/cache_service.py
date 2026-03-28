"""
In-memory TTL cache for gene facts, neighbor lists, and edge evidence.
Keyed per design doc section 15.
"""

from __future__ import annotations

import time
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("cache_service")


class _CacheEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, ttl: int):
        self.value = value
        self.expires_at = time.monotonic() + ttl


class CacheService:
    def __init__(self, ttl_seconds: int | None = None):
        self._ttl = ttl_seconds or settings.cache_ttl_seconds
        self._store: dict[str, _CacheEntry] = {}

    def _key_gene(self, symbol: str, species: str) -> str:
        return f"gene:{symbol.upper()}:{species}"

    def _key_neighbors(self, symbol: str, species: str) -> str:
        return f"neighbors:{symbol.upper()}:{species}"

    def _key_edge(self, source: str, target: str) -> str:
        a, b = sorted([source.upper(), target.upper()])
        return f"edge:{a}:{b}"

    def _key_whatif(self, target: str, perturbation: str, graph_hash: str) -> str:
        return f"whatif:{target}:{perturbation}:{graph_hash}"

    def _key_session_answer(
        self,
        session_id: str,
        action: str,
        target: str,
        prompt: str,
        graph_hash: str = "",
    ) -> str:
        return f"answer:{session_id}:{action}:{target}:{prompt.strip().lower()}:{graph_hash}"

    # ── Generic get/set ───────────────────────────────────────────────────────

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry.expires_at:
            del self._store[key]
            return None
        return entry.value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = _CacheEntry(value, self._ttl)

    # ── Named accessors ───────────────────────────────────────────────────────

    def get_gene(self, symbol: str, species: str) -> Any | None:
        v = self.get(self._key_gene(symbol, species))
        if v:
            log.debug("cache_hit", key_type="gene", symbol=symbol)
        return v

    def set_gene(self, symbol: str, species: str, value: Any) -> None:
        self.set(self._key_gene(symbol, species), value)

    def get_neighbors(self, symbol: str, species: str) -> Any | None:
        v = self.get(self._key_neighbors(symbol, species))
        if v:
            log.debug("cache_hit", key_type="neighbors", symbol=symbol)
        return v

    def set_neighbors(self, symbol: str, species: str, value: Any) -> None:
        self.set(self._key_neighbors(symbol, species), value)

    def get_edge(self, source: str, target: str) -> Any | None:
        return self.get(self._key_edge(source, target))

    def set_edge(self, source: str, target: str, value: Any) -> None:
        self.set(self._key_edge(source, target), value)

    def get_whatif(self, target: str, perturbation: str, graph_hash: str) -> Any | None:
        return self.get(self._key_whatif(target, perturbation, graph_hash))

    def set_whatif(self, target: str, perturbation: str, graph_hash: str, value: Any) -> None:
        self.set(self._key_whatif(target, perturbation, graph_hash), value)

    def get_session_answer(
        self,
        session_id: str,
        action: str,
        target: str,
        prompt: str,
        graph_hash: str = "",
    ) -> Any | None:
        return self.get(
            self._key_session_answer(session_id, action, target, prompt, graph_hash)
        )

    def set_session_answer(
        self,
        session_id: str,
        action: str,
        target: str,
        prompt: str,
        value: Any,
        graph_hash: str = "",
    ) -> None:
        self.set(
            self._key_session_answer(session_id, action, target, prompt, graph_hash),
            value,
        )

    def stats(self) -> dict:
        now = time.monotonic()
        live = sum(1 for e in self._store.values() if e.expires_at > now)
        return {"total_keys": len(self._store), "live_keys": live, "ttl_seconds": self._ttl}


# Singleton — shared across the app lifecycle
cache = CacheService()

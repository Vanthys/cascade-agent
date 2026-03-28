"""
HydraDB client — STUBBED.

HydraDB is not yet wired up. This stub:
- Accepts all the same calls as the real client would
- Logs what it would store/retrieve
- Returns empty context so the rest of the stack works

When you're ready to add the real client, implement the same interface
using the HYDRA_API_KEY / HYDRA_BASE_URL / HYDRA_TENANT_ID from .env.
"""

from __future__ import annotations

from typing import Any

from app.core.logging import get_logger

log = get_logger("hydra_client")


class HydraClient:
    """
    Stub HydraDB client.

    Real interface to implement later:
      POST /tenants/{tenant_id}/sessions/{session_id}/memories  → store memory
      GET  /tenants/{tenant_id}/sessions/{session_id}/context   → retrieve context
    """

    def __init__(self) -> None:
        log.info("hydra_client_stub_active", note="HydraDB is stubbed — no remote calls made")

    async def store_memory(
        self,
        session_id: str,
        memory_type: str,
        content: dict[str, Any],
        tags: list[str] | None = None,
    ) -> None:
        """Store an interaction or finding in HydraDB (stubbed — no-op)."""
        log.debug(
            "hydra_store_memory_stub",
            session_id=session_id,
            memory_type=memory_type,
            content_keys=list(content.keys()),
            tags=tags or [],
        )

    async def retrieve_context(
        self,
        session_id: str,
        query: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Retrieve relevant session memory (stubbed — returns empty list)."""
        log.debug(
            "hydra_retrieve_context_stub",
            session_id=session_id,
            query=query[:80],
            limit=limit,
        )
        return []

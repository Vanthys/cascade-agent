"""
Memory service — thin wrapper around HydraClient.
Stores and retrieves agent session memory.
All methods are safe to call even when HydraDB is stubbed.
"""

from __future__ import annotations

from typing import Any

from app.clients.hydra_client import HydraClient
from app.core.logging import get_logger

log = get_logger("memory_service")


class MemoryService:
    def __init__(self, hydra: HydraClient):
        self._hydra = hydra

    async def store_interaction(
        self,
        session_id: str,
        action: str,
        gene: str | None = None,
        focus: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        content: dict[str, Any] = {"action": action}
        if gene:
            content["gene"] = gene
        if focus:
            content["focus"] = focus
        if extra:
            content.update(extra)

        tags = [f"action:{action}"]
        if gene:
            tags.append(f"gene:{gene.upper()}")

        await self._hydra.store_memory(
            session_id=session_id,
            memory_type="interaction",
            content=content,
            tags=tags,
        )

    async def store_summary(
        self,
        session_id: str,
        gene: str,
        summary: str,
    ) -> None:
        await self._hydra.store_memory(
            session_id=session_id,
            memory_type="generated_summary",
            content={"gene": gene, "summary": summary},
            tags=[f"gene:{gene.upper()}", "type:summary"],
        )

    async def get_context(
        self,
        session_id: str,
        query: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        return await self._hydra.retrieve_context(
            session_id=session_id,
            query=query,
            limit=limit,
        )

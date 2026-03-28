"""
Memory service — thin wrapper around HydraClient.

Maps orchestrator-level concepts (store interaction, store summary, get context)
to the HydraDB user-memory model.

All methods are safe to call when HydraDB is in no-op mode (no API key set).
"""

from __future__ import annotations

from typing import Any

from app.clients.hydra_client import HydraClient
from app.core.logging import get_logger

log = get_logger("memory_service")


class MemoryService:
    def __init__(self, hydra: HydraClient):
        self._hydra = hydra

    # ── Store helpers ──────────────────────────────────────────────────────────

    async def store_interaction(
        self,
        session_id: str,
        action: str,
        gene: str | None = None,
        focus: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        """Record what the agent just did so future context recalls know it."""
        parts = [f"Action: {action}"]
        if gene:
            parts.append(f"Gene: {gene}")
        if focus:
            parts.append(f"Focus: {focus}")
        if extra:
            for k, v in extra.items():
                parts.append(f"{k}: {v}")
        text = " | ".join(parts)

        user_q = f"What was done in session {session_id}?"
        assistant_a = text

        await self._hydra.store_interaction(
            session_id=session_id,
            user_text=user_q,
            assistant_text=assistant_a,
        )

    async def store_summary(
        self,
        session_id: str,
        gene: str,
        summary: str,
    ) -> None:
        """Persist an LLM-generated gene summary as unstructured text memory."""
        text = f"Gene: {gene}\nSummary: {summary}"
        await self._hydra.store_text(session_id=session_id, text=text)

    async def store_exchange(
        self,
        session_id: str,
        user_text: str,
        assistant_text: str,
    ) -> None:
        """Persist an actual user question and the returned answer."""
        await self._hydra.store_interaction(
            session_id=session_id,
            user_text=user_text,
            assistant_text=assistant_text,
        )

    # ── Recall ─────────────────────────────────────────────────────────────────

    async def get_context(
        self,
        session_id: str,
        query: str,
        limit: int = 5,  # kept for interface compat; HydraDB honours max_results internally
    ) -> str:
        """
        Returns a formatted string of recalled memories for injection into
        LLM prompts.  Returns "" when HydraDB is disabled or nothing matches.
        """
        return await self._hydra.get_context(session_id=session_id, query=query)

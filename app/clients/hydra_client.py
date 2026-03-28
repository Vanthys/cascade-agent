"""
HydraDB client — real implementation using the official `hydra-db-python` SDK.

Responsibilities:
  - Retrieve session context before each LLM call (recall_preferences)
  - Store agent interactions as user memories after each response
  - Ensure the tenant exists once on startup (idempotent create)

Graceful degradation:
  - If HYDRADB_API_KEY is not set the client operates as a no-op so the rest
    of the app functions without memory (identical to the old stub).
  - Any runtime error from HydraDB is caught and logged; it never breaks the
    main workflow.

SDK docs: https://docs.hydradb.com/api-reference/sdks
"""

from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("hydra_client")

try:
    from hydra_db import AsyncHydraDB  # type: ignore[import]
    _SDK_AVAILABLE = True
except ImportError:
    _SDK_AVAILABLE = False
    log.warning("hydra_db_sdk_missing", hint="run: uv add hydra-db-python")


class HydraClient:
    """
    Thin async wrapper around AsyncHydraDB.

    tenant    = settings.hydra_tenant_id  (one per app deployment)
    sub-tenant = session_id               (one per user conversation)
    """

    def __init__(self) -> None:
        self._api_key = settings.hydradb_api_key
        self._tenant = settings.hydra_tenant_id
        self._enabled = bool(self._api_key) and _SDK_AVAILABLE
        self._client: "AsyncHydraDB | None" = None

        if self._enabled:
            self._client = AsyncHydraDB(token=self._api_key)
            log.info(
                "hydra_client_ready",
                tenant=self._tenant,
                sdk_version=getattr(AsyncHydraDB, "__version__", "unknown"),
            )
        else:
            reason = "no API key" if not self._api_key else "SDK not installed"
            log.info("hydra_client_noop", reason=reason)

    # ── Startup ───────────────────────────────────────────────────────────────

    async def ensure_tenant(self) -> None:
        """
        Create the top-level tenant if it doesn't exist yet.
        Call once at app startup (idempotent — HydraDB ignores duplicates).
        """
        if not self._enabled or self._client is None:
            return
        try:
            await self._client.tenant.create(tenant_id=self._tenant)
            log.info("hydra_tenant_ensured", tenant=self._tenant)
        except Exception as exc:
            # 409 Conflict is fine — tenant already exists
            log.debug("hydra_tenant_create_skipped", reason=str(exc))

    # ── Context retrieval ─────────────────────────────────────────────────────

    async def get_context(self, session_id: str, query: str) -> str:
        """
        Recall relevant memories for this session and return a formatted
        context string to inject into the LLM prompt.

        Uses recall_preferences (user memory search) scoped to the session's
        sub-tenant so only memories from the same conversation are returned.
        """
        if not self._enabled or self._client is None:
            return ""

        try:
            result = await self._client.recall.recall_preferences(
                query=query,
                tenant_id=self._tenant,
                sub_tenant_id=session_id,
                alpha=0.8,       # 80% semantic, 20% lexical
                recency_bias=0,  # equal weight for all past memories
            )

            chunks = getattr(result, "chunks", None) or []
            if not chunks:
                return ""

            parts = [
                f"- {c.chunk_content}"
                for c in chunks
                if getattr(c, "chunk_content", None)
            ]
            context_str = "\n".join(parts)
            log.debug(
                "hydra_context_retrieved",
                session_id=session_id,
                chunks=len(parts),
            )
            return context_str

        except Exception as exc:
            log.warning("hydra_recall_error", session_id=session_id, error=str(exc))
            return ""

    # ── Memory storage ────────────────────────────────────────────────────────

    async def store_interaction(
        self,
        session_id: str,
        user_text: str,
        assistant_text: str,
    ) -> None:
        """
        Persist a user↔assistant exchange so future calls to get_context can
        surface what this session learned.

        Uses user_assistant_pairs with infer=True so HydraDB extracts
        structured facts automatically.
        """
        if not self._enabled or self._client is None:
            return

        try:
            await self._client.user_memory.add(
                memories=[
                    {
                        "user_assistant_pairs": [
                            {"user": user_text, "assistant": assistant_text}
                        ],
                        "infer": True,
                        "custom_instructions": (
                            "Extract gene names, pathway names, biological relationships, "
                            "disease associations, and research hypotheses discussed."
                        ),
                    }
                ],
                tenant_id=self._tenant,
                sub_tenant_id=session_id,
                upsert=True,
            )
            log.debug("hydra_memory_stored", session_id=session_id)

        except Exception as exc:
            log.warning("hydra_store_error", session_id=session_id, error=str(exc))

    async def store_text(self, session_id: str, text: str) -> None:
        """
        Store a single text blob (e.g. a graph summary) without a paired
        user query.
        """
        if not self._enabled or self._client is None:
            return

        try:
            await self._client.user_memory.add(
                memories=[
                    {
                        "text": text,
                        "infer": True,
                        "custom_instructions": (
                            "Extract key biological entities and relationship insights."
                        ),
                    }
                ],
                tenant_id=self._tenant,
                sub_tenant_id=session_id,
                upsert=True,
            )
            log.debug("hydra_text_stored", session_id=session_id, chars=len(text))

        except Exception as exc:
            log.warning("hydra_store_text_error", session_id=session_id, error=str(exc))

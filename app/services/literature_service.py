"""
Service wrapper for the literature toolkit.
"""

from __future__ import annotations

import httpx

from app.clients.literature_client import LiteratureClient
from app.models.domain import LiteraturePaperDetail, LiteratureSearchResult, LiteratureSource


class LiteratureService:
    def __init__(self, http_client: httpx.AsyncClient):
        self._client = LiteratureClient(http_client)

    async def search(
        self,
        query: str,
        *,
        limit: int = 10,
        include_preprints: bool = True,
        open_access_only: bool = False,
        preprint_days: int = 60,
    ) -> LiteratureSearchResult:
        return await self._client.search(
            query,
            limit=limit,
            include_preprints=include_preprints,
            open_access_only=open_access_only,
            preprint_days=preprint_days,
        )

    async def get_paper_detail(
        self,
        *,
        source: LiteratureSource,
        external_id: str,
        include_full_text: bool = True,
    ) -> LiteraturePaperDetail:
        return await self._client.get_paper_detail(
            source=source,
            external_id=external_id,
            include_full_text=include_full_text,
        )

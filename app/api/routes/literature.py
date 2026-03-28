"""
Literature routes.
POST /literature/search  - search Europe PMC with optional bioRxiv enrichment
POST /literature/paper   - fetch normalized paper detail and full text when available
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.models.api import LiteraturePaperRequest, LiteratureSearchRequest
from app.models.domain import LiteraturePaperDetail, LiteratureSearchResult

router = APIRouter(prefix="/literature", tags=["literature"])


def _get_literature_service(request: Request):
    return request.app.state.literature


@router.post("/search", response_model=LiteratureSearchResult)
async def search_literature(
    body: LiteratureSearchRequest,
    request: Request,
) -> LiteratureSearchResult:
    service = _get_literature_service(request)
    return await service.search(
        body.query,
        limit=body.limit,
        include_preprints=body.include_preprints,
        open_access_only=body.open_access_only,
        preprint_days=body.preprint_days,
    )


@router.post("/paper", response_model=LiteraturePaperDetail)
async def get_paper_detail(
    body: LiteraturePaperRequest,
    request: Request,
) -> LiteraturePaperDetail:
    service = _get_literature_service(request)
    return await service.get_paper_detail(
        source=body.source,
        external_id=body.external_id,
        include_full_text=body.include_full_text,
    )

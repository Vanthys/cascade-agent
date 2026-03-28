"""
What-if route.
POST /whatif — start a what-if perturbation workflow
"""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Request

from app.models.api import WhatIfRequest, WhatIfResponse
from app.models.events import error_event
from app.stream_registry import create_stream

router = APIRouter(prefix="/whatif", tags=["whatif"])


def _get_orchestrator(request: Request):
    return request.app.state.orchestrator


@router.post("", response_model=WhatIfResponse, status_code=202)
async def run_what_if(
    body: WhatIfRequest,
    request: Request,
) -> WhatIfResponse:
    orch = _get_orchestrator(request)
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    queue = create_stream(request_id)

    async def run():
        try:
            async for event in orch.what_if_workflow(
                request_id,
                body.session_id,
                body.target_id,
                body.target_type,
                body.perturbation,
            ):
                await queue.put(event)
        except Exception as exc:
            await queue.put(error_event(str(exc), recoverable=False))
        finally:
            await queue.put(None)

    asyncio.create_task(run())
    return WhatIfResponse(
        request_id=request_id,
        stream_url=f"/stream/{request_id}",
    )

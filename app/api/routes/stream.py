"""
SSE stream route.
GET /stream/{request_id} — consume events from a workflow's queue and send as SSE.

Uses sse-starlette for proper SSE framing.
The stream ends when the workflow puts None (sentinel) into the queue.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.core.exceptions import RequestNotFoundError
from app.stream_registry import get_stream, remove_stream

router = APIRouter(prefix="/stream", tags=["stream"])


@router.get("/{request_id}")
async def stream_events(request_id: str):
    queue = get_stream(request_id)
    if queue is None:
        raise HTTPException(
            status_code=404,
            detail=f"No stream found for request_id '{request_id}'",
        )

    async def event_generator():
        try:
            while True:
                event = await queue.get()
                if event is None:
                    # Sentinel — workflow finished
                    break
                yield {
                    "event": event.event.value,
                    "data": event.data if isinstance(event.data, str) else json.dumps(event.data),
                }
        finally:
            remove_stream(request_id)

    return EventSourceResponse(event_generator())

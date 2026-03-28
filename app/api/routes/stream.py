"""
SSE stream route.
GET /stream/{request_id} — consume events from a workflow's queue and send as SSE.

Uses sse-starlette for proper SSE framing.
The stream ends when the workflow puts None (sentinel) into the queue.
"""

from __future__ import annotations

import json
from datetime import date, datetime

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.stream_registry import get_stream, remove_stream

router = APIRouter(prefix="/stream", tags=["stream"])


class _DatetimeEncoder(json.JSONEncoder):
    """Extend the default encoder to handle datetime / date objects."""

    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)


def _serialise(data) -> str:
    if isinstance(data, str):
        return data
    return json.dumps(data, cls=_DatetimeEncoder)


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
                    break
                yield {
                    "event": event.event.value,
                    "data": _serialise(event.data),
                }
        finally:
            remove_stream(request_id)

    return EventSourceResponse(event_generator())

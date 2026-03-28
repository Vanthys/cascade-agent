"""
In-process stream registry.

When a workflow starts, it creates an asyncio.Queue and registers it here.
The GET /stream/{request_id} endpoint reads from the queue and sends SSE events.
The workflow pushes events as SSEEvent objects; a sentinel None signals end-of-stream.
"""

from __future__ import annotations

import asyncio
from typing import Any

_streams: dict[str, asyncio.Queue] = {}


def create_stream(request_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _streams[request_id] = q
    return q


def get_stream(request_id: str) -> asyncio.Queue | None:
    return _streams.get(request_id)


def remove_stream(request_id: str) -> None:
    _streams.pop(request_id, None)

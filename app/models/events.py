"""
SSE event envelope types.
Each event is serialised to JSON and sent over the /stream/{request_id} endpoint.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class EventType(str, Enum):
    started = "started"
    progress = "progress"
    graph_patch = "graph_patch"
    summary_chunk = "summary_chunk"
    evidence = "evidence"
    completed = "completed"
    error = "error"


class SSEEvent(BaseModel):
    event: EventType
    data: dict[str, Any]


# ── Convenience constructors ─────────────────────────────────────────────────


def started_event(request_id: str, workflow: str) -> SSEEvent:
    return SSEEvent(
        event=EventType.started,
        data={"request_id": request_id, "workflow": workflow},
    )


def progress_event(step: str, status: str, detail: str = "") -> SSEEvent:
    payload: dict[str, Any] = {"step": step, "status": status}
    if detail:
        payload["detail"] = detail
    return SSEEvent(event=EventType.progress, data=payload)


def graph_patch_event(nodes: list, edges: list) -> SSEEvent:
    return SSEEvent(
        event=EventType.graph_patch,
        data={"nodes": nodes, "edges": edges},
    )


def summary_chunk_event(text: str) -> SSEEvent:
    return SSEEvent(event=EventType.summary_chunk, data={"text": text})


def evidence_event(items: list) -> SSEEvent:
    return SSEEvent(event=EventType.evidence, data={"items": items})


def completed_event(graph_id: str, version: int, extra: dict | None = None) -> SSEEvent:
    payload: dict[str, Any] = {"graph_id": graph_id, "version": version}
    if extra:
        payload.update(extra)
    return SSEEvent(event=EventType.completed, data=payload)


def error_event(message: str, recoverable: bool = False) -> SSEEvent:
    return SSEEvent(
        event=EventType.error,
        data={"message": message, "recoverable": recoverable},
    )

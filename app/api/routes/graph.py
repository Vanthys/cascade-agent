"""
Graph routes.
POST /graph/seed        — start seed graph workflow
POST /graph/gene/expand — expand a gene node
POST /graph/edge/explain — explain an edge
GET  /graph/{session_id} — get the latest graph snapshot for a session
"""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session as DBSession

from app.db import get_session
from app.models.api import (
    ExpandGeneRequest,
    ExplainEdgeRequest,
    GraphSnapshotResponse,
    SeedGraphRequest,
    WorkflowAcceptedResponse,
)
from app.models.events import error_event
from app.repositories import graph_repo
from app.stream_registry import create_stream

router = APIRouter(prefix="/graph", tags=["graph"])


def _get_orchestrator(request: Request):
    return request.app.state.orchestrator


@router.post("/seed", response_model=WorkflowAcceptedResponse, status_code=202)
async def seed_graph(
    body: SeedGraphRequest,
    request: Request,
) -> WorkflowAcceptedResponse:
    orch = _get_orchestrator(request)
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    queue = create_stream(request_id)

    async def run():
        try:
            async for event in orch.seed_graph_workflow(
                request_id, body.session_id, body.prompt, body.species
            ):
                await queue.put(event)
        except Exception as exc:
            await queue.put(error_event(str(exc), recoverable=False))
        finally:
            await queue.put(None)  # sentinel — stream done

    asyncio.create_task(run())
    return WorkflowAcceptedResponse(
        request_id=request_id,
        stream_url=f"/stream/{request_id}",
    )


@router.post("/gene/expand", response_model=WorkflowAcceptedResponse, status_code=202)
async def expand_gene(
    body: ExpandGeneRequest,
    request: Request,
) -> WorkflowAcceptedResponse:
    orch = _get_orchestrator(request)
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    queue = create_stream(request_id)

    async def run():
        try:
            async for event in orch.expand_gene_workflow(
                request_id, body.session_id, body.gene_id
            ):
                await queue.put(event)
        except Exception as exc:
            await queue.put(error_event(str(exc), recoverable=False))
        finally:
            await queue.put(None)

    asyncio.create_task(run())
    return WorkflowAcceptedResponse(
        request_id=request_id,
        stream_url=f"/stream/{request_id}",
    )


@router.post("/edge/explain", response_model=WorkflowAcceptedResponse, status_code=202)
async def explain_edge(
    body: ExplainEdgeRequest,
    request: Request,
) -> WorkflowAcceptedResponse:
    orch = _get_orchestrator(request)
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    queue = create_stream(request_id)

    async def run():
        try:
            async for event in orch.expand_edge_workflow(
                request_id, body.session_id, body.edge_id
            ):
                await queue.put(event)
        except Exception as exc:
            await queue.put(error_event(str(exc), recoverable=False))
        finally:
            await queue.put(None)

    asyncio.create_task(run())
    return WorkflowAcceptedResponse(
        request_id=request_id,
        stream_url=f"/stream/{request_id}",
    )


@router.get("/{session_id}", response_model=GraphSnapshotResponse)
def get_graph(
    session_id: str,
    db: DBSession = Depends(get_session),
) -> GraphSnapshotResponse:
    snapshot = graph_repo.get_latest_graph_for_session(db, session_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="No graph found for this session")
    return GraphSnapshotResponse(
        graph_id=snapshot.graph_id,
        session_id=snapshot.session_id,
        version=snapshot.version,
        seed_gene=snapshot.seed_gene,
        nodes=snapshot.nodes,
        edges=snapshot.edges,
        layout=snapshot.layout,
    )

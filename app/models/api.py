"""
API request/response schemas.
Kept separate from domain.py so the public API surface stays stable
even if internal representations change.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.models.domain import (
    ConfidenceLevel,
    EdgeType,
    GeneEdge,
    GeneNode,
    NodeType,
    PerturbationType,
    SessionPreferences,
    WhatIfAnalysis,
)


# ── Sessions ─────────────────────────────────────────────────────────────────


class CreateSessionRequest(BaseModel):
    user_id: str | None = None
    preferences: SessionPreferences = Field(default_factory=SessionPreferences)


class CreateSessionResponse(BaseModel):
    session_id: str


class GetSessionResponse(BaseModel):
    session_id: str
    user_id: str | None
    state: str
    preferences: SessionPreferences


# ── Graph ─────────────────────────────────────────────────────────────────────


class SeedGraphRequest(BaseModel):
    session_id: str
    prompt: str = Field(..., description="Gene symbol or free-text like 'TP53 and cancer'")
    species: str = "human"


class ExpandGeneRequest(BaseModel):
    session_id: str
    gene_id: str = Field(..., description="Node ID like 'gene_TP53'")
    prompt: str | None = Field(None, description="Optional user question")


class ExplainEdgeRequest(BaseModel):
    session_id: str
    edge_id: str = Field(..., description="Edge ID like 'edge_TP53_MDM2'")


class WorkflowAcceptedResponse(BaseModel):
    request_id: str
    stream_url: str


class GraphSnapshotResponse(BaseModel):
    graph_id: str
    session_id: str
    version: int
    seed_gene: str
    nodes: list[GeneNode]
    edges: list[GeneEdge]
    layout: dict[str, Any]


# ── What-if ───────────────────────────────────────────────────────────────────


class WhatIfRequest(BaseModel):
    session_id: str
    target_type: str = Field(..., description="'node' or 'edge'")
    target_id: str
    perturbation: PerturbationType


class WhatIfResponse(BaseModel):
    request_id: str
    stream_url: str

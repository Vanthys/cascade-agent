"""
Domain models — internal representations used throughout services.
These are NOT the API schemas (see models/api.py) and NOT the DB tables
(see repositories/). They are pure Pydantic models for service-layer logic.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────


class EdgeType(str, Enum):
    activates = "activates"
    inhibits = "inhibits"
    binds = "binds"
    coexpressed_with = "coexpressed_with"
    in_pathway_with = "in_pathway_with"
    synthetic_lethal_with = "synthetic_lethal_with"
    associated_with = "associated_with"
    unknown_related = "unknown_related"


class NodeType(str, Enum):
    gene = "gene"
    pathway = "pathway"
    disease = "disease"
    mechanism = "mechanism"


class PerturbationType(str, Enum):
    downregulation = "downregulation"
    upregulation = "upregulation"
    knockout = "knockout"
    overexpression = "overexpression"
    disruption = "disruption"


class ConfidenceLevel(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"
    unknown = "unknown"


# ── Core graph objects ────────────────────────────────────────────────────────


class GeneNode(BaseModel):
    id: str  # e.g. "gene_TP53"
    type: NodeType = NodeType.gene
    label: str  # e.g. "TP53"
    meta: dict[str, Any] = Field(default_factory=dict)
    # meta keys: aliases, summary, organism, pathways, ncbi_id


class GeneEdge(BaseModel):
    id: str  # e.g. "edge_TP53_MDM2"
    source: str  # node id
    target: str  # node id
    relation: EdgeType = EdgeType.unknown_related
    direction: str = "directed"  # "directed" | "undirected"
    confidence: float = 0.0  # 0.0–1.0
    evidence_count: int = 0
    evidence_summary: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    provenance: list[str] = Field(default_factory=list)


class GraphSnapshot(BaseModel):
    graph_id: str
    session_id: str
    version: int = 1
    seed_gene: str
    nodes: list[GeneNode] = Field(default_factory=list)
    edges: list[GeneEdge] = Field(default_factory=list)
    layout: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class GraphPatch(BaseModel):
    """Incremental update to a graph — the frontend applies this on top of existing state."""
    nodes: list[GeneNode] = Field(default_factory=list)
    edges: list[GeneEdge] = Field(default_factory=list)
    removed_node_ids: list[str] = Field(default_factory=list)
    removed_edge_ids: list[str] = Field(default_factory=list)


# ── Research provider output shapes ─────────────────────────────────────────


class GeneRelation(BaseModel):
    gene: str
    relation: EdgeType = EdgeType.unknown_related
    confidence: float = 0.5
    evidence: list[str] = Field(default_factory=list)
    provenance: list[str] = Field(default_factory=list)


class ResearchEvidence(BaseModel):
    id: str
    entity_refs: list[str] = Field(default_factory=list)
    type: str = "interaction_summary"
    source_name: str = ""
    snippet: str = ""
    url: str = ""
    retrieved_at: datetime = Field(default_factory=datetime.utcnow)


class GeneFacts(BaseModel):
    gene: str
    ncbi_id: str | None = None
    aliases: list[str] = Field(default_factory=list)
    summary: str = ""
    pathways: list[str] = Field(default_factory=list)
    neighbors: list[GeneRelation] = Field(default_factory=list)
    sources: list[ResearchEvidence] = Field(default_factory=list)


# ── Session ───────────────────────────────────────────────────────────────────


class SessionPreferences(BaseModel):
    species: str = "human"
    detail_level: str = "medium"


class Session(BaseModel):
    session_id: str
    user_id: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    state: str = "active"
    preferences: SessionPreferences = Field(default_factory=SessionPreferences)


# ── What-if analysis ─────────────────────────────────────────────────────────


class WhatIfAnalysis(BaseModel):
    id: str
    session_id: str
    target_type: str  # "node" | "edge"
    target_id: str
    perturbation: PerturbationType
    question: str = ""
    known_context: list[str] = Field(default_factory=list)
    hypotheses: list[str] = Field(default_factory=list)
    downstream_candidates: list[str] = Field(default_factory=list)
    confidence: ConfidenceLevel = ConfidenceLevel.unknown
    uncertainty_notes: list[str] = Field(default_factory=list)
    references: list[ResearchEvidence] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

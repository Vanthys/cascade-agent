"""
SQLModel database engine, table definitions, and initialization.
All DB tables live here to keep schema in one place.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from sqlmodel import Field, Session, SQLModel, create_engine, select

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # needed for SQLite
    echo=False,
)


def init_db() -> None:
    """Create all tables. Called once at startup."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency that yields a DB session."""
    with Session(engine) as session:
        yield session


# ── Table definitions ─────────────────────────────────────────────────────────


class SessionRecord(SQLModel, table=True):
    __tablename__ = "sessions"

    id: str = Field(primary_key=True)
    user_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    state: str = "active"
    preferences_json: str = Field(default="{}")  # JSON string


class GraphRecord(SQLModel, table=True):
    __tablename__ = "graphs"

    id: str = Field(primary_key=True)
    session_id: str = Field(index=True)
    version: int = 1
    seed_gene: str = ""
    nodes_json: str = Field(default="[]")   # JSON array of GeneNode dicts
    edges_json: str = Field(default="[]")   # JSON array of GeneEdge dicts
    layout_json: str = Field(default="{}")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class EvidenceRecord(SQLModel, table=True):
    __tablename__ = "evidence"

    id: str = Field(primary_key=True)
    entity_refs_json: str = Field(default="[]")  # JSON list of entity IDs
    type: str = "interaction_summary"
    source_name: str = ""
    snippet: str = ""
    url: str = ""
    retrieved_at: datetime = Field(default_factory=datetime.utcnow)


class WhatIfRecord(SQLModel, table=True):
    __tablename__ = "whatif_analyses"

    id: str = Field(primary_key=True)
    session_id: str = Field(index=True)
    target_type: str = ""
    target_id: str = ""
    perturbation: str = ""
    question: str = ""
    known_context_json: str = Field(default="[]")
    hypotheses_json: str = Field(default="[]")
    downstream_candidates_json: str = Field(default="[]")
    confidence: str = "unknown"
    uncertainty_notes_json: str = Field(default="[]")
    created_at: datetime = Field(default_factory=datetime.utcnow)

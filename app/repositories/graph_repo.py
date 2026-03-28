"""
Graph repository — CRUD for GraphRecord + version management.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlmodel import Session, select

from app.db import GraphRecord
from app.models.domain import GeneEdge, GeneNode, GraphSnapshot


def _record_to_domain(record: GraphRecord) -> GraphSnapshot:
    nodes = [GeneNode(**n) for n in json.loads(record.nodes_json or "[]")]
    edges = [GeneEdge(**e) for e in json.loads(record.edges_json or "[]")]
    layout = json.loads(record.layout_json or "{}")
    return GraphSnapshot(
        graph_id=record.id,
        session_id=record.session_id,
        version=record.version,
        seed_gene=record.seed_gene,
        nodes=nodes,
        edges=edges,
        layout=layout,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def save_graph(db: Session, snapshot: GraphSnapshot) -> GraphSnapshot:
    record = db.get(GraphRecord, snapshot.graph_id)
    if record:
        record.version = snapshot.version
        record.nodes_json = json.dumps([n.model_dump() for n in snapshot.nodes])
        record.edges_json = json.dumps([e.model_dump() for e in snapshot.edges])
        record.layout_json = json.dumps(snapshot.layout)
        record.updated_at = datetime.utcnow()
    else:
        record = GraphRecord(
            id=snapshot.graph_id,
            session_id=snapshot.session_id,
            version=snapshot.version,
            seed_gene=snapshot.seed_gene,
            nodes_json=json.dumps([n.model_dump() for n in snapshot.nodes]),
            edges_json=json.dumps([e.model_dump() for e in snapshot.edges]),
            layout_json=json.dumps(snapshot.layout),
        )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _record_to_domain(record)


def get_graph(db: Session, graph_id: str) -> GraphSnapshot | None:
    record = db.get(GraphRecord, graph_id)
    return _record_to_domain(record) if record else None


def get_latest_graph_for_session(db: Session, session_id: str) -> GraphSnapshot | None:
    statement = (
        select(GraphRecord)
        .where(GraphRecord.session_id == session_id)
        .order_by(GraphRecord.updated_at.desc())  # type: ignore[attr-defined]
    )
    record = db.exec(statement).first()
    return _record_to_domain(record) if record else None


def new_graph_id() -> str:
    return f"graph_{uuid.uuid4().hex[:12]}"

"""
Evidence repository — store and retrieve ResearchEvidence records.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlmodel import Session, select

from app.db import EvidenceRecord
from app.models.domain import ResearchEvidence


def _record_to_domain(record: EvidenceRecord) -> ResearchEvidence:
    return ResearchEvidence(
        id=record.id,
        entity_refs=json.loads(record.entity_refs_json or "[]"),
        type=record.type,
        source_name=record.source_name,
        snippet=record.snippet,
        url=record.url,
        retrieved_at=record.retrieved_at,
    )


def save_evidence(db: Session, item: ResearchEvidence) -> ResearchEvidence:
    record = EvidenceRecord(
        id=item.id,
        entity_refs_json=json.dumps(item.entity_refs),
        type=item.type,
        source_name=item.source_name,
        snippet=item.snippet,
        url=item.url,
        retrieved_at=item.retrieved_at,
    )
    db.merge(record)  # upsert
    db.commit()
    return item


def save_evidence_batch(db: Session, items: list[ResearchEvidence]) -> None:
    for item in items:
        save_evidence(db, item)


def get_evidence_for_entities(
    db: Session, entity_refs: list[str]
) -> list[ResearchEvidence]:
    """Return all evidence records that reference any of the given entity IDs."""
    all_records = db.exec(select(EvidenceRecord)).all()
    results = []
    ref_set = set(entity_refs)
    for record in all_records:
        refs = set(json.loads(record.entity_refs_json or "[]"))
        if refs & ref_set:
            results.append(_record_to_domain(record))
    return results


def new_evidence_id() -> str:
    return f"ev_{uuid.uuid4().hex[:10]}"

"""
Session repository — CRUD operations for SessionRecord.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlmodel import Session, select

from app.core.exceptions import SessionNotFoundError
from app.db import SessionRecord
from app.models.domain import Session as SessionDomain, SessionPreferences


def _record_to_domain(record: SessionRecord) -> SessionDomain:
    prefs_dict = json.loads(record.preferences_json or "{}")
    return SessionDomain(
        session_id=record.id,
        user_id=record.user_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
        state=record.state,
        preferences=SessionPreferences(**prefs_dict),
    )


def create_session(
    db: Session,
    user_id: str | None = None,
    preferences: SessionPreferences | None = None,
) -> SessionDomain:
    prefs = preferences or SessionPreferences()
    record = SessionRecord(
        id=f"sess_{uuid.uuid4().hex[:12]}",
        user_id=user_id,
        preferences_json=prefs.model_dump_json(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _record_to_domain(record)


def get_session(db: Session, session_id: str) -> SessionDomain:
    record = db.get(SessionRecord, session_id)
    if not record:
        raise SessionNotFoundError(f"Session '{session_id}' not found")
    return _record_to_domain(record)


def update_session_timestamp(db: Session, session_id: str) -> None:
    record = db.get(SessionRecord, session_id)
    if record:
        record.updated_at = datetime.utcnow()
        db.add(record)
        db.commit()

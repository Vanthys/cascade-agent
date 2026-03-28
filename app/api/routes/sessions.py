"""
Session routes.
POST /sessions  — create a new session
GET  /sessions/{session_id} — get session metadata
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session as DBSession

from app.core.exceptions import SessionNotFoundError
from app.db import get_session
from app.models.api import CreateSessionRequest, CreateSessionResponse, GetSessionResponse
from app.repositories import session_repo

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=CreateSessionResponse, status_code=201)
def create_session(
    body: CreateSessionRequest,
    db: DBSession = Depends(get_session),
) -> CreateSessionResponse:
    session = session_repo.create_session(db, body.user_id, body.preferences)
    return CreateSessionResponse(session_id=session.session_id)


@router.get("/{session_id}", response_model=GetSessionResponse)
def get_session_endpoint(
    session_id: str,
    db: DBSession = Depends(get_session),
) -> GetSessionResponse:
    try:
        session = session_repo.get_session(db, session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return GetSessionResponse(
        session_id=session.session_id,
        user_id=session.user_id,
        state=session.state,
        preferences=session.preferences,
    )

"""
FastAPI application factory.

Wires together:
- All route routers
- Shared HTTP client (httpx.AsyncClient)
- Service singletons on app.state
- DB init on startup
- CORS middleware
- Global exception handler for GeneAgentError
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import graph, sessions, stream, whatif
from app.clients.gmi_client import GMIClient
from app.clients.hydra_client import HydraClient
from app.core.config import settings
from app.core.exceptions import GeneAgentError
from app.core.logging import configure_logging, get_logger
from app.db import init_db
from app.services.graph_service import GraphService
from app.services.hypothesis_service import HypothesisService
from app.services.memory_service import MemoryService
from app.services.orchestrator import Orchestrator
from app.services.research_service import ResearchService

log = get_logger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown: init DB, create shared HTTP client, wire services."""
    configure_logging(settings.log_level)
    log.info("startup", host=settings.host, port=settings.port)

    init_db()
    log.info("database_initialised")

    http_client = httpx.AsyncClient()

    # Wire services
    research = ResearchService(http_client)
    graph_svc = GraphService()
    gmi = GMIClient(http_client)
    hydra = HydraClient()
    memory_svc = MemoryService(hydra)
    hypothesis_svc = HypothesisService(gmi)
    orchestrator = Orchestrator(research, graph_svc, hypothesis_svc, memory_svc, gmi)

    # Store on app state so routes can access via request.app.state
    app.state.http_client = http_client
    app.state.orchestrator = orchestrator

    log.info("services_ready")
    yield

    await http_client.aclose()
    log.info("shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Gene Agent API",
        description="Graph-native gene research + what-if hypothesis backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # tighten for prod
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Global error handler ──────────────────────────────────────────────────
    @app.exception_handler(GeneAgentError)
    async def gene_agent_error_handler(request: Request, exc: GeneAgentError):
        return JSONResponse(
            status_code=502,
            content={"error": exc.message, "recoverable": exc.recoverable},
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(sessions.router)
    app.include_router(graph.router)
    app.include_router(whatif.router)
    app.include_router(stream.router)

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.1.0"}

    return app


app = create_app()

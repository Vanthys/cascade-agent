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
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import graph, literature, sessions, stream, whatif
from app.clients.gmi_client import GMIClient
from app.clients.hydra_client import HydraClient
from app.core.config import settings
from app.core.exceptions import GeneAgentError
from app.core.logging import configure_logging, get_logger
from app.db import init_db
from app.services.graph_service import GraphService
from app.services.hypothesis_service import HypothesisService
from app.services.memory_service import MemoryService
from app.services.literature_service import LiteratureService
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
    literature_svc = LiteratureService(http_client)
    graph_svc = GraphService()
    gmi = GMIClient(http_client)
    hydra = HydraClient()
    await hydra.ensure_tenant()   # idempotent — no-op if key not set
    memory_svc = MemoryService(hydra)
    hypothesis_svc = HypothesisService(gmi)
    orchestrator = Orchestrator(research, graph_svc, hypothesis_svc, memory_svc, gmi)

    # Store on app state so routes can access via request.app.state
    app.state.http_client = http_client
    app.state.orchestrator = orchestrator
    app.state.literature = literature_svc

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

    @app.middleware("http")
    async def commit_modal_volume(request: Request, call_next):
        response = await call_next(request)
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            volume = getattr(request.app.state, "data_volume", None)
            if volume is not None:
                try:
                    volume.commit()
                except Exception:
                    pass
        return response

    # ── Global error handler ──────────────────────────────────────────────────
    @app.exception_handler(GeneAgentError)
    async def gene_agent_error_handler(request: Request, exc: GeneAgentError):
        return JSONResponse(
            status_code=502,
            content={"error": exc.message, "recoverable": exc.recoverable},
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    api_routers = [
        sessions.router,
        graph.router,
        literature.router,
        whatif.router,
        stream.router,
    ]
    for router in api_routers:
        app.include_router(router)
        app.include_router(router, prefix="/api")

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/api/health")
    def api_health():
        return {"status": "ok", "version": "0.1.0"}

    frontend_dist = Path(settings.frontend_dist_dir)
    frontend_root = frontend_dist.resolve()
    index_file = frontend_root / "index.html"
    assets_dir = frontend_root / "assets"

    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    if frontend_root.exists() and index_file.exists():
        @app.get("/{full_path:path}", include_in_schema=False)
        def serve_frontend(full_path: str):
            if not full_path or full_path.startswith(("api/", "docs", "redoc", "openapi.json", "health")):
                return FileResponse(index_file)

            requested = (frontend_root / full_path).resolve()
            if frontend_root in requested.parents and requested.exists() and requested.is_file():
                return FileResponse(requested)
            return FileResponse(index_file)

    return app


app = create_app()

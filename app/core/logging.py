"""
Structured logging configuration using structlog.
Call configure_logging() once at app startup.
Provides get_logger() that returns a logger pre-bound with
request_id and session_id when available.
"""

import logging
import sys

import structlog


def configure_logging(log_level: str = "info") -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer() if sys.stderr.isatty()
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )


def get_logger(name: str = "gene_agent") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


def bind_request_context(request_id: str, session_id: str | None = None) -> None:
    """Bind IDs to the current async context so all log lines carry them."""
    ctx: dict = {"request_id": request_id}
    if session_id:
        ctx["session_id"] = session_id
    structlog.contextvars.bind_contextvars(**ctx)


def clear_request_context() -> None:
    structlog.contextvars.clear_contextvars()

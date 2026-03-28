"""
Custom exception hierarchy for the gene agent backend.
All service-layer errors inherit from GeneAgentError so routes
can catch them in a single handler.
"""


class GeneAgentError(Exception):
    """Base class for all application errors."""

    def __init__(self, message: str, recoverable: bool = False):
        super().__init__(message)
        self.message = message
        self.recoverable = recoverable


class ResearchError(GeneAgentError):
    """Raised when a research provider call fails or returns unusable data."""


class InferenceError(GeneAgentError):
    """Raised when GMI Cloud call fails or returns malformed JSON."""


class MemoryError(GeneAgentError):
    """Raised when HydraDB storage or retrieval fails."""


class GraphBuildError(GeneAgentError):
    """Raised when the graph service cannot assemble a valid graph."""


class SessionNotFoundError(GeneAgentError):
    """Raised when a session_id does not exist in the database."""


class RequestNotFoundError(GeneAgentError):
    """Raised when a request_id has no associated stream."""

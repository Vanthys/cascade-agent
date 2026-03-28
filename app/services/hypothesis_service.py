"""
Hypothesis service — "what if" biological reasoning.

Takes a target gene/edge, a perturbation type, graph context, and evidence.
Builds a strict structured prompt for GMI Cloud.
Explicitly separates known facts from generated hypotheses per design doc section 5.5.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.clients.gmi_client import GMIClient
from app.core.exceptions import InferenceError
from app.core.logging import get_logger
from app.models.domain import (
    ConfidenceLevel,
    PerturbationType,
    ResearchEvidence,
    WhatIfAnalysis,
)

log = get_logger("hypothesis_service")

_CONFIDENCE_MAP = {
    "high": ConfidenceLevel.high,
    "medium": ConfidenceLevel.medium,
    "low": ConfidenceLevel.low,
}


class HypothesisService:
    def __init__(self, gmi: GMIClient):
        self._gmi = gmi

    async def run_what_if(
        self,
        session_id: str,
        target_id: str,
        target_type: str,
        perturbation: PerturbationType,
        graph_context: dict,
        evidence: list[ResearchEvidence],
        session_memory: str = "",  # recalled context from HydraDB
        prompt: str | None = None,
    ) -> WhatIfAnalysis:
        # Resolve gene label from target_id (e.g. "gene_TP53" → "TP53")
        gene_label = target_id.replace("gene_", "").upper()

        evidence_dicts = [
            {
                "source": ev.source_name,
                "snippet": ev.snippet,
                "url": ev.url,
            }
            for ev in evidence[:10]  # cap to limit prompt size
        ]

        log.info(
            "hypothesis_what_if_start",
            target_id=target_id,
            perturbation=perturbation.value,
            evidence_count=len(evidence_dicts),
        )

        try:
            result = await self._gmi.generate_what_if(
                focus_gene=gene_label,
                perturbation=perturbation.value,
                graph_context=graph_context,
                evidence_packets=evidence_dicts,
                user_question=prompt,
            )
        except InferenceError:
            log.warning("hypothesis_inference_failed", target=target_id)
            result = {
                "question": f"What if {gene_label} is {perturbation.value}?",
                "known_context": [],
                "hypotheses": ["Inference unavailable — check GMI Cloud configuration."],
                "downstream_candidates": [],
                "confidence": "low",
                "uncertainty_notes": ["LLM call failed"],
            }

        confidence = _CONFIDENCE_MAP.get(
            str(result.get("confidence", "")).lower(), ConfidenceLevel.unknown
        )

        return WhatIfAnalysis(
            id=f"whatif_{uuid.uuid4().hex[:10]}",
            session_id=session_id,
            target_type=target_type,
            target_id=target_id,
            perturbation=perturbation,
            question=result.get("question", ""),
            known_context=result.get("known_context", []),
            hypotheses=result.get("hypotheses", []),
            downstream_candidates=result.get("downstream_candidates", []),
            confidence=confidence,
            uncertainty_notes=result.get("uncertainty_notes", []),
            references=evidence[:5],
        )

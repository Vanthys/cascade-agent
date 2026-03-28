"""
Orchestrator — the four core workflows.

Each workflow is an async generator that yields SSEEvent objects.
The stream route consumes these and forwards them to the client.

Workflows:
  seed_graph_workflow      — initial gene → graph
  expand_gene_workflow     — click a node → deeper detail
  expand_edge_workflow     — click an edge → explanation
  what_if_workflow         — perturbation hypothesis

Design principles:
  - Parallelise all retrieval steps with asyncio.gather
  - Emit graph_patch BEFORE summary (fast first paint)
  - Emit progress events so the UI shows meaningful steps
  - Persist to DB after streaming starts (never block first paint on DB)
  - Never crash the stream — catch and emit error events
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime

import httpx
from sqlmodel import Session as DBSession

from app.clients.gmi_client import GMIClient
from app.clients.hydra_client import HydraClient
from app.core.exceptions import GeneAgentError
from app.core.logging import get_logger
from app.db import engine
from app.models.domain import PerturbationType
from app.models.events import (
    SSEEvent,
    completed_event,
    error_event,
    evidence_event,
    graph_patch_event,
    progress_event,
    started_event,
    summary_chunk_event,
)
from app.repositories import evidence_repo, graph_repo
from app.services.graph_service import GraphService
from app.services.hypothesis_service import HypothesisService
from app.services.memory_service import MemoryService
from app.services.research_service import ResearchService

log = get_logger("orchestrator")


class Orchestrator:
    def __init__(
        self,
        research: ResearchService,
        graph_svc: GraphService,
        hypothesis_svc: HypothesisService,
        memory_svc: MemoryService,
        gmi: GMIClient,
    ):
        self._research = research
        self._graph = graph_svc
        self._hypothesis = hypothesis_svc
        self._memory = memory_svc
        self._gmi = gmi

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Seed graph workflow
    # ─────────────────────────────────────────────────────────────────────────

    async def seed_graph_workflow(
        self,
        request_id: str,
        session_id: str,
        prompt: str,
        species: str = "human",
    ) -> AsyncGenerator[SSEEvent, None]:
        # Normalise gene symbol from prompt (strip extra words)
        gene = prompt.strip().split()[0].upper()

        yield started_event(request_id, "seed_graph")
        yield progress_event("normalise_prompt", "completed", detail=gene)

        # ── Parallel retrieval ────────────────────────────────────────────────
        yield progress_event("retrieve_context", "running")
        memory_task = asyncio.create_task(
            self._memory.get_context(session_id, f"gene research {gene}")
        )

        yield progress_event("research_seed_gene", "running")
        try:
            facts = await self._research.get_gene_facts(gene, species)
        except GeneAgentError as exc:
            yield error_event(str(exc), recoverable=exc.recoverable)
            return

        yield progress_event("research_seed_gene", "completed")
        yield progress_event("build_graph", "running")

        # ── Build provisional graph and stream it immediately ─────────────────
        snapshot = self._graph.build_seed_graph(session_id, facts)

        node_dicts = [n.model_dump(mode='json') for n in snapshot.nodes]
        edge_dicts = [e.model_dump(mode='json') for e in snapshot.edges]
        yield graph_patch_event(node_dicts, edge_dicts)
        yield progress_event("build_graph", "completed")

        # ── Stream evidence ───────────────────────────────────────────────────
        if facts.sources:
            ev_dicts = [s.model_dump(mode='json') for s in facts.sources]
            yield evidence_event(ev_dicts)

        # ── Generate summary (after graph is already streamed) ────────────────
        yield progress_event("generate_summary", "running")
        try:
            summary_result = await self._gmi.summarise_gene(
                gene=gene,
                facts={
                    "aliases": facts.aliases,
                    "pathways": facts.pathways,
                    "summary": facts.summary,
                },
                graph_context={
                    "neighbors": [
                        {"gene": r.gene, "relation": r.relation.value}
                        for r in facts.neighbors[:10]
                    ]
                },
            )
            summary_text = summary_result.get("summary", facts.summary or "")
        except GeneAgentError:
            summary_text = facts.summary or f"{gene} — summary unavailable"

        yield summary_chunk_event(summary_text)
        yield progress_event("generate_summary", "completed")

        # ── Persist ───────────────────────────────────────────────────────────
        with DBSession(engine) as db:
            saved = graph_repo.save_graph(db, snapshot)
            evidence_repo.save_evidence_batch(db, facts.sources)

        # ── Memory ────────────────────────────────────────────────────────────
        await memory_task  # ensure context fetch completes
        await self._memory.store_interaction(
            session_id, "seed_graph", gene=gene, focus="initial_exploration"
        )
        await self._memory.store_summary(session_id, gene, summary_text)

        yield completed_event(saved.graph_id, saved.version)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Expand gene workflow
    # ─────────────────────────────────────────────────────────────────────────

    async def expand_gene_workflow(
        self,
        request_id: str,
        session_id: str,
        gene_id: str,
    ) -> AsyncGenerator[SSEEvent, None]:
        gene = gene_id.replace("gene_", "").upper()

        yield started_event(request_id, "expand_gene")
        yield progress_event("load_graph", "running")

        with DBSession(engine) as db:
            current = graph_repo.get_latest_graph_for_session(db, session_id)

        if not current:
            yield error_event("No graph found for session", recoverable=False)
            return
        yield progress_event("load_graph", "completed")

        # ── Parallel retrieval ────────────────────────────────────────────────
        yield progress_event("research_gene_deep", "running")
        memory_task = asyncio.create_task(
            self._memory.get_context(session_id, f"expand {gene}")
        )
        try:
            facts = await self._research.get_gene_facts(gene, "human")
        except GeneAgentError as exc:
            yield error_event(str(exc), recoverable=exc.recoverable)
            return
        yield progress_event("research_gene_deep", "completed")

        # ── Compute patch and stream ──────────────────────────────────────────
        yield progress_event("compute_graph_patch", "running")
        patch = self._graph.compute_patch(current, facts)
        updated = self._graph.apply_patch(current, patch)
        yield progress_event("compute_graph_patch", "completed")

        if patch.nodes or patch.edges:
            yield graph_patch_event(
                [n.model_dump(mode='json') for n in patch.nodes],
                [e.model_dump(mode='json') for e in patch.edges],
            )

        # ── Summary ───────────────────────────────────────────────────────────
        yield progress_event("generate_detail_panel", "running")
        try:
            neighbours_ctx = {
                "neighbors": [
                    {"gene": r.gene, "relation": r.relation.value}
                    for r in facts.neighbors[:8]
                ]
            }
            summary_result = await self._gmi.summarise_gene(
                gene=gene,
                facts={"summary": facts.summary, "pathways": facts.pathways},
                graph_context=neighbours_ctx,
            )
            detail_text = summary_result.get("summary", facts.summary or "")
        except GeneAgentError:
            detail_text = facts.summary or f"{gene} detail unavailable"

        yield summary_chunk_event(detail_text)
        yield progress_event("generate_detail_panel", "completed")

        if facts.sources:
            yield evidence_event([s.model_dump(mode='json') for s in facts.sources])

        # ── Persist ───────────────────────────────────────────────────────────
        with DBSession(engine) as db:
            saved = graph_repo.save_graph(db, updated)

        await memory_task
        await self._memory.store_interaction(session_id, "expand_gene", gene=gene)

        yield completed_event(saved.graph_id, saved.version)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Expand edge workflow
    # ─────────────────────────────────────────────────────────────────────────

    async def expand_edge_workflow(
        self,
        request_id: str,
        session_id: str,
        edge_id: str,
    ) -> AsyncGenerator[SSEEvent, None]:
        yield started_event(request_id, "expand_edge")
        yield progress_event("resolve_edge", "running")

        with DBSession(engine) as db:
            current = graph_repo.get_latest_graph_for_session(db, session_id)

        if not current:
            yield error_event("No graph found for session", recoverable=False)
            return

        # Resolve edge from snapshot
        edge = next((e for e in current.edges if e.id == edge_id), None)
        if not edge:
            yield error_event(f"Edge '{edge_id}' not found in graph", recoverable=False)
            return

        source_label = edge.source.replace("gene_", "").upper()
        target_label = edge.target.replace("gene_", "").upper()
        yield progress_event("resolve_edge", "completed")

        # ── Retrieve evidence ─────────────────────────────────────────────────
        yield progress_event("retrieve_edge_evidence", "running")
        try:
            evidence = await self._research.get_edge_evidence(source_label, target_label)
        except GeneAgentError as exc:
            yield error_event(str(exc), recoverable=True)
            evidence = []
        yield progress_event("retrieve_edge_evidence", "completed")

        # ── Generate explanation ──────────────────────────────────────────────
        yield progress_event("explain_edge", "running")
        try:
            explanation = await self._gmi.explain_edge(
                source=source_label,
                target=target_label,
                evidence=[
                    {"source": ev.source_name, "snippet": ev.snippet}
                    for ev in evidence[:5]
                ],
            )
            text = (
                f"{explanation.get('known_mechanism', '')} "
                f"{explanation.get('likely_interpretation', '')}"
            ).strip()
        except GeneAgentError:
            text = f"{source_label}–{target_label}: edge explanation unavailable."

        yield summary_chunk_event(text)
        if evidence:
            yield evidence_event([ev.model_dump(mode='json') for ev in evidence])
        yield progress_event("explain_edge", "completed")

        await self._memory.store_interaction(
            session_id, "expand_edge",
            extra={"edge_id": edge_id, "source": source_label, "target": target_label},
        )

        yield completed_event(current.graph_id, current.version)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. What-if workflow
    # ─────────────────────────────────────────────────────────────────────────

    async def what_if_workflow(
        self,
        request_id: str,
        session_id: str,
        target_id: str,
        target_type: str,
        perturbation: PerturbationType,
    ) -> AsyncGenerator[SSEEvent, None]:
        gene = target_id.replace("gene_", "").upper()

        yield started_event(request_id, "what_if")
        yield progress_event("load_local_subgraph", "running")

        with DBSession(engine) as db:
            current = graph_repo.get_latest_graph_for_session(db, session_id)

        if not current:
            yield error_event("No graph found for session", recoverable=False)
            return

        subgraph = self._graph.get_local_subgraph(
            current, target_id, hops=1
        )
        graph_hash = self._graph.graph_hash(current)
        yield progress_event("load_local_subgraph", "completed")

        # ── Parallel: evidence + memory ───────────────────────────────────────
        yield progress_event("retrieve_evidence", "running")
        evidence_task = asyncio.create_task(
            self._research.get_edge_evidence(gene, gene)  # self-edges = all evidence for gene
        )
        memory_task = asyncio.create_task(
            self._memory.get_context(session_id, f"what if {gene} {perturbation.value}")
        )

        try:
            gene_facts = await self._research.get_gene_facts(gene, "human")
        except GeneAgentError:
            gene_facts = None

        evidence, session_memory = await asyncio.gather(evidence_task, memory_task)

        # Include gene-level sources too
        if gene_facts and gene_facts.sources:
            evidence = gene_facts.sources + evidence

        yield progress_event("retrieve_evidence", "completed")

        # ── Run hypothesis ────────────────────────────────────────────────────
        yield progress_event("generate_hypothesis", "running")
        analysis = await self._hypothesis.run_what_if(
            session_id=session_id,
            target_id=target_id,
            target_type=target_type,
            perturbation=perturbation,
            graph_context=subgraph,
            evidence=evidence,
            session_memory=session_memory,
        )
        yield progress_event("generate_hypothesis", "completed")

        # Stream result as summary chunk + completed
        hypothesis_text = "\n".join(
            [f"[KNOWN] {kc}" for kc in analysis.known_context]
            + [f"[HYPOTHESIS] {h}" for h in analysis.hypotheses]
        )
        yield summary_chunk_event(hypothesis_text)

        if analysis.references:
            yield evidence_event([r.model_dump(mode='json') for r in analysis.references])

        # ── Persist ───────────────────────────────────────────────────────────
        await self._memory.store_interaction(
            session_id,
            "what_if",
            gene=gene,
            extra={
                "perturbation": perturbation.value,
                "confidence": analysis.confidence.value,
            },
        )

        yield completed_event(
            current.graph_id,
            current.version,
            extra={
                "whatif_id": analysis.id,
                "confidence": analysis.confidence.value,
                "downstream_candidates": analysis.downstream_candidates,
            },
        )

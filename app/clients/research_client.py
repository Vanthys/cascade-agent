"""
Research client — MyGene.info + STRING DB providers.

MyGene.info:  gene facts, aliases, pathways, summary (free, no key)
STRING DB:    protein–protein interaction network (free, no key)

The ResearchAggregator merges output from both and normalises provenance.
"""

from __future__ import annotations

import asyncio
import re
from typing import Protocol

import httpx

from app.core.exceptions import ResearchError
from app.core.logging import get_logger
from app.models.domain import (
    EdgeType,
    GeneFacts,
    GeneRelation,
    ResearchEvidence,
)
from app.repositories.evidence_repo import new_evidence_id

log = get_logger("research_client")

MYGENE_BASE = "https://mygene.info/v3"
STRING_BASE = "https://string-db.org/api/json"
# STRING uses NCBI taxonomy IDs; 9606 = human
SPECIES_TO_TAXID: dict[str, str] = {
    "human": "9606",
    "mouse": "10090",
    "rat": "10116",
}


# ── Protocol ─────────────────────────────────────────────────────────────────


class ResearchProvider(Protocol):
    async def get_gene(self, symbol: str, species: str) -> GeneFacts: ...
    async def get_neighbors(self, symbol: str, species: str) -> list[GeneRelation]: ...
    async def get_edge_evidence(self, source: str, target: str) -> list[ResearchEvidence]: ...


# ── MyGene.info provider ──────────────────────────────────────────────────────


class MyGeneProvider:
    """Fetches gene facts from MyGene.info REST API."""

    def __init__(self, client: httpx.AsyncClient):
        self._http = client

    async def get_gene(self, symbol: str, species: str = "human") -> GeneFacts:
        try:
            # Step 1: resolve symbol → entrez ID
            r = await self._http.get(
                f"{MYGENE_BASE}/query",
                params={
                    "q": f"symbol:{symbol}",
                    "species": species,
                    "fields": "entrezgene,symbol,name,summary,pathway.kegg,alias",
                    "size": 1,
                },
                timeout=10.0,
            )
            r.raise_for_status()
            hits = r.json().get("hits", [])
            if not hits:
                return GeneFacts(gene=symbol)

            hit = hits[0]
            ncbi_id = str(hit.get("entrezgene", ""))

            # Step 2: fuller details by entrez ID
            details: dict = {}
            if ncbi_id:
                dr = await self._http.get(
                    f"{MYGENE_BASE}/gene/{ncbi_id}",
                    params={"fields": "symbol,name,summary,pathway.kegg,alias,go"},
                    timeout=10.0,
                )
                dr.raise_for_status()
                details = dr.json()

            aliases = details.get("alias", [])
            if isinstance(aliases, str):
                aliases = [aliases]

            pathways: list[str] = []
            for pw in (details.get("pathway") or {}).get("kegg", []):
                if isinstance(pw, dict):
                    pathways.append(pw.get("name", ""))
                elif isinstance(pw, str):
                    pathways.append(pw)

            evidence = ResearchEvidence(
                id=new_evidence_id(),
                entity_refs=[f"gene_{symbol.upper()}"],
                type="gene_summary",
                source_name="mygene.info",
                snippet=details.get("summary", hit.get("name", ""))[:500],
                url=f"https://mygene.info/v3/gene/{ncbi_id}",
            )

            return GeneFacts(
                gene=symbol.upper(),
                ncbi_id=ncbi_id or None,
                aliases=aliases,
                summary=details.get("summary", hit.get("name", "")),
                pathways=[p for p in pathways if p],
                sources=[evidence],
            )

        except httpx.HTTPError as exc:
            raise ResearchError(f"MyGene.info request failed: {exc}", recoverable=True) from exc

    async def get_neighbors(self, symbol: str, species: str = "human") -> list[GeneRelation]:
        # MyGene doesn't provide interaction data — STRING DB handles this
        return []

    async def get_edge_evidence(self, source: str, target: str) -> list[ResearchEvidence]:
        return []


# ── STRING DB provider ────────────────────────────────────────────────────────

_STRING_SCORE_TO_CONFIDENCE = [
    (900, 0.95),
    (700, 0.75),
    (400, 0.5),
    (0, 0.25),
]


def _score_to_confidence(score: int) -> float:
    for threshold, conf in _STRING_SCORE_TO_CONFIDENCE:
        if score >= threshold:
            return conf
    return 0.2


def _score_to_edge_type(score: int) -> EdgeType:
    if score >= 700:
        return EdgeType.activates
    if score >= 400:
        return EdgeType.associated_with
    return EdgeType.unknown_related


class StringDbProvider:
    """Fetches protein–protein interaction neighbors from STRING DB."""

    def __init__(self, client: httpx.AsyncClient):
        self._http = client

    async def get_gene(self, symbol: str, species: str = "human") -> GeneFacts:
        # STRING doesn't provide gene summaries — MyGene handles this
        return GeneFacts(gene=symbol.upper())

    async def get_neighbors(self, symbol: str, species: str = "human") -> list[GeneRelation]:
        taxid = SPECIES_TO_TAXID.get(species, "9606")
        try:
            r = await self._http.get(
                f"{STRING_BASE}/network",
                params={
                    "identifiers": symbol,
                    "species": taxid,
                    "limit": 20,
                    "caller_identity": "gene_agent_hackathon",
                },
                timeout=15.0,
            )
            r.raise_for_status()
            interactions = r.json()

            neighbors: list[GeneRelation] = []
            seen: set[str] = set()
            for item in interactions:
                partner_a = item.get("preferredName_A", "").upper()
                partner_b = item.get("preferredName_B", "").upper()
                me = symbol.upper()
                partner = partner_b if partner_a == me else partner_a
                if partner == me or partner in seen:
                    continue
                seen.add(partner)
                score = int(item.get("score", 0) * 1000)  # STRING gives 0–1
                neighbors.append(
                    GeneRelation(
                        gene=partner,
                        relation=_score_to_edge_type(score),
                        confidence=_score_to_confidence(score),
                        evidence=[f"STRING combined score: {score}"],
                        provenance=["string-db.org"],
                    )
                )
            return neighbors

        except httpx.HTTPError as exc:
            raise ResearchError(f"STRING DB request failed: {exc}", recoverable=True) from exc

    async def get_edge_evidence(self, source: str, target: str) -> list[ResearchEvidence]:
        taxid = "9606"
        try:
            r = await self._http.get(
                f"{STRING_BASE}/network",
                params={
                    "identifiers": f"{source}%0d{target}",
                    "species": taxid,
                    "caller_identity": "gene_agent_hackathon",
                },
                timeout=10.0,
            )
            r.raise_for_status()
            interactions = r.json()
            evidence = []
            for item in interactions:
                score = item.get("score", 0)
                evidence.append(
                    ResearchEvidence(
                        id=new_evidence_id(),
                        entity_refs=[f"gene_{source.upper()}", f"gene_{target.upper()}"],
                        type="interaction_summary",
                        source_name="string-db.org",
                        snippet=(
                            f"{source}–{target} STRING combined score: "
                            f"{int(score * 1000)}/1000"
                        ),
                        url=(
                            f"https://string-db.org/network/{source}%0D{target}"
                        ),
                    )
                )
            return evidence
        except httpx.HTTPError as exc:
            raise ResearchError(f"STRING DB edge evidence failed: {exc}", recoverable=True) from exc


# ── Aggregator ────────────────────────────────────────────────────────────────


class ResearchAggregator:
    """
    Merges output from multiple providers.
    MyGene handles gene facts; STRING handles neighbors and edge evidence.
    """

    def __init__(self, http_client: httpx.AsyncClient):
        self._mygene = MyGeneProvider(http_client)
        self._string = StringDbProvider(http_client)

    async def get_gene_facts(self, symbol: str, species: str = "human") -> GeneFacts:
        # Run in parallel — mygene for facts, string for neighbors
        facts, neighbors = await asyncio.gather(
            self._mygene.get_gene(symbol, species),
            self._string.get_neighbors(symbol, species),
        )
        facts.neighbors = neighbors
        return facts

    async def get_neighbors(self, symbol: str, species: str = "human") -> list[GeneRelation]:
        return await self._string.get_neighbors(symbol, species)

    async def get_edge_evidence(
        self, source: str, target: str
    ) -> list[ResearchEvidence]:
        return await self._string.get_edge_evidence(source, target)


def make_aggregator(http_client: httpx.AsyncClient) -> ResearchAggregator:
    return ResearchAggregator(http_client)

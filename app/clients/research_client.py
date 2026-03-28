"""
Research client — MyGene.info + STRING DB providers.

MyGene.info:  gene facts, aliases, pathways, summary (free, no key)
STRING DB:    protein–protein interaction network (free, no key)

The ResearchAggregator merges output from both and normalises provenance.
"""

from __future__ import annotations

import asyncio
import copy
import json
import re
from pathlib import Path
from typing import Protocol

import httpx
from cachetools import TTLCache

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
OMNIPATH_BASE = "https://omnipathdb.org"
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


def _score_to_edge_type(
    score: int,
    escore: float = 0.0,
    dscore: float = 0.0,
    ascore: float = 0.0,
) -> EdgeType:
    """
    Map STRING channel scores to an EdgeType.
    STRING does not provide activation/inhibition direction, so we infer
    the most likely interaction category from the evidence channel scores.
      escore = experimental (physical binding assay)
      dscore = curated database / known pathway membership
      ascore = co-expression
    Combined score is used as a tiebreaker for low-channel interactions.
    """
    if escore >= 0.35:
        return EdgeType.binds            # experimental evidence → physical interaction
    if dscore >= 0.5:
        return EdgeType.in_pathway_with  # curated pathway database record
    if ascore >= 0.35:
        return EdgeType.coexpressed_with # co-expression evidence
    if score >= 700:
        return EdgeType.associated_with  # high confidence, channel unclear
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
                    "limit": 8,
                    "caller_identity": "gene_agent_hackathon",
                },
                timeout=15.0,
            )
            r.raise_for_status()
            interactions = r.json()

            me = symbol.upper()

            # Group rows by partner, keeping only rows where `me` is one endpoint.
            # STRING returns the full neighbor-subnetwork (including edges between
            # neighbors), so we must filter to direct interactions only.
            best: dict[str, dict] = {}
            for item in interactions:
                partner_a = item.get("preferredName_A", "").upper()
                partner_b = item.get("preferredName_B", "").upper()
                if partner_a == me:
                    partner = partner_b
                elif partner_b == me:
                    partner = partner_a
                else:
                    continue  # edge between two neighbors — skip
                if not partner or partner == me:
                    continue
                # Keep the row with the highest combined score per partner
                existing = best.get(partner)
                if existing is None or item.get("score", 0) > existing.get("score", 0):
                    best[partner] = item

            neighbors: list[GeneRelation] = []
            for partner, item in best.items():
                score = int(item.get("score", 0) * 1000)  # STRING gives 0–1
                escore = float(item.get("escore", 0))
                dscore = float(item.get("dscore", 0))
                ascore = float(item.get("ascore", 0))
                neighbors.append(
                    GeneRelation(
                        gene=partner,
                        relation=_score_to_edge_type(score, escore, dscore, ascore),
                        confidence=_score_to_confidence(score),
                        evidence=[
                            f"STRING combined score: {score}",
                            f"experimental={escore:.2f}, database={dscore:.2f}, coexpression={ascore:.2f}",
                        ],
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


# ── OmniPath provider ────────────────────────────────────────────────────────


class OmniPathProvider:
    """
    Fetches directed, signed protein interactions from OmniPath.
    Returns a dict keyed by partner gene symbol → EdgeType.
    OmniPath provides consensus_stimulation / consensus_inhibition flags,
    giving us true activates/inhibits classifications that STRING cannot.
    """

    def __init__(self, client: httpx.AsyncClient):
        self._http = client

    def _classify(self, row: dict) -> EdgeType | None:
        """Map OmniPath consensus flags to an EdgeType. Returns None if ambiguous."""
        stim = row.get("consensus_stimulation", False)
        inhib = row.get("consensus_inhibition", False)
        if stim and not inhib:
            return EdgeType.activates
        if inhib and not stim:
            return EdgeType.inhibits
        return None  # conflicting evidence — don't override STRING

    async def get_signed_edges(self, symbol: str) -> dict[str, EdgeType]:
        """
        Return {partner_symbol: EdgeType} for all OmniPath interactions
        where `symbol` is source or target and the edge has unambiguous sign.
        """
        me = symbol.upper()
        try:
            r = await self._http.get(
                f"{OMNIPATH_BASE}/interactions",
                params={
                    "genesymbols": "yes",
                    "sources": symbol,
                    "targets": symbol,
                    "format": "json",
                },
                timeout=15.0,
            )
            r.raise_for_status()
            rows = r.json()
        except httpx.HTTPError as exc:
            log.warning(f"OmniPath request failed for {symbol}: {exc}")
            return {}

        result: dict[str, EdgeType] = {}
        for row in rows:
            src = row.get("source_genesymbol", "").upper()
            tgt = row.get("target_genesymbol", "").upper()
            partner = tgt if src == me else src if tgt == me else None
            if not partner or partner == me:
                continue
            edge_type = self._classify(row)
            if edge_type is not None:
                # Prefer activates/inhibits already set; skip if conflicting
                existing = result.get(partner)
                if existing is None:
                    result[partner] = edge_type
                elif existing != edge_type:
                    result[partner] = EdgeType.associated_with  # conflicting — demote
        return result


# ── Aggregator ────────────────────────────────────────────────────────────────


class ResearchAggregator:
    """
    Merges output from multiple providers.
    MyGene handles gene facts; STRING handles neighbors and edge evidence.
    """

    def __init__(self, http_client: httpx.AsyncClient):
        self._mygene = MyGeneProvider(http_client)
        self._string = StringDbProvider(http_client)
        self._omnipath = OmniPathProvider(http_client)
        self._cache = TTLCache(maxsize=1000, ttl=86400 * 7)  # 7 days cache
        self._cache_path = Path(".research_cache.json")
        self._load_cache()

    def _load_cache(self):
        if not self._cache_path.exists():
            return
        try:
            with open(self._cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for k, v in data.items():
                if k.startswith("facts:"):
                    self._cache[k] = GeneFacts.model_validate(v)
                elif k.startswith("neighbors:"):
                    self._cache[k] = [GeneRelation.model_validate(x) for x in v]
                elif k.startswith("edge:"):
                    self._cache[k] = [ResearchEvidence.model_validate(x) for x in v]
        except Exception as exc:
            log.warning(f"Could not load research cache: {exc}")

    def _save_cache(self):
        try:
            data = {}
            for k, v in self._cache.items():
                if k.startswith("facts:"):
                    data[k] = v.model_dump(mode="json")
                else:
                    data[k] = [x.model_dump(mode="json") for x in v]
            with open(self._cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception as exc:
            log.warning(f"Could not save research cache: {exc}")

    async def get_gene_facts(self, symbol: str, species: str = "human") -> GeneFacts:
        # Run in parallel — mygene for facts, string for neighbors
        # We reuse the cached basics instead of creating redundant calls
        facts, neighbors = await asyncio.gather(
            self.get_basic_facts(symbol, species),
            self.get_neighbors(symbol, species),
        )
        facts.neighbors = neighbors
        return facts

    async def get_basic_facts(self, symbol: str, species: str = "human") -> GeneFacts:
        """Fetch only MyGene facts (no neighbor traversal)."""
        key = f"facts:{symbol}:{species}"
        if key in self._cache:
            return copy.deepcopy(self._cache[key])

        facts = await self._mygene.get_gene(symbol, species)
        self._cache[key] = copy.deepcopy(facts)
        self._save_cache()
        return facts

    async def get_neighbors(self, symbol: str, species: str = "human") -> list[GeneRelation]:
        key = f"neighbors:{symbol}:{species}"
        if key in self._cache:
            return copy.deepcopy(self._cache[key])

        # Fetch STRING interactions and OmniPath signed edges in parallel
        string_neighbors, omnipath_edges = await asyncio.gather(
            self._string.get_neighbors(symbol, species),
            self._omnipath.get_signed_edges(symbol),
        )

        # Overlay OmniPath's signed edge types onto STRING's neighbors.
        # OmniPath takes priority for activates/inhibits; STRING provides
        # binds/coexpressed_with/in_pathway_with/associated_with for the rest.
        neighbors: list[GeneRelation] = []
        for rel in string_neighbors:
            partner = rel.gene.upper()
            omni_type = omnipath_edges.get(partner)
            if omni_type is not None:
                rel = rel.model_copy(update={"relation": omni_type})
            neighbors.append(rel)

        self._cache[key] = copy.deepcopy(neighbors)
        self._save_cache()
        return neighbors

    async def get_edge_evidence(
        self, source: str, target: str
    ) -> list[ResearchEvidence]:
        ordered = tuple(sorted([source, target]))
        key = f"edge:{ordered[0]}:{ordered[1]}"
        if key in self._cache:
            return copy.deepcopy(self._cache[key])

        evidence = await self._string.get_edge_evidence(source, target)
        self._cache[key] = copy.deepcopy(evidence)
        self._save_cache()
        return evidence


def make_aggregator(http_client: httpx.AsyncClient) -> ResearchAggregator:
    return ResearchAggregator(http_client)

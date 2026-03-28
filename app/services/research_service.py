"""
Research service — wraps ResearchAggregator + CacheService.
Normalises output and assigns provenance to every fact.
"""

from __future__ import annotations

import httpx

from app.clients.research_client import ResearchAggregator
from app.core.logging import get_logger
from app.models.domain import GeneFacts, GeneRelation, ResearchEvidence
from app.services.cache_service import cache

log = get_logger("research_service")


class ResearchService:
    def __init__(self, http_client: httpx.AsyncClient):
        self._aggregator = ResearchAggregator(http_client)

    async def get_gene_facts(
        self, symbol: str, species: str = "human"
    ) -> GeneFacts:
        cached = cache.get_gene(symbol, species)
        if cached:
            return cached

        log.info("research_gene_fetch", symbol=symbol, species=species)
        facts = await self._aggregator.get_gene_facts(symbol, species)
        cache.set_gene(symbol, species, facts)
        return facts

    async def get_neighbors(
        self, symbol: str, species: str = "human"
    ) -> list[GeneRelation]:
        cached = cache.get_neighbors(symbol, species)
        if cached:
            return cached

        log.info("research_neighbors_fetch", symbol=symbol, species=species)
        neighbors = await self._aggregator.get_neighbors(symbol, species)
        cache.set_neighbors(symbol, species, neighbors)
        return neighbors

    async def get_edge_evidence(
        self, source: str, target: str
    ) -> list[ResearchEvidence]:
        cached = cache.get_edge(source, target)
        if cached:
            return cached

        log.info("research_edge_evidence_fetch", source=source, target=target)
        evidence = await self._aggregator.get_edge_evidence(source, target)
        cache.set_edge(source, target, evidence)
        return evidence

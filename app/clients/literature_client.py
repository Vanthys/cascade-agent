"""
Literature client for Europe PMC search/detail retrieval with optional bioRxiv
support for recent preprints.
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.exceptions import ResearchError
from app.models.domain import (
    FullTextAvailability,
    LiteratureCitation,
    LiteraturePaper,
    LiteraturePaperDetail,
    LiteratureSearchResult,
    LiteratureSource,
    PaperAuthor,
)

EUROPE_PMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest"
BIORXIV_BASE = "https://api.biorxiv.org"
XML_NAMESPACES = {
    "sec": "http://www.ncbi.nlm.nih.gov/JATS1",
}


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def _tokenize_query(query: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]+", query.lower()) if len(token) > 2}


class LiteratureClient:
    def __init__(self, http_client: httpx.AsyncClient):
        self._http = http_client

    async def search(
        self,
        query: str,
        *,
        limit: int = 10,
        include_preprints: bool = True,
        open_access_only: bool = False,
        preprint_days: int = 60,
    ) -> LiteratureSearchResult:
        europe_pmc_query = query.strip()
        if open_access_only:
            europe_pmc_query = f"({europe_pmc_query}) AND OPEN_ACCESS:y"

        europe_result = await self._search_europe_pmc(europe_pmc_query, limit)
        papers = list(europe_result.papers)
        total_results = europe_result.total_results

        if include_preprints:
            try:
                biorxiv_papers = await self._search_biorxiv_recent(
                    query,
                    limit=max(limit, 10),
                    days=preprint_days,
                )
            except ResearchError:
                biorxiv_papers = []
            existing = {(paper.doi or "", paper.title.lower()) for paper in papers}
            for paper in biorxiv_papers:
                dedupe_key = (paper.doi or "", paper.title.lower())
                if dedupe_key not in existing:
                    papers.append(paper)
                    existing.add(dedupe_key)

        papers.sort(
            key=lambda paper: (
                paper.relevance_score if paper.relevance_score is not None else -math.inf,
                paper.publication_date or "",
            ),
            reverse=True,
        )
        papers = papers[:limit]
        return LiteratureSearchResult(
            query=query,
            papers=papers,
            total_results=max(total_results, len(papers)),
            returned_results=len(papers),
            citations_for_chat=[
                paper.citation.short_label or paper.citation.label
                for paper in papers[:5]
                if paper.citation.short_label or paper.citation.label
            ],
        )

    async def get_paper_detail(
        self,
        *,
        source: LiteratureSource,
        external_id: str,
        include_full_text: bool = True,
    ) -> LiteraturePaperDetail:
        if source == LiteratureSource.europe_pmc:
            return await self._get_europe_pmc_detail(external_id, include_full_text)
        if source == LiteratureSource.biorxiv:
            return await self._get_biorxiv_detail(external_id)
        raise ResearchError(f"Unsupported literature source '{source}'", recoverable=False)

    async def _search_europe_pmc(self, query: str, limit: int) -> LiteratureSearchResult:
        try:
            response = await self._http.get(
                f"{EUROPE_PMC_BASE}/search",
                params={
                    "query": f"{query} sort_date:y",
                    "format": "json",
                    "pageSize": min(limit, 25),
                    "resultType": "core",
                },
                timeout=20.0,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise ResearchError(f"Europe PMC search failed: {exc}", recoverable=True) from exc

        result_list = payload.get("resultList", {}).get("result", [])
        papers = [self._normalize_europe_pmc_result(item) for item in result_list]
        hit_count = int(payload.get("hitCount") or len(papers))
        return LiteratureSearchResult(
            query=query,
            papers=papers,
            total_results=hit_count,
            returned_results=len(papers),
            citations_for_chat=[],
        )

    async def _get_europe_pmc_detail(
        self,
        external_id: str,
        include_full_text: bool,
    ) -> LiteraturePaperDetail:
        source_name, record_id = self._split_external_id(external_id)
        try:
            response = await self._http.get(
                f"{EUROPE_PMC_BASE}/article/{source_name}/{record_id}",
                params={"format": "json", "resultType": "core"},
                timeout=20.0,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise ResearchError(f"Europe PMC detail fetch failed: {exc}", recoverable=True) from exc

        paper = self._normalize_europe_pmc_result(payload)
        full_text = ""
        sections: list[str] = []
        if include_full_text:
            pmcid = paper.pmcid or (record_id if source_name.upper() == "PMC" else None)
            if pmcid:
                full_text, sections = await self._fetch_europe_pmc_full_text(pmcid)

        return LiteraturePaperDetail(
            paper=paper,
            full_text=full_text,
            full_text_sections=sections,
            licensing=payload.get("license"),
            references_count=self._safe_int((payload.get("referenceList") or {}).get("reference")),
        )

    async def _fetch_europe_pmc_full_text(self, pmcid: str) -> tuple[str, list[str]]:
        try:
            response = await self._http.get(
                f"{EUROPE_PMC_BASE}/{pmcid}/fullTextXML",
                timeout=20.0,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return "", []
            raise ResearchError(f"Europe PMC full text fetch failed: {exc}", recoverable=True) from exc
        except httpx.HTTPError as exc:
            raise ResearchError(f"Europe PMC full text fetch failed: {exc}", recoverable=True) from exc

        return self._extract_full_text_from_xml(response.text)

    async def _search_biorxiv_recent(self, query: str, *, limit: int, days: int) -> list[LiteraturePaper]:
        token_set = _tokenize_query(query)
        if not token_set:
            return []

        interval = f"{days}d"
        try:
            response = await self._http.get(
                f"{BIORXIV_BASE}/details/biorxiv/{interval}/0/json",
                timeout=20.0,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise ResearchError(f"bioRxiv fetch failed: {exc}", recoverable=True) from exc

        candidates = payload.get("collection", [])
        ranked: list[tuple[float, LiteraturePaper]] = []
        for item in candidates:
            paper = self._normalize_biorxiv_result(item)
            haystack = f"{paper.title} {paper.abstract}".lower()
            matches = sum(1 for token in token_set if token in haystack)
            if matches == 0:
                continue
            recency_bonus = self._recency_score(paper.publication_date)
            paper.relevance_score = float(matches) + recency_bonus
            ranked.append((paper.relevance_score, paper))

        ranked.sort(key=lambda pair: pair[0], reverse=True)
        return [paper for _, paper in ranked[:limit]]

    async def _get_biorxiv_detail(self, external_id: str) -> LiteraturePaperDetail:
        doi = external_id.removeprefix("bioRxiv:")
        try:
            response = await self._http.get(
                f"{BIORXIV_BASE}/details/biorxiv/{doi}/na/json",
                timeout=20.0,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise ResearchError(f"bioRxiv detail fetch failed: {exc}", recoverable=True) from exc

        items = payload.get("collection", [])
        if not items:
            raise ResearchError(f"bioRxiv record '{doi}' not found", recoverable=False)
        paper = self._normalize_biorxiv_result(items[0])
        return LiteraturePaperDetail(
            paper=paper,
            full_text="",
            full_text_sections=[],
            licensing=None,
            references_count=None,
        )

    def _normalize_europe_pmc_result(self, item: dict[str, Any]) -> LiteraturePaper:
        source_name = (item.get("source") or "MED").upper()
        external_id = f"{source_name}:{item.get('id')}"
        title = _clean_text(item.get("title"))
        abstract = _clean_text(item.get("abstractText"))
        author_names = self._extract_europe_pmc_authors(item)
        publication_date = item.get("firstPublicationDate") or item.get("pubYear")
        doi = item.get("doi")
        pmid = item.get("pmid")
        pmcid = item.get("pmcid")
        open_access = (item.get("isOpenAccess") == "Y") or bool(pmcid)
        full_text_availability = (
            FullTextAvailability.open_access_xml
            if pmcid and open_access
            else FullTextAvailability.free
            if item.get("hasPDF") == "Y" or item.get("hasBook") == "Y"
            else FullTextAvailability.none
        )
        source_url = f"https://europepmc.org/article/{source_name}/{item.get('id')}"
        citation = self._build_citation(
            title=title,
            authors=author_names,
            publication_date=publication_date,
            journal=_clean_text(item.get("journalTitle")),
            doi=doi,
            url=source_url,
        )
        keywords = self._extract_keywords(item)

        return LiteraturePaper(
            paper_id=external_id,
            source=LiteratureSource.europe_pmc,
            external_id=external_id,
            title=title,
            abstract=abstract,
            authors=[PaperAuthor(full_name=name) for name in author_names],
            journal=_clean_text(item.get("journalTitle")),
            publication_date=publication_date,
            doi=doi,
            pmid=pmid,
            pmcid=pmcid,
            is_preprint=item.get("pubType") == "preprint" or item.get("source") == "PPR",
            full_text_availability=full_text_availability,
            full_text_url=source_url if full_text_availability != FullTextAvailability.none else None,
            cited_by_count=self._safe_int(item.get("citedByCount")),
            keywords=keywords,
            citation=citation,
            source_url=source_url,
            relevance_score=self._recency_score(publication_date),
        )

    def _normalize_biorxiv_result(self, item: dict[str, Any]) -> LiteraturePaper:
        title = _clean_text(item.get("title"))
        abstract = _clean_text(item.get("abstract"))
        doi = item.get("doi")
        publication_date = item.get("date")
        authors = [
            PaperAuthor(full_name=_clean_text(name))
            for name in re.split(r";\s*", item.get("authors", ""))
            if _clean_text(name)
        ]
        source_url = f"https://www.biorxiv.org/content/{doi}v1"
        citation = self._build_citation(
            title=title,
            authors=[author.full_name for author in authors],
            publication_date=publication_date,
            journal="bioRxiv",
            doi=doi,
            url=source_url,
        )
        return LiteraturePaper(
            paper_id=f"bioRxiv:{doi}",
            source=LiteratureSource.biorxiv,
            external_id=f"bioRxiv:{doi}",
            title=title,
            abstract=abstract,
            authors=authors,
            journal="bioRxiv",
            publication_date=publication_date,
            doi=doi,
            is_preprint=True,
            full_text_availability=FullTextAvailability.free,
            full_text_url=source_url,
            cited_by_count=None,
            keywords=[],
            citation=citation,
            source_url=source_url,
            relevance_score=self._recency_score(publication_date),
        )

    def _extract_europe_pmc_authors(self, item: dict[str, Any]) -> list[str]:
        author_list = item.get("authorList", {}).get("author", [])
        authors: list[str] = []
        for author in author_list:
            if isinstance(author, dict):
                full_name = _clean_text(author.get("fullName") or author.get("lastName"))
            else:
                full_name = _clean_text(str(author))
            if full_name:
                authors.append(full_name)
        if authors:
            return authors
        author_string = _clean_text(item.get("authorString"))
        if not author_string:
            return []
        return [segment.strip().rstrip(",") for segment in author_string.split(",") if segment.strip()]

    def _extract_keywords(self, item: dict[str, Any]) -> list[str]:
        mesh_list = item.get("meshHeadingList", {}).get("meshHeading", [])
        keywords: list[str] = []
        for mesh in mesh_list[:8]:
            term = mesh.get("descriptorName") if isinstance(mesh, dict) else None
            cleaned = _clean_text(term)
            if cleaned:
                keywords.append(cleaned)
        return keywords

    def _build_citation(
        self,
        *,
        title: str,
        authors: list[str],
        publication_date: str | None,
        journal: str,
        doi: str | None,
        url: str,
    ) -> LiteratureCitation:
        year = publication_date[:4] if publication_date else "n.d."
        lead_author = authors[0] if authors else "Unknown author"
        short_label = f"{lead_author.split()[-1]} et al., {year}"
        bibliography = f"{'; '.join(authors[:6])}. {title}. {journal}. {year}."
        label = f"{short_label}. {title}"
        return LiteratureCitation(
            label=label.strip(),
            short_label=short_label.strip(),
            bibliography=_clean_text(bibliography),
            doi=doi,
            url=url,
        )

    def _extract_full_text_from_xml(self, xml_text: str) -> tuple[str, list[str]]:
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return "", []

        def local_name(tag: str) -> str:
            return tag.split("}", 1)[-1]

        def text_content(node: ET.Element) -> str:
            return _clean_text("".join(node.itertext()))

        sections: list[str] = []
        for sec in root.iter():
            if local_name(sec.tag) != "sec":
                continue
            title = ""
            paragraphs: list[str] = []
            for child in sec.iter():
                child_name = local_name(child.tag)
                if child_name == "title" and not title:
                    title = text_content(child)
                elif child_name == "p":
                    paragraph = text_content(child)
                    if paragraph:
                        paragraphs.append(paragraph)
            body = " ".join(chunk for chunk in paragraphs if chunk)
            if title and body:
                sections.append(f"{title}: {body}")
            elif body:
                sections.append(body)

        if not sections:
            paragraphs = [
                text_content(node)
                for node in root.iter()
                if local_name(node.tag) == "p"
            ]
            sections = [chunk for chunk in paragraphs if chunk]

        joined = "\n\n".join(sections[:12])
        return joined[:20000], sections[:12]

    def _split_external_id(self, external_id: str) -> tuple[str, str]:
        if ":" not in external_id:
            raise ResearchError(
                "Europe PMC papers must use external_id like 'PMC:PMC123456'",
                recoverable=False,
            )
        source_name, record_id = external_id.split(":", 1)
        return source_name, record_id

    def _recency_score(self, publication_date: str | None) -> float:
        if not publication_date:
            return 0.0
        try:
            date = datetime.fromisoformat(publication_date[:10]).replace(tzinfo=UTC)
        except ValueError:
            try:
                date = datetime.fromisoformat(f"{publication_date[:4]}-01-01").replace(tzinfo=UTC)
            except ValueError:
                return 0.0
        age_days = max((datetime.now(UTC) - date).days, 0)
        return max(0.0, 2.0 - min(age_days / 365.0, 2.0))

    def _safe_int(self, value: Any) -> int | None:
        if value is None:
            return None
        if isinstance(value, list):
            return len(value)
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

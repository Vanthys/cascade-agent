from fastapi.testclient import TestClient

from app.main import create_app
from app.models.domain import (
    FullTextAvailability,
    LiteratureCitation,
    LiteraturePaper,
    LiteraturePaperDetail,
    LiteratureSearchResult,
    LiteratureSource,
)


class StubLiteratureService:
    async def search(self, query, **kwargs):
        paper = LiteraturePaper(
            paper_id="MED:1",
            source=LiteratureSource.europe_pmc,
            external_id="MED:1",
            title="Paper title",
            abstract="Abstract",
            full_text_availability=FullTextAvailability.none,
            citation=LiteratureCitation(short_label="Doe et al., 2026"),
            source_url="https://europepmc.org/article/MED/1",
        )
        return LiteratureSearchResult(
            query=query,
            papers=[paper],
            total_results=1,
            returned_results=1,
            citations_for_chat=["Doe et al., 2026"],
        )

    async def get_paper_detail(self, **kwargs):
        paper = LiteraturePaper(
            paper_id="MED:1",
            source=LiteratureSource.europe_pmc,
            external_id="MED:1",
            title="Paper title",
            abstract="Abstract",
            full_text_availability=FullTextAvailability.none,
            citation=LiteratureCitation(short_label="Doe et al., 2026"),
            source_url="https://europepmc.org/article/MED/1",
        )
        return LiteraturePaperDetail(paper=paper, full_text="")


def test_search_literature_route_returns_normalized_payload():
    app = create_app()
    with TestClient(app) as client:
        app.state.literature = StubLiteratureService()
        response = client.post("/literature/search", json={"query": "crispr resistance"})

        assert response.status_code == 200
        payload = response.json()
        assert payload["citations_for_chat"] == ["Doe et al., 2026"]
        assert payload["papers"][0]["source"] == "europe_pmc"


def test_get_paper_detail_route_returns_detail():
    app = create_app()
    with TestClient(app) as client:
        app.state.literature = StubLiteratureService()
        response = client.post(
            "/literature/paper",
            json={"source": "europe_pmc", "external_id": "MED:1", "include_full_text": False},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["paper"]["external_id"] == "MED:1"

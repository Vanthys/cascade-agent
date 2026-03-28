from app.clients.literature_client import LiteratureClient
from app.models.domain import FullTextAvailability, LiteratureSource


def test_normalize_europe_pmc_result_builds_citation():
    client = LiteratureClient(None)
    item = {
        "id": "12345",
        "source": "MED",
        "title": "CRISPR screens identify resistance pathways",
        "abstractText": "A concise abstract.",
        "authorList": {"author": [{"fullName": "Jane Doe"}, {"fullName": "John Smith"}]},
        "journalTitle": "Nature Genetics",
        "firstPublicationDate": "2025-02-10",
        "doi": "10.1000/test",
        "pmid": "12345",
        "pmcid": "PMC999",
        "isOpenAccess": "Y",
        "citedByCount": 12,
        "meshHeadingList": {"meshHeading": [{"descriptorName": "CRISPR-Cas Systems"}]},
    }

    paper = client._normalize_europe_pmc_result(item)

    assert paper.source == LiteratureSource.europe_pmc
    assert paper.full_text_availability == FullTextAvailability.open_access_xml
    assert paper.citation.short_label == "Doe et al., 2025"
    assert paper.keywords == ["CRISPR-Cas Systems"]
    assert paper.source_url.endswith("/article/MED/12345")


def test_extract_full_text_from_xml_returns_sections():
    client = LiteratureClient(None)
    xml_text = """
    <article>
      <body>
        <sec>
          <title>Introduction</title>
          <p>First paragraph.</p>
          <p>Second paragraph.</p>
        </sec>
      </body>
    </article>
    """

    full_text, sections = client._extract_full_text_from_xml(xml_text)

    assert "Introduction: First paragraph. Second paragraph." in full_text
    assert sections == ["Introduction: First paragraph. Second paragraph."]

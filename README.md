# Gene Agent

Backend for a graph-native gene research workflow plus a literature-aware
research toolkit.

## Literature API

`POST /literature/search`

Searches Europe PMC and optionally augments results with recent bioRxiv
preprints. Returns normalized papers, abstracts, citation labels for chat, and
full-text availability metadata.

`POST /literature/paper`

Fetches a normalized paper detail payload. Europe PMC records return full text
when an Open Access XML version is available.

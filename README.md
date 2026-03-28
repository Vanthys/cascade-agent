# Gene Agent

Gene Agent is a graph-native research assistant for gene exploration.

It combines:

- a FastAPI backend for gene research, literature search, graph workflows, and what-if analysis
- a React frontend for graph interaction and panel-based command workflows
- literature retrieval from Europe PMC, with optional recent bioRxiv enrichment
- session memory and synthesis hooks for longer-running agent behavior

The product shape is:

- start with a seed gene
- build a local interaction graph
- inspect nodes and edges
- run panel commands like `/add`, `/lit`, and `/whatif`
- retrieve fresh literature with citations and links

## What This App Does

For a seed gene such as `TP53`, the app can:

- fetch basic gene facts and aliases
- retrieve likely interaction partners
- build an interactive graph
- explain selected edges
- run hypothesis-style perturbation analysis
- search recent literature from within the panel

This is a research tool, not a clinical system. Outputs should be treated as exploratory and evidence-backed only where explicitly cited.

## Architecture

High-level pieces:

- `app/`: FastAPI backend and service layer
- `web/`: React + Vite frontend
- `modal_app.py`: Modal deployment entrypoint
- `scripts/`: local utility scripts, including deploy automation

Important backend services:

- `ResearchService`: gene facts, neighbors, edge evidence
- `LiteratureService`: Europe PMC search and paper detail retrieval
- `GraphService`: graph construction and incremental patching
- `HypothesisService`: what-if style reasoning
- `MemoryService`: session context and retrieval hooks
- `Orchestrator`: multi-step workflows and SSE event streaming

## Repo Layout

```text
app/
  api/routes/           FastAPI routes
  clients/              API clients for research, literature, memory, inference
  services/             orchestration and domain logic
  models/               domain and API schemas
  repositories/         persistence helpers
web/
  src/components/       React UI components
  src/api/client.js     frontend API client
scripts/
  deploy_modal.ps1      one-command Modal deployment script
modal_app.py            Modal ASGI deployment entrypoint
```

## Requirements

Recommended local environment:

- Python 3.13+
- Node.js 20+
- `uv`
- npm

## Environment Variables

See `.env.example` for a template.

Key values:

- `GMI_API_KEY`: inference provider key
- `GMI_BASE_URL`
- `GMI_FAST_MODEL`
- `GMI_STRONG_MODEL`
- `HYDRADB_API_KEY`
- `HYDRA_BASE_URL`
- `HYDRA_TENANT_ID`
- `DATABASE_URL`
- `CACHE_TTL_SECONDS`
- `LOG_LEVEL`

Additional deploy-time settings now supported:

- `RESEARCH_CACHE_PATH`
- `FRONTEND_DIST_DIR`
- `DATA_DIR`

## Local Setup

### Backend

Install Python dependencies:

```bash
uv sync
```

Run the backend locally:

```bash
uv run python main.py
```

By default the API runs on `http://127.0.0.1:8000`.

### Frontend

From the `web/` directory:

```bash
npm install
npm run dev
```

The Vite dev server proxies `/api/*` requests to `http://127.0.0.1:8000`.

## Running The App

### Local Development

1. Start the backend:

```bash
uv run python main.py
```

2. Start the frontend:

```bash
cd web
npm run dev
```

3. Open the Vite URL shown in the terminal.

### Production-Style Local Frontend Build

```bash
cd web
npm run build
```

This generates `web/dist`, which can be bundled into the Modal deploy.

## UI Workflow

### Main Flow

1. Enter a gene symbol in the landing input.
2. Wait for the backend to research the seed gene and stream graph updates.
3. Click a node or edge to inspect details in the right-side panel.
4. Use panel commands to expand the graph, search literature, or run hypotheses.

### Panel Commands

The right-side info panel supports command-style input.

#### `/help`

Shows a quick command reference in the panel.

#### `/add GENE`

Adds a new gene to the current graph.

Behavior:

- fetches gene facts for the requested gene
- fetches its neighbors
- merges new nodes and edges into the existing graph
- focuses the panel on the added gene

Example:

```text
/add EGFR
```

#### `/lit QUERY`

Runs a literature search from the panel using Europe PMC as the primary source.

Behavior:

- searches Europe PMC
- optionally includes recent bioRxiv preprints
- returns normalized paper cards as markdown in the panel
- includes citation labels, links, DOI, and full-text availability

Example:

```text
/lit KRAS resistance colorectal cancer
```

#### `/lit`

Uses the currently selected node or edge as the literature context.

Example:

- if `TP53` is selected, `/lit` searches for `TP53`
- if an interaction is selected, it searches using the two connected labels

#### `/expand QUESTION`

Expands the currently selected node with additional graph context and a focused follow-up request.

Example:

```text
/expand What pathways is TP53 most associated with?
```

#### `/whatif ...`

Runs perturbation-style reasoning for the selected node.

Examples:

```text
/whatif downregulate
/whatif knockout
/whatif overexpression
```

#### Plain Text

If you type normal text on a selected gene, the panel treats it as a follow-up question and uses the expand workflow.

Example:

```text
Which downstream pathways look most relevant here?
```

### What-If Tab

The dedicated What-if tab supports:

- selecting a node from the graph
- choosing a perturbation type
- running a structured hypothesis workflow

This is separate from the panel command flow, but overlaps conceptually with `/whatif`.

## Backend API

The app serves routes at both root and `/api/*`.

Examples:

- `/health` and `/api/health`
- `/graph/seed` and `/api/graph/seed`
- `/literature/search` and `/api/literature/search`

This keeps the same frontend working both:

- locally behind Vite proxy
- in Modal when frontend and backend are served from one origin

### Health

`GET /health`

Returns:

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### Sessions

`POST /sessions`

Creates a new session.

Example response:

```json
{
  "session_id": "sess_123"
}
```

### Graph Workflows

#### `POST /graph/seed`

Starts the seed graph workflow.

Request:

```json
{
  "session_id": "sess_123",
  "prompt": "TP53",
  "species": "human"
}
```

Response:

```json
{
  "request_id": "req_abc",
  "stream_url": "/stream/req_abc"
}
```

#### `POST /graph/gene/expand`

Expands a gene already in or being added to the graph.

Request:

```json
{
  "session_id": "sess_123",
  "gene_id": "gene_TP53",
  "prompt": "What pathways is this involved in?"
}
```

#### `POST /graph/edge/explain`

Explains a selected edge.

Request:

```json
{
  "session_id": "sess_123",
  "edge_id": "edge_TP53_MDM2_associated_with"
}
```

#### `GET /graph/{session_id}`

Returns the latest graph snapshot for a session.

### What-If

`POST /whatif`

Request:

```json
{
  "session_id": "sess_123",
  "target_type": "node",
  "target_id": "gene_TP53",
  "perturbation": "downregulation",
  "prompt": "What if TP53 is downregulated?"
}
```

### Literature API

#### `POST /literature/search`

Searches Europe PMC and optionally recent bioRxiv preprints.

Request:

```json
{
  "query": "CRISPR resistance melanoma",
  "limit": 10,
  "include_preprints": true,
  "open_access_only": false,
  "preprint_days": 60
}
```

Returns a normalized `LiteratureSearchResult` with:

- `papers`
- `total_results`
- `returned_results`
- `citations_for_chat`

Each paper includes fields such as:

- `source`
- `external_id`
- `title`
- `abstract`
- `authors`
- `publication_date`
- `doi`
- `pmid`
- `pmcid`
- `full_text_availability`
- `citation`
- `source_url`

#### `POST /literature/paper`

Fetches a normalized paper detail payload and full text when available.

Request:

```json
{
  "source": "europe_pmc",
  "external_id": "PMC:PMC1234567",
  "include_full_text": true
}
```

Europe PMC records can return full text when Open Access XML is available.

### SSE Stream

`GET /stream/{request_id}`

Consumes workflow events.

Event types:

- `started`
- `progress`
- `graph_patch`
- `summary_chunk`
- `hypothesis`
- `evidence`
- `completed`
- `error`

This is how the frontend gets progressive graph and summary updates.

## Frontend API Helpers

The frontend helper module lives in:

- `web/src/api/client.js`

Available helpers include:

- `createSession`
- `seedGraph`
- `expandGene`
- `explainEdge`
- `runWhatIf`
- `searchLiterature`
- `getPaperDetail`
- `connectStream`

## Literature Behavior

The literature client uses:

- Europe PMC as the primary search source
- optional bioRxiv support for recent preprints

The normalized result model is designed so the chat or panel can cite results directly without provider-specific formatting.

Useful fields for UI rendering:

- `citation.short_label`
- `citation.label`
- `citation.url`
- `source_url`
- `full_text_availability`

## Modal Deployment

This repo includes [modal_app.py](./modal_app.py) for deploying the backend as an ASGI app on Modal.

### Current Deployment Model

The deployed app:

- serves the FastAPI backend
- can serve the built frontend from `web/dist`
- mounts a persistent Modal Volume at `/data`
- uses a Modal Secret named `gene-agent`

### Important Current Constraint

The SSE stream registry is currently in-memory. To keep `/stream/{request_id}` working on Modal, the app is pinned to a single live container.

That is acceptable for a hackathon deployment, but not the long-term scaling model.

### Manual Deploy

1. Build the frontend:

```bash
cd web
npm install
npm run build
cd ..
```

2. Refresh the Modal secret from `.env`:

```bash
uv run modal secret create gene-agent --from-dotenv .env --force
```

3. Deploy:

```bash
uv run modal deploy modal_app.py
```

### One-Command Deploy Script

There is a PowerShell deploy script at:

- [scripts/deploy_modal.ps1](./scripts/deploy_modal.ps1)

Run it from the repo root:

```powershell
.\scripts\deploy_modal.ps1
```

It will:

- run `npm install`
- run `npm run build`
- refresh the Modal secret from `.env`
- deploy `modal_app.py`

Optional parameters:

```powershell
.\scripts\deploy_modal.ps1 -SecretName gene-agent -ModalFile modal_app.py
```

### Modal Storage

The Modal app mounts a persistent Volume named `gene-agent-data` at `/data`.

It stores:

- SQLite database at `/data/gene_agent.db`
- research cache at `/data/.research_cache.json`

### Modal Secret

Secret name:

- `gene-agent`

The current deploy flow loads values from `.env`.

### Modal CLI Checks

Useful commands:

```bash
uv run modal profile current
uv run modal secret list
uv run modal app list
```

## Testing

Backend tests can be run with:

```bash
.\.venv\Scripts\python.exe -m pytest
```

Targeted literature tests:

```bash
.\.venv\Scripts\python.exe -m pytest tests/test_literature_client.py tests/test_literature_routes.py
```

Frontend build check:

```bash
cd web
npm run build
```

## Known Limitations

- SSE stream state is still in-memory
- Modal deployment is intentionally pinned to one live container because of that
- SQLite on a Modal Volume is acceptable for hackathon use, but not ideal for concurrent production traffic
- some panel flows still need refinement around command-to-summary synchronization
- what-if output is exploratory and not validated biological prediction

## Practical Tips

- If `/api/stream/{request_id}` returns `404` on a multi-instance platform, suspect in-memory stream state first.
- If literature results seem sparse, try more explicit disease or pathway keywords.
- If `/add GENE` behaves oddly, check whether the backend returned a `summary_chunk` for the expand request.
- If Modal deploy logs fail on Windows due to encoding, force:

```powershell
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
```

## Current Deploy URL

The latest deployed Modal app URL at the time of setup was:

- `https://marcel-skumantz--gene-agent-fastapi-app.modal.run`

That can change if you rename the app or workspace configuration.

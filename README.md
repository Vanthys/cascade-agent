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

## Modal Deployment

This repo now includes [modal_app.py](./modal_app.py) for deploying the FastAPI
backend on Modal, with optional static frontend hosting from `web/dist`.

### 1. Build the frontend

From `web/`:

```bash
npm install
npm run build
```

That produces `web/dist`. If that directory exists when you deploy, Modal will
bundle it and FastAPI will serve the UI and API from the same app.

### 2. Create the Modal secret

Create a secret named `gene-agent` and put the app env vars in it:

```bash
modal secret create gene-agent \
  GMI_API_KEY=... \
  GMI_BASE_URL=https://api.gmi-serving.com/v1 \
  GMI_FAST_MODEL=... \
  GMI_STRONG_MODEL=... \
  HYDRADB_API_KEY=... \
  HYDRA_BASE_URL=https://api.hydradb.com \
  HYDRA_TENANT_ID=gene-agent \
  LOG_LEVEL=info
```

`DATABASE_URL`, `RESEARCH_CACHE_PATH`, and `FRONTEND_DIST_DIR` are set by
`modal_app.py` automatically for the Modal container.

### 3. Deploy

```bash
modal deploy modal_app.py
```

### 4. Persistent storage

The Modal app mounts a persistent Volume named `gene-agent-data` at `/data`.
It stores:

- SQLite database at `/data/gene_agent.db`
- literature cache at `/data/.research_cache.json`

### 5. Routing

The backend serves routes at both:

- `/graph`, `/whatif`, `/literature`, etc.
- `/api/graph`, `/api/whatif`, `/api/literature`, etc.

That means the same frontend build works both locally behind Vite proxy and in
Modal when served directly from FastAPI.

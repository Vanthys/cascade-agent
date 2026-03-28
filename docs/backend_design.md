Backend Design Document

Project: Gene graph research + what-if hypothesis agent
Stack: FastAPI, uv, SSE, HydraDB, GMI Cloud inference, Modal
Frontend assumption: large graph canvas with a central prompt box

1. Purpose

Build a backend that supports a graph-native gene research workflow:

User enters a gene or free-text prompt.
Backend researches the seed gene.
Backend finds biologically adjacent genes.
Backend returns a graph structure plus a concise explanation.
User can click:
a gene node → deeper research
an edge → “what if” reasoning about perturbation/downregulation/upregulation effects
The system remembers session context and previous graph explorations.

The design should feel responsive, stream partial progress, and be able to grow from a hackathon prototype into a more production-ready system.

2. Product shape
Initial user interaction

The first backend workflow should produce:

seed_gene
adjacent_genes[]
relationships[]
summary_text
confidence / evidence
research references

This gives the frontend enough to render:

center node
surrounding related genes
typed edges
a short explainer panel
Follow-up interactions

The backend must support three core actions:

A. Expand a gene

User clicks a gene node and requests more detail.

Return:

function
pathways
disease relevance
known interactions
additional neighbors
references
B. Expand an edge

User clicks a relationship between two genes.

Return:

why these genes are connected
what evidence supports the relationship
what pathway / mechanism the edge likely represents
related citations / source snippets
C. Run a “what if”

User asks something like:

“What if TP53 is downregulated?”
“What if EGFR is overexpressed?”
“What happens downstream if this edge is disrupted?”

Return:

mechanistic hypothesis
likely upstream/downstream effects
affected pathways
confidence and uncertainty
optionally a small set of secondary genes likely impacted

This is not a clinical predictor. It is a research hypothesis engine.

3. High-level architecture
Frontend (graph canvas)
    |
    | HTTP + SSE
    v
FastAPI API Layer
    |
    +--> Orchestrator / Workflow Service
    |       |
    |       +--> Research Service
    |       +--> Graph Builder
    |       +--> What-If / Hypothesis Engine
    |       +--> Memory Service (HydraDB)
    |       +--> Inference Client (GMI Cloud)
    |
    +--> Session Store / Metadata DB
    +--> Background Tasks / Job Queue
4. Design goals
Primary
Fast first response
Stream progress to the UI
Graph as the main data object
Strong session memory
Clear separation between:
retrieval
graph assembly
explanation generation
hypothetical reasoning
Secondary
Easy to host on Modal
Minimal moving parts for hackathon delivery
Upgrade path to async jobs and deeper research later
Non-goals for v1
full causal biology engine
clinical-grade prediction
large-scale pathway simulation
variant pathogenicity prediction
full wet-lab design
5. Core backend components
5.1 API Layer (FastAPI)

Responsibilities:

expose REST endpoints
expose SSE streaming endpoints
validate input/output
manage session IDs and request IDs
auth hook points for later

Recommended structure:

app/
  api/
    routes/
      session.py
      graph.py
      gene.py
      edge.py
      whatif.py
      stream.py
  core/
    config.py
    logging.py
    errors.py
  services/
    orchestrator.py
    research_service.py
    graph_service.py
    hypothesis_service.py
    memory_service.py
    llm_service.py
  models/
    api.py
    domain.py
    events.py
  clients/
    gmi_client.py
    hydra_client.py
    research_client.py
  repositories/
    session_repo.py
    graph_repo.py

Use uv for dependency and environment management; it keeps the project setup fast and reproducible.

5.2 Orchestrator Service

This is the brain of the backend.

Responsibilities:

interpret incoming action
choose workflow
coordinate retrieval + inference + memory
emit SSE progress events
assemble final response object

Main workflows:

seed_graph_workflow
expand_gene_workflow
expand_edge_workflow
what_if_workflow

The orchestrator should not contain biology logic directly. It should compose other services.

5.3 Research Service

Responsibilities:

fetch structured facts about genes and relationships
normalize source data into a common schema
produce evidence packets for graph building and reasoning

For the hackathon, this can begin with:

a small research integration layer
one or two trusted data sources
optionally a cached local knowledge bundle for known genes

Output shape:

{
  "gene": "TP53",
  "aliases": ["P53", "BCC7"],
  "summary": "...",
  "pathways": ["DNA damage response", "apoptosis"],
  "neighbors": [
    {
      "gene": "MDM2",
      "relation": "negative regulation",
      "evidence": ["..."]
    }
  ],
  "sources": [
    {
      "title": "...",
      "url": "...",
      "snippet": "..."
    }
  ]
}

Important design choice:
research should return facts and evidence, not prose.
Prose belongs to the LLM synthesis layer.

5.4 Graph Service

Responsibilities:

construct and update the graph model
deduplicate nodes and edges
assign edge types and confidence
compute graph patches for incremental updates

The graph service should support:

Node types
gene
pathway (optional later)
disease (optional later)
mechanism (optional later)

For v1, keep nodes as mostly gene.

Edge types
activates
inhibits
binds
coexpressed_with
in_pathway_with
synthetic_lethal_with
associated_with
unknown_related

Every edge should carry:

source gene
target gene
relation type
confidence score
evidence summary
provenance

Example:

{
  "id": "edge_tp53_mdm2_reg",
  "source": "TP53",
  "target": "MDM2",
  "type": "negative_feedback_association",
  "confidence": 0.81,
  "evidence_count": 3,
  "evidence_summary": "MDM2 is a canonical regulator of TP53 stability.",
  "provenance": ["source_a", "source_b"]
}

The graph service should produce patches, not always full graph reloads.

5.5 Hypothesis Service

Responsibilities:

generate “what if” reasoning
estimate likely biological consequences of perturbation
explicitly separate known evidence from speculative inference

This service should take:

selected node or edge
current graph context
session memory
retrieved evidence

And return:

{
  "question": "What if TP53 is downregulated?",
  "known_context": [
    "TP53 participates in DNA damage response",
    "TP53 loss weakens apoptosis signaling"
  ],
  "hypothesis": [
    "Reduced TP53 activity may diminish cell cycle arrest",
    "DNA-damaged cells may be more likely to continue proliferating"
  ],
  "downstream_candidates": ["CDKN1A", "BAX", "MDM2"],
  "confidence": "medium",
  "uncertainty_notes": [
    "Effect magnitude is context-dependent",
    "Cell type and compensatory pathways matter"
  ],
  "references": [...]
}

Critical backend rule:

Separate outputs into two buckets
evidence-backed statements
model-generated hypotheses

That makes the product much more trustworthy.

5.6 Memory Service (HydraDB)

HydraDB is positioned as a memory layer for persistent, stateful agents rather than just a vector store, including user/session memory and contextual retrieval. Its docs describe flows around tenant creation, memory upload, and retrieving context for the agent.

Use HydraDB for:

Session memory
seed genes explored
user-selected organism
user’s current research theme
graph interaction history
prior what-if questions
Semantic memory
prior generated summaries
normalized research findings
edge explanations
user preferences like “prefer concise explanations”
Working context retrieval

Before each inference step:

retrieve the most relevant session memory
retrieve the active graph neighborhood
retrieve the last few user interactions

Suggested memory model:

{
  "tenant_id": "team_or_app",
  "session_id": "sess_123",
  "memory_type": "interaction",
  "content": {
    "action": "expand_gene",
    "gene": "BRCA1",
    "focus": "DNA repair"
  },
  "tags": ["gene:BRCA1", "topic:dna_repair"]
}

Design principle:

HydraDB stores agent memory
your own app DB stores authoritative session / graph records

Do not let external memory become your sole source of truth for active graph state.

5.7 Inference Service (GMI Cloud)

GMI Cloud provides a unified inference engine with serverless and dedicated endpoint modes, plus REST and streaming APIs for LLM inference.

Use GMI Cloud for:

structured extraction / synthesis
short graph summary generation
edge explanation generation
what-if hypothesis generation

Recommended pattern:

one small/fast model for classification and structured extraction
one stronger model for synthesis and hypothesis writing
Inference tasks
seed_gene_interpretation
adjacent_gene_ranking
summary_generation
edge_mechanism_explanation
what_if_hypothesis

Prefer structured JSON responses first, then optional prose rendering.

Example internal contract:

{
  "task": "what_if_hypothesis",
  "input": {
    "focus_gene": "TP53",
    "perturbation": "downregulation",
    "graph_context": {...},
    "evidence_packets": [...]
  },
  "output_schema": {
    "known_context": "array[string]",
    "hypotheses": "array[string]",
    "downstream_candidates": "array[string]",
    "confidence": "string",
    "uncertainty_notes": "array[string]"
  }
}
6. Recommended backend data model
6.1 Session
{
  "session_id": "sess_123",
  "user_id": "optional",
  "created_at": "...",
  "updated_at": "...",
  "state": "active",
  "preferences": {
    "species": "human",
    "detail_level": "medium"
  }
}
6.2 Graph snapshot
{
  "graph_id": "graph_123",
  "session_id": "sess_123",
  "version": 4,
  "seed_gene": "TP53",
  "nodes": [...],
  "edges": [...],
  "layout": {
    "center_node": "TP53"
  },
  "created_at": "...",
  "updated_at": "..."
}
6.3 Node
{
  "id": "gene_TP53",
  "type": "gene",
  "label": "TP53",
  "meta": {
    "aliases": ["P53"],
    "summary": "...",
    "organism": "human"
  }
}
6.4 Edge
{
  "id": "edge_TP53_MDM2",
  "source": "gene_TP53",
  "target": "gene_MDM2",
  "relation": "regulates",
  "direction": "bidirectional_or_directed",
  "confidence": 0.81,
  "evidence_ids": ["ev_1", "ev_2"]
}
6.5 Research evidence
{
  "id": "ev_1",
  "entity_refs": ["gene_TP53", "gene_MDM2"],
  "type": "interaction_summary",
  "source_name": "research_provider_x",
  "snippet": "...",
  "url": "...",
  "retrieved_at": "..."
}
6.6 What-if analysis
{
  "id": "whatif_001",
  "session_id": "sess_123",
  "target_type": "node",
  "target_id": "gene_TP53",
  "perturbation": "downregulation",
  "known_context": [...],
  "hypotheses": [...],
  "downstream_candidates": [...],
  "confidence": "medium",
  "uncertainty_notes": [...],
  "created_at": "..."
}
7. API design
7.1 Create session

POST /sessions

Response:

{
  "session_id": "sess_123"
}
7.2 Start seed graph research

POST /graph/seed

Request:

{
  "session_id": "sess_123",
  "prompt": "TP53",
  "species": "human"
}

Response:

{
  "request_id": "req_abc",
  "stream_url": "/stream/req_abc"
}

Use a separate stream channel for progress and partial results.

7.3 Expand a gene

POST /graph/gene/expand

Request:

{
  "session_id": "sess_123",
  "gene_id": "gene_TP53"
}

Response:

request accepted + stream URL
or synchronous small payload if already cached
7.4 Explain an edge

POST /graph/edge/explain

Request:

{
  "session_id": "sess_123",
  "edge_id": "edge_TP53_MDM2"
}
7.5 Run what-if

POST /whatif

Request:

{
  "session_id": "sess_123",
  "target_type": "node",
  "target_id": "gene_TP53",
  "perturbation": "downregulation"
}
7.6 Stream events

GET /stream/{request_id}

Use SSE for:

status updates
partial graph patches
summary text chunks
final result event
8. SSE event model

SSE is a good fit here because the frontend needs progressive updates rather than a single blocking response.

Modal’s FastAPI endpoint support includes streaming responses, and its docs also note that very long-running requests may need background/polling patterns rather than one long request.

Suggested events:

Lifecycle events
event: started
data: {"request_id":"req_abc","workflow":"seed_graph"}
event: progress
data: {"step":"research_seed_gene","status":"running"}
event: progress
data: {"step":"find_adjacent_genes","status":"running"}
event: progress
data: {"step":"build_graph","status":"completed"}
Data events
event: graph_patch
data: {"nodes":[...],"edges":[...]}
event: summary_chunk
data: {"text":"TP53 is a tumor suppressor involved in ..."}
event: evidence
data: {"items":[...]}
Final event
event: completed
data: {"graph_id":"graph_123","version":1}
Error event
event: error
data: {"message":"Research provider timeout","recoverable":true}

Design recommendation:

stream graph patches early
stream prose summary after the first graph structure exists
never make the UI wait for every evidence source before showing something useful
9. Main workflow designs
9.1 Seed graph workflow

Input: prompt like TP53

Steps
Normalize prompt into candidate gene.
Retrieve session memory from HydraDB.
Research seed gene via Research Service.
Find and rank adjacent genes.
Build graph.
Generate concise summary via GMI Cloud.
Persist graph snapshot.
Store interaction memory in HydraDB.
Stream final result.
Output
graph snapshot
concise summary
evidence bundle
suggested next actions
9.2 Expand gene workflow

Input: clicked node

Steps
Load current graph neighborhood.
Retrieve prior context from HydraDB.
Fetch deeper research for selected gene.
Generate graph patch with new neighbors.
Produce detail panel summary.
Persist patch and memory.
Stream updates.
9.3 Edge explain workflow

Input: clicked edge

Steps
Resolve source and target genes.
Retrieve evidence for the connection.
Ask model to separate:
known mechanism
likely interpretation
Return explanation object.
Persist explanation.
9.4 What-if workflow

Input: target node/edge + perturbation type

Steps
Gather local subgraph around target.
Fetch evidence packets for target and neighbors.
Retrieve session memory from HydraDB.
Build structured inference prompt.
Run GMI Cloud model.
Validate output schema.
Stream hypothesis results.
Persist result + memory.

Recommended guardrail:

restrict what-if reasoning to a local k-hop neighborhood first
do not ask the model to reason over the entire graph every time

That keeps latency and hallucination risk down.

10. Retrieval and research integration design

Your research integration should be modular.

Interface
class ResearchProvider(Protocol):
    async def get_gene(self, symbol: str, species: str | None) -> GeneFacts: ...
    async def get_neighbors(self, symbol: str, species: str | None) -> list[GeneRelation]: ...
    async def get_edge_evidence(self, source: str, target: str) -> list[Evidence]: ...
Aggregator

A ResearchAggregator merges provider outputs and normalizes them.

Important backend policy:

assign provenance to every fact
keep raw evidence separate from generated summaries
cache aggressively for common genes
11. Prompting / inference contracts

The most important backend decision is to use strict task contracts.

Bad pattern

“Explain this gene and what happens if it is downregulated.”

Better pattern

Give the model:

normalized facts
graph neighborhood
exact response schema
explicit separation of evidence vs hypothesis

Example system contract:

You are a biological research assistant.
Use only the provided evidence to state known facts.
You may generate hypotheses, but label them explicitly as hypotheses.
Do not present hypotheses as established fact.
Return valid JSON only.

This lets the backend:

validate outputs
reduce hallucinations
reuse the same task pipeline across workflows
12. Persistence strategy

Use two persistence layers.

A. App database

Use for:

sessions
graph snapshots
graph versions
request metadata
cached evidence
what-if results

For hackathon speed, SQLite or Postgres is fine. If using Modal and you want minimal friction, start with SQLite only for prototype state and swap later.

B. HydraDB

Use for:

long-term agent memory
session memory retrieval
prior interaction context
user preference memory

This split keeps your system easier to debug.

13. Modal deployment design

Modal is a reasonable fit for FastAPI hosting and streaming. Its docs cover FastAPI-compatible streaming endpoints and patterns for handling longer-running web requests.

Suggested deployment split
Option A — simple hackathon deployment

Single Modal app containing:

FastAPI app
orchestrator
all services
outbound calls to GMI Cloud and HydraDB

This is the fastest path.

Option B — slightly cleaner

Two Modal functions/apps:

api-service
background-worker

Use background workers for:

deeper graph expansions
large research jobs
expensive what-if analyses

For the hackathon, Option A is enough.

14. Concurrency and latency strategy
Goal

Get first visible output in under a few seconds.

Pattern

Parallelize:

gene fact retrieval
neighbor retrieval
memory retrieval

Then:

build provisional graph
stream it
run summary generation afterward
Fast path
resolve seed gene
fetch top neighbors
render graph patch
generate text summary
Slow path
enrich evidence
rank edges more carefully
persist enriched graph

This gives the UI something useful very quickly.

15. Caching strategy

Cache these aggressively:

gene summaries
common neighbors
edge explanations
normalized evidence packets

Cache keys:

gene:{symbol}:{species}
neighbors:{symbol}:{species}
edge:{source}:{target}
whatif:{target}:{perturbation}:{graph_hash}

For the hackathon:

in-memory cache is acceptable
add TTL
keep the API contracts stable so Redis can be added later
16. Observability

You need at least:

Structured logs

Include:

request_id
session_id
workflow_name
timing per step
model used
provider latencies
Metrics

Track:

time to first SSE event
total request latency
model latency
retrieval latency
cache hit rate
schema validation failure rate
Failure buckets
research provider timeout
model malformed JSON
memory retrieval failure
graph build failure
17. Safety and trust model

Because this is biology, the backend should clearly mark uncertainty.

Required response fields
confidence
evidence count
uncertainty notes
hypothesis vs known fact separation
Avoid
disease risk predictions framed as clinical guidance
treatment recommendations
definitive causal claims from weak evidence

This protects the product and makes it more credible.

18. Recommended v1 scope
Must-have
session creation
seed graph workflow
gene expand workflow
what-if workflow for a selected gene
SSE progress events
HydraDB session memory
GMI Cloud synthesis
Nice-to-have
edge explanation workflow
graph version history
evidence sidebar
cached common gene neighborhoods
Cut if needed
edge what-if
multi-species support
pathway nodes
deep asynchronous enrichment
19. Suggested folder layout
gene-agent/
  pyproject.toml
  uv.lock
  app/
    main.py
    api/
      routes/
        sessions.py
        graph.py
        whatif.py
        stream.py
    clients/
      gmi_client.py
      hydra_client.py
      research_client.py
    services/
      orchestrator.py
      research_service.py
      graph_service.py
      hypothesis_service.py
      memory_service.py
      cache_service.py
    repositories/
      session_repo.py
      graph_repo.py
      evidence_repo.py
    models/
      api.py
      domain.py
      events.py
    core/
      config.py
      logging.py
      exceptions.py
  tests/
20. Concrete recommendation

Build the backend around one core principle:

The graph is the product, memory is the differentiator, and hypotheses are a controlled overlay.

That means:

Research Service finds facts
Graph Service turns facts into navigable structure
HydraDB remembers user/session exploration state
GMI Cloud converts structured evidence into explanations and hypotheses
FastAPI + SSE make the experience feel live
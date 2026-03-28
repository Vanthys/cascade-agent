/**
 * Backend API client.
 * All endpoints are prefixed with /api which Vite proxies to http://127.0.0.1:8000.
 */

const BASE = '/api';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Session ───────────────────────────────────────────────────────────────────

/** Create a new session. Returns { session_id }. */
export async function createSession(preferences = {}) {
  return post('/sessions', { preferences });
}

// ── Graph workflows ───────────────────────────────────────────────────────────

/** Start seed graph research. Returns { request_id, stream_url }. */
export async function seedGraph(sessionId, prompt, species = 'human') {
  return post('/graph/seed', { session_id: sessionId, prompt, species });
}

/** Expand a gene node deeper. Returns { request_id, stream_url }. */
export async function expandGene(sessionId, geneId, prompt = null) {
  return post('/graph/gene/expand', { session_id: sessionId, gene_id: geneId, prompt });
}

/** Explain an edge. Returns { request_id, stream_url }. */
export async function explainEdge(sessionId, edgeId) {
  return post('/graph/edge/explain', { session_id: sessionId, edge_id: edgeId });
}

/** Run a what-if perturbation hypothesis. Returns { request_id, stream_url }. */
export async function runWhatIf(sessionId, targetId, targetType, perturbation, prompt = null) {
  return post('/whatif', {
    session_id: sessionId,
    target_id: targetId,
    target_type: targetType,
    perturbation,
    prompt,
  });
}

// ── SSE stream ────────────────────────────────────────────────────────────────

/**
 * Connect to the SSE stream for a request.
 * handlers: { progress, graph_patch, summary_chunk, evidence, completed, error, onClose }
 * Returns a stop() function that closes the EventSource.
 */
export function connectStream(requestId, handlers = {}) {
  const es = new EventSource(`${BASE}/stream/${requestId}`);

  const EVENTS = [
    'started', 'progress', 'graph_patch', 'summary_chunk',
    'hypothesis', 'evidence', 'completed', 'error',
  ];

  EVENTS.forEach((type) => {
    if (handlers[type]) {
      es.addEventListener(type, (e) => {
        try { handlers[type](JSON.parse(e.data)); }
        catch (err) { console.warn(`SSE parse error for event "${type}"`, err); }
      });
    }
  });

  // Auto-close after completed or error so the EventSource doesn't hang.
  es.addEventListener('completed', () => {
    es.close();
    handlers.onClose?.();
  });
  es.addEventListener('error', () => {
    es.close();
    handlers.onClose?.();
  });

  // Network-level error (backend unreachable).
  es.onerror = () => {
    es.close();
    handlers.onClose?.();
  };

  return () => es.close();
}

// ── Perturbation detection ────────────────────────────────────────────────────

/**
 * Try to detect a PerturbationType from free text.
 * Returns a string matching the backend enum, or null if not detected.
 */
export function detectPerturbation(text) {
  const t = text.toLowerCase();
  if (t.includes('downregulat') || t.includes('loss of') || t.includes('suppressed') || t.includes('silenced')) return 'downregulation';
  if (t.includes('upregulat') || t.includes('overexpres') || t.includes('amplif')) return 'upregulation';
  if (t.includes('knockout') || t.includes('knock out') || t.includes('deleted') || t.includes('knock-out')) return 'knockout';
  if (t.includes('overexpres')) return 'overexpression';
  if (t.includes('disrupt') || t.includes('block') || t.includes('inhibit')) return 'disruption';
  return null;
}

export function isWhatIfPrompt(text) {
  const t = text.toLowerCase();
  return t.startsWith('/whatif') || t.includes('what if') || t.includes('if ') || detectPerturbation(t) !== null;
}

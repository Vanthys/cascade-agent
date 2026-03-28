"""
GMI Cloud inference client — OpenAI-compatible REST API.

Handles:
- Structured JSON completions (fast + strong model)
- Streaming text completions (yields str chunks)

All task contracts follow design doc section 11:
- system prompt enforces fact vs hypothesis separation
- output schema is injected into the user prompt
- JSON output is validated before returning
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import InferenceError
from app.core.logging import get_logger

log = get_logger("gmi_client")

_SYSTEM_PROMPT = """\
You are a biological research assistant working within a gene research system.

Rules:
1. Use only the provided evidence to state KNOWN FACTS.
2. You MAY generate hypotheses, but you MUST label them explicitly as hypotheses.
3. Do NOT present hypotheses as established fact.
4. Return valid JSON only — no prose outside the JSON structure.
5. Keep responses concise and tightly scoped to the question.
6. Finish cleanly. Do not end mid-sentence or with an obviously truncated thought.
"""


class GMIClient:
    def __init__(self, http_client: httpx.AsyncClient):
        self._http = http_client
        self._base = settings.gmi_base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {settings.gmi_api_key}",
            "Content-Type": "application/json",
        }

    # ── Core helpers ──────────────────────────────────────────────────────────

    def _build_messages(self, user_content: str) -> list[dict]:
        return [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

    # ── Structured JSON completion ────────────────────────────────────────────

    async def complete_json(
        self,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.3,
    ) -> dict[str, Any]:
        """Call GMI Cloud and parse the response as JSON. Raises InferenceError on failure."""
        model = model or settings.gmi_fast_model
        payload = {
            "model": model,
            "messages": self._build_messages(prompt),
            "temperature": temperature,
            "max_tokens": 2048,
        }
        try:
            r = await self._http.post(
                f"{self._base}/chat/completions",
                headers=self._headers,
                json=payload,
                timeout=30.0,
            )
            r.raise_for_status()
        except httpx.HTTPError as exc:
            raise InferenceError(f"GMI Cloud HTTP error: {exc}", recoverable=True) from exc

        body = r.json()
        raw = body["choices"][0]["message"]["content"].strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            log.warning("gmi_json_parse_failure", raw=raw[:200], error=str(exc))
            raise InferenceError(
                f"GMI Cloud returned malformed JSON: {exc}", recoverable=False
            ) from exc

    # ── Streaming text completion ──────────────────────────────────────────────

    async def stream_text(
        self,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.5,
    ) -> AsyncGenerator[str, None]:
        """Yield text chunks from a streaming GMI Cloud completion."""
        model = model or settings.gmi_strong_model
        payload = {
            "model": model,
            "messages": self._build_messages(prompt),
            "temperature": temperature,
            "max_tokens": 1024,
            "stream": True,
        }
        try:
            async with self._http.stream(
                "POST",
                f"{self._base}/chat/completions",
                headers=self._headers,
                json=payload,
                timeout=60.0,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield delta
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
        except httpx.HTTPError as exc:
            raise InferenceError(f"GMI Cloud stream error: {exc}", recoverable=True) from exc

    # ── Named task helpers ────────────────────────────────────────────────────

    async def summarise_gene(
        self,
        gene: str,
        facts: dict[str, Any],
        graph_context: dict[str, Any],
        prompt: str | None = None,
    ) -> dict[str, Any]:
        """Generate a concise graph summary for the seed gene."""
        user_question = f"\nUser question: {prompt}" if prompt else ""
        system_prompt = f"""
Task: summary_generation

Gene: {gene}
Facts: {json.dumps(facts, indent=2)}
Graph context (neighbors): {json.dumps(graph_context, indent=2)}{user_question}

Provide a concise but complete biological summary of the gene. If the user asked a question, answer it directly.
Evaluate the provided graph context (neighbors) and suggest the most promising genes to explore next.

Return JSON with this exact schema:
{{
  "summary": "2-4 complete sentences answering the user question if provided and highlighting the most important connected neighbors. End on a complete thought.",
  "key_roles": ["role1", "role2"],
  "suggested_next": ["gene_or_pathway to explore next"]
}}
"""
        return await self.complete_json(system_prompt, model=settings.gmi_fast_model)

    async def explain_edge(
        self,
        source: str,
        target: str,
        evidence: list[dict],
    ) -> dict[str, Any]:
        """Explain the biological relationship between two genes."""
        prompt = f"""
Task: edge_mechanism_explanation

Source gene: {source}
Target gene: {target}
Available evidence: {json.dumps(evidence, indent=2)}

Return JSON:
{{
  "known_mechanism": "What is established about this connection in a complete sentence or two",
  "likely_interpretation": "Most probable biological meaning, written as a complete sentence",
  "confidence": "high|medium|low",
  "uncertainty_notes": ["note1"]
}}
"""
        return await self.complete_json(prompt, model=settings.gmi_fast_model)

    async def generate_what_if(
        self,
        focus_gene: str,
        perturbation: str,
        graph_context: dict[str, Any],
        evidence_packets: list[dict],
        user_question: str | None = None,
    ) -> dict[str, Any]:
        """Generate hypothesis for a perturbation scenario."""
        user_prompt = f"\nUser question: {user_question}" if user_question else ""
        prompt = f"""
Task: what_if_hypothesis

Focus gene: {focus_gene}
Perturbation: {perturbation}
Local graph context: {json.dumps(graph_context, indent=2)}
Evidence: {json.dumps(evidence_packets, indent=2)}{user_prompt}

Return JSON:
{{
  "question": "A specific what-if question that incorporates the user's wording when provided",
  "known_context": ["established fact 1", "established fact 2"],
  "hypotheses": ["hypothesis 1", "hypothesis 2"],
  "downstream_candidates": ["GENE1", "GENE2"],
  "confidence": "high|medium|low",
  "uncertainty_notes": ["note about limitations"]
}}

IMPORTANT: known_context must contain ONLY statements supported by the evidence.
hypotheses must be clearly speculative and labelled as such.
When a user question is provided, tailor the question, hypotheses, and downstream candidates to that specific gene-interaction concern.
"""
        return await self.complete_json(prompt, model=settings.gmi_strong_model, temperature=0.4)

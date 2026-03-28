"""
Graph service — builds, patches, and deduplicates gene graphs.
Responsible for:
- Constructing a GraphSnapshot from GeneFacts + neighbor list
- Computing GraphPatches for incremental updates
- Deduplicating nodes and edges
- Assigning edge types and confidence scores
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime

from app.models.domain import (
    EdgeType,
    GeneEdge,
    GeneNode,
    GeneFacts,
    GeneRelation,
    GraphPatch,
    GraphSnapshot,
    NodeType,
)
from app.repositories.graph_repo import new_graph_id


def _gene_node_id(symbol: str) -> str:
    return f"gene_{symbol.upper()}"


def _edge_id(source: str, target: str, relation: EdgeType) -> str:
    a, b = sorted([source.upper(), target.upper()])
    return f"edge_{a}_{b}_{relation.value}"


def _make_node(symbol: str, facts: GeneFacts | None = None) -> GeneNode:
    meta: dict = {}
    if facts:
        meta = {
            "aliases": facts.aliases,
            "summary": facts.summary[:300] if facts.summary else "",
            "organism": "human",
            "pathways": facts.pathways[:5],
            "ncbi_id": facts.ncbi_id,
        }
    return GeneNode(
        id=_gene_node_id(symbol),
        type=NodeType.gene,
        label=symbol.upper(),
        meta=meta,
    )


def _make_edge(
    source: str,
    target: str,
    relation: GeneRelation,
) -> GeneEdge:
    return GeneEdge(
        id=_edge_id(source, target, relation.relation),
        source=_gene_node_id(source),
        target=_gene_node_id(target),
        relation=relation.relation,
        direction="directed",
        confidence=relation.confidence,
        evidence_count=len(relation.evidence),
        evidence_summary="; ".join(relation.evidence[:2]),
        provenance=relation.provenance,
    )


class GraphService:
    def build_seed_graph(
        self,
        session_id: str,
        facts: GeneFacts,
        neighbor_facts: dict[str, GeneFacts] | None = None,
    ) -> GraphSnapshot:
        """Build an initial graph from seed gene facts + its neighbors."""
        seed_symbol = facts.gene.upper()
        seed_node = _make_node(seed_symbol, facts)

        nodes: dict[str, GeneNode] = {seed_node.id: seed_node}
        edges: dict[str, GeneEdge] = {}

        for relation in facts.neighbors:
            neighbor_symbol = relation.gene.upper()
            neighbor_fact = (neighbor_facts or {}).get(neighbor_symbol)
            neighbor_node = _make_node(neighbor_symbol, neighbor_fact)
            nodes[neighbor_node.id] = neighbor_node

            edge = _make_edge(seed_symbol, neighbor_symbol, relation)
            edges[edge.id] = edge

        return GraphSnapshot(
            graph_id=new_graph_id(),
            session_id=session_id,
            version=1,
            seed_gene=seed_symbol,
            nodes=list(nodes.values()),
            edges=list(edges.values()),
            layout={"center_node": seed_node.id},
        )

    def compute_patch(
        self,
        current: GraphSnapshot,
        new_facts: GeneFacts,
        neighbor_facts: dict[str, GeneFacts] | None = None,
    ) -> GraphPatch:
        """
        Return a patch containing only new nodes and edges not already in the snapshot.
        Used when expanding a gene — avoids full graph reloads.
        """
        existing_node_ids = {n.id for n in current.nodes}
        existing_edge_ids = {e.id for e in current.edges}

        new_nodes: list[GeneNode] = []
        new_edges: list[GeneEdge] = []

        # Ensure the focus gene node has updated meta
        focus_node = _make_node(new_facts.gene, new_facts)
        if focus_node.id not in existing_node_ids:
            new_nodes.append(focus_node)
        else:
            # Update existing node meta
            for n in current.nodes:
                if n.id == focus_node.id:
                    n.meta = focus_node.meta
                    break

        for relation in new_facts.neighbors:
            neighbor_symbol = relation.gene.upper()
            neighbor_fact = (neighbor_facts or {}).get(neighbor_symbol)
            neighbor_node = _make_node(neighbor_symbol, neighbor_fact)
            if neighbor_node.id not in existing_node_ids:
                new_nodes.append(neighbor_node)
                existing_node_ids.add(neighbor_node.id)

            edge = _make_edge(new_facts.gene, neighbor_symbol, relation)
            if edge.id not in existing_edge_ids:
                new_edges.append(edge)
                existing_edge_ids.add(edge.id)

        return GraphPatch(nodes=new_nodes, edges=new_edges)

    def apply_patch(
        self,
        snapshot: GraphSnapshot,
        patch: GraphPatch,
    ) -> GraphSnapshot:
        """Apply a patch to a snapshot and return an updated snapshot."""
        node_map = {n.id: n for n in snapshot.nodes}
        edge_map = {e.id: e for e in snapshot.edges}

        for n in patch.nodes:
            node_map[n.id] = n
        for e in patch.edges:
            edge_map[e.id] = e

        for nid in patch.removed_node_ids:
            node_map.pop(nid, None)
        for eid in patch.removed_edge_ids:
            edge_map.pop(eid, None)

        return GraphSnapshot(
            graph_id=snapshot.graph_id,
            session_id=snapshot.session_id,
            version=snapshot.version + 1,
            seed_gene=snapshot.seed_gene,
            nodes=list(node_map.values()),
            edges=list(edge_map.values()),
            layout=snapshot.layout,
            created_at=snapshot.created_at,
            updated_at=datetime.utcnow(),
        )

    def get_local_subgraph(
        self,
        snapshot: GraphSnapshot,
        focus_node_id: str,
        hops: int = 1,
    ) -> dict:
        """
        Return a small dict describing the k-hop neighborhood around focus_node_id.
        Used to scope what-if reasoning to a local context.
        """
        neighbor_ids: set[str] = {focus_node_id}
        for _ in range(hops):
            new_ids: set[str] = set()
            for edge in snapshot.edges:
                if edge.source in neighbor_ids:
                    new_ids.add(edge.target)
                if edge.target in neighbor_ids:
                    new_ids.add(edge.source)
            neighbor_ids |= new_ids

        nodes = [n for n in snapshot.nodes if n.id in neighbor_ids]
        edges = [
            e
            for e in snapshot.edges
            if e.source in neighbor_ids and e.target in neighbor_ids
        ]
        return {
            "focus": focus_node_id,
            "nodes": [n.model_dump() for n in nodes],
            "edges": [e.model_dump() for e in edges],
        }

    def graph_hash(self, snapshot: GraphSnapshot) -> str:
        """Stable hash of a graph for cache keying."""
        ids = sorted([n.id for n in snapshot.nodes] + [e.id for e in snapshot.edges])
        return hashlib.md5(json.dumps(ids).encode()).hexdigest()[:12]

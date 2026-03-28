import { useEffect, useRef } from "react";
import * as d3 from "d3";

// ─── Relation colours ─────────────────────────────────────────────────────────
const COLORS = {
  activates:           "#52c41a",
  inhibits:            "#ff4d4f",
  binds:               "#1677ff",
  coexpressed_with:    "#722ed1",
  in_pathway_with:     "#fa8c16",
  synthetic_lethal_with: "#eb2f96",
  associated_with:     "#13c2c2",
  unknown_related:     "#bfbfbf",
};

const edgeColor = (rel) => COLORS[rel] ?? "#bfbfbf";

const SEED_R  = 32;
const NODE_R  = 22;
const ARROW_L = 8; // arrowhead length for endpoint offset

const LEGEND_ITEMS = [
  ["activates",     "Activates"],
  ["inhibits",      "Inhibits"],
  ["binds",         "Binds"],
  ["associated_with","Associated"],
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function GraphCanvas({ graphData, expandedNodes, selectedNodeId, seedId, onSelectNode, onSelectEdge }) {
  const wrapRef = useRef(null);
  const svgRef  = useRef(null);
  const simRef  = useRef(null);

  useEffect(() => {
    if (!graphData?.nodes?.length || !svgRef.current || !wrapRef.current) return;

    const wrap   = wrapRef.current;
    const width  = wrap.clientWidth;
    const height = wrap.clientHeight;

    // ── Tear down previous ──────────────────────────────────────────────────
    simRef.current?.stop();
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    // ── Zoom layer ──────────────────────────────────────────────────────────
    const g = svg.append("g");
    svg.call(
      d3.zoom()
        .scaleExtent([0.15, 4])
        .on("zoom", (e) => g.attr("transform", e.transform))
    );

    // ── Arrow markers (one per unique colour) ───────────────────────────────
    const defs = svg.append("defs");
    const usedColors = [...new Set(graphData.edges.map((e) => edgeColor(e.relation)))];
    usedColors.forEach((color) => {
      const id = `arrow-${color.replace("#", "")}`;
      defs.append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -4 8 8")
        .attr("refX", 8)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L8,0L0,4")
        .attr("fill", color)
        .attr("fill-opacity", 0.75);
    });

    // ── Clone data so D3 can mutate x/y freely ──────────────────────────────
    const nodes = graphData.nodes.map((n) => ({ ...n }));
    const edges = graphData.edges.map((e) => ({ ...e }));
    const nodeR = (d) => (d.id === seedId ? SEED_R : NODE_R);

    // ── Force simulation ────────────────────────────────────────────────────
    const sim = d3.forceSimulation(nodes)
      .velocityDecay(0.6) // dampen the jumpy physics
      .force("link",
        d3.forceLink(edges)
          .id((d) => d.id)
          .distance(100)
          .strength(1.0)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d) => nodeR(d) + 16));
    simRef.current = sim;

    // ── Edges ───────────────────────────────────────────────────────────────
    const edgeG = g.append("g").attr("class", "edges");

    // Wide invisible hit target for easier clicking
    edgeG.selectAll("line.hit")
      .data(edges)
      .join("line")
      .attr("class", "hit")
      .attr("stroke", "transparent")
      .attr("stroke-width", 12)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        const raw = graphData.edges.find((e) => e.id === d.id);
        if (raw) onSelectEdge(raw);
      });

    const edgeLine = edgeG.selectAll("line.vis")
      .data(edges)
      .join("line")
      .attr("class", "vis")
      .attr("stroke", (d) => edgeColor(d.relation))
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.65)
      .attr("marker-end", (d) => `url(#arrow-${edgeColor(d.relation).replace("#", "")})`)
      .style("pointer-events", "none");


    // ── Nodes ───────────────────────────────────────────────────────────────
    const nodeG = g.append("g").attr("class", "nodes");

    const node = nodeG.selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        const raw = graphData.nodes.find((n) => n.id === d.id);
        if (raw) onSelectNode(raw);
      })
      .call(
        d3.drag()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Circle
    node.append("circle")
      .attr("r", (d) => nodeR(d))
      .attr("fill", (d) => expandedNodes?.has(d.id) ? "#1677ff" : "#ffffff")
      .attr("stroke", (d) => expandedNodes?.has(d.id) ? "#0958d9" : "#e0e0e0")
      .attr("stroke-width", 1.5)
      .style("filter", "drop-shadow(0 1px 4px rgba(0,0,0,0.08))");

    // Label
    node.append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", (d) => expandedNodes?.has(d.id) ? "#ffffff" : "#262626")
      .attr("font-size", (d) => expandedNodes?.has(d.id) ? 13 : 11)
      .attr("font-weight", 600)
      .style("pointer-events", "none")
      .style("user-select", "none");

    // ── Tick ────────────────────────────────────────────────────────────────
    sim.on("tick", () => {
      // Reposition edge lines clipped to node borders
      function updateLines(sel) {
        sel.each(function (d) {
          const sx = d.source.x, sy = d.source.y;
          const tx = d.target.x, ty = d.target.y;
          const dx = tx - sx, dy = ty - sy;
          const dist = Math.hypot(dx, dy) || 1;
          const sr = nodeR(d.source);
          const tr = nodeR(d.target) + ARROW_L;
          d3.select(this)
            .attr("x1", sx + (dx / dist) * sr)
            .attr("y1", sy + (dy / dist) * sr)
            .attr("x2", tx - (dx / dist) * tr)
            .attr("y2", ty - (dy / dist) * tr);
        });
      }

      edgeG.selectAll("line.hit").call(updateLines);
      edgeG.selectAll("line.vis").call(updateLines);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [graphData, expandedNodes, seedId, onSelectNode, onSelectEdge]);

  // Update selection styling without restarting physics
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll(".nodes circle")
      .attr("stroke", (d) => d.id === selectedNodeId ? "#fa8c16" : (expandedNodes?.has(d.id) ? "#0958d9" : "#e0e0e0"))
      .attr("stroke-width", (d) => d.id === selectedNodeId ? 3 : 1.5);
  }, [selectedNodeId, expandedNodes]);

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative", background: "#fafafa" }}>
      <svg ref={svgRef} style={{ display: "block", width: "100%", height: "100%" }} />

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          padding: "8px 12px",
          background: "rgba(255,255,255,0.88)",
          borderRadius: 8,
          border: "1px solid #f0f0f0",
          fontSize: 11,
          backdropFilter: "blur(4px)",
          pointerEvents: "none",
        }}
      >
        {LEGEND_ITEMS.map(([rel, label]) => (
          <div key={rel} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="18" height="10" style={{ flexShrink: 0 }}>
              <line x1="0" y1="5" x2="12" y2="5" stroke={edgeColor(rel)} strokeWidth="1.5" strokeOpacity="0.7" />
              <polygon points="12,2 18,5 12,8" fill={edgeColor(rel)} fillOpacity="0.75" />
            </svg>
            <span style={{ color: "#595959" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

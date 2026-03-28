import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ─── Colour coding per relation type ────────────────────────────────────────
const RELATION_COLORS = {
  activates: "#52c41a",
  inhibits: "#ff4d4f",
  binds: "#1677ff",
  coexpressed_with: "#722ed1",
  in_pathway_with: "#fa8c16",
  synthetic_lethal_with: "#eb2f96",
  associated_with: "#13c2c2",
  unknown_related: "#8c8c8c",
};

const relationColor = (rel) => RELATION_COLORS[rel] ?? "#8c8c8c";

// ─── Custom gene node ────────────────────────────────────────────────────────
function GeneNode({ data, selected }) {
  const isSeed = data.isSeed;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          padding: isSeed ? "10px 20px" : "8px 16px",
          borderRadius: isSeed ? 12 : 24,
          background: isSeed ? "#1677ff" : "#ffffff",
          color: isSeed ? "#ffffff" : "#141414",
          border: selected
            ? `2px solid ${isSeed ? "#0958d9" : "#1677ff"}`
            : `2px solid ${isSeed ? "#1677ff" : "#d9d9d9"}`,
          fontWeight: 600,
          fontSize: isSeed ? 15 : 13,
          boxShadow: selected
            ? "0 0 0 3px rgba(22,119,255,0.2)"
            : isSeed
            ? "0 4px 16px rgba(22,119,255,0.3)"
            : "0 2px 8px rgba(0,0,0,0.08)",
          cursor: "pointer",
          transition: "box-shadow 0.2s, border 0.2s",
          minWidth: isSeed ? 80 : 64,
          textAlign: "center",
          userSelect: "none",
        }}
      >
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}

const nodeTypes = { gene: GeneNode };

// ─── Layout: radial around seed ──────────────────────────────────────────────
function buildLayout(nodes, edges, seedId) {
  const others = nodes.filter((n) => n.id !== seedId);
  const angleStep = (2 * Math.PI) / (others.length || 1);
  const radius = 220;

  const posMap = {};
  posMap[seedId] = { x: 0, y: 0 };
  others.forEach((n, i) => {
    const angle = i * angleStep - Math.PI / 2;
    posMap[n.id] = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });

  const rfNodes = nodes.map((n) => ({
    id: n.id,
    type: "gene",
    position: posMap[n.id] ?? { x: 0, y: 0 },
    data: {
      label: n.label,
      isSeed: n.id === seedId,
      meta: n.meta,
    },
  }));

  const rfEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.relation,
    data: { ...e },
    style: { stroke: relationColor(e.relation), strokeWidth: 2 },
    labelStyle: {
      fontSize: 10,
      fill: relationColor(e.relation),
      fontWeight: 600,
    },
    labelBgStyle: { fill: "#fff", fillOpacity: 0.85 },
    labelBgPadding: [4, 6],
    labelBgBorderRadius: 4,
    animated: e.relation === "activates",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: relationColor(e.relation),
      width: 16,
      height: 16,
    },
  }));

  return { rfNodes, rfEdges };
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
  const shown = [
    ["activates", "Activates"],
    ["inhibits", "Inhibits"],
    ["binds", "Binds"],
    ["associated_with", "Associated"],
  ];
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        background: "rgba(255,255,255,0.92)",
        border: "1px solid #f0f0f0",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 11,
        zIndex: 10,
        backdropFilter: "blur(4px)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {shown.map(([rel, label]) => (
        <div key={rel} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <div
            style={{
              width: 20,
              height: 2,
              background: relationColor(rel),
              borderRadius: 2,
            }}
          />
          <span style={{ color: "#595959" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GraphCanvas({ graphData, seedId, onSelectNode, onSelectEdge }) {
  const { rfNodes: initialNodes, rfEdges: initialEdges } = useMemo(
    () => buildLayout(graphData.nodes, graphData.edges, seedId),
    [graphData, seedId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_, node) => {
      const raw = graphData.nodes.find((n) => n.id === node.id);
      if (raw) onSelectNode(raw);
    },
    [graphData, onSelectNode]
  );

  const onEdgeClick = useCallback(
    (_, edge) => {
      const raw = graphData.edges.find((e) => e.id === edge.id);
      if (raw) onSelectEdge(raw);
    },
    [graphData, onSelectEdge]
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e8e8e8" gap={20} size={1} />
        <Controls showInteractive={false} style={{ bottom: 16, right: 16, left: "auto" }} />
        <MiniMap
          nodeColor={(n) => (n.data?.isSeed ? "#1677ff" : "#d9d9d9")}
          maskColor="rgba(240,240,240,0.6)"
          style={{ bottom: 100, right: 16 }}
        />
      </ReactFlow>
      <Legend />
    </div>
  );
}

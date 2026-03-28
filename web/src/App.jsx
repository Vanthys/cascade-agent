import { useState, useEffect, useRef } from "react";
import { Layout, Button, Spin, Progress, Tag } from "antd";
import { ReloadOutlined, ApartmentOutlined, BulbOutlined } from "@ant-design/icons";
import ChatView from "./components/ChatView";
import GraphCanvas from "./components/GraphCanvas";
import InfoPanel from "./components/InfoPanel";
import WhatIfPanel from "./components/WhatIfPanel";
import CascadeLogo from "./components/CascadeLogo";
import { createSession, seedGraph, connectStream, runWhatIf } from "./api/client";
import { computeCascade } from "./data/mockData";
import "./App.css";

const { Header, Content, Sider } = Layout;

function Text({ children, strong, type, style }) {
  return (
    <span
      style={{
        color: type === "secondary" ? "#8c8c8c" : "inherit",
        fontWeight: strong ? 700 : 400,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

const PANEL_WIDTH = 360;

const STEP_LABELS = {
  normalise_prompt:    "Normalising gene symbol…",
  retrieve_context:    "Retrieving session context…",
  research_seed_gene:  "Fetching gene data from literature…",
  find_adjacent_genes: "Finding adjacent interactors…",
  build_graph:         "Building interaction graph…",
  generate_summary:    "Generating summary…",
};
const TOTAL_STEPS = Object.keys(STEP_LABELS).length;

const TABS = [
  { key: "overview", label: "Overview", icon: <ApartmentOutlined /> },
  { key: "whatif",   label: "What-if",  icon: <BulbOutlined /> },
];

function resolveOverlayEdgeIds(edges, affectedEdgeIds = []) {
  const liveEdgeIds = edges.map((edge) => edge.id);
  return affectedEdgeIds
    .map((edgeId) => {
      if (liveEdgeIds.includes(edgeId)) return edgeId;
      return liveEdgeIds.find((candidate) => candidate.startsWith(`${edgeId}_`)) ?? null;
    })
    .filter(Boolean);
}

export default function App() {
  const [phase, setPhase]               = useState("chat");
  const [sessionId, setSessionId]       = useState(null);
  const [seedGene, setSeedGene]         = useState(null);
  const [graphData, setGraphData]       = useState({ nodes: [], edges: [] });
  const [selection, setSelection]       = useState(null);
  const [progressStep, setProgressStep] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [error, setError]               = useState(null);

  const [activeTab, setActiveTab]       = useState("overview");
  const [whatIfTarget, setWhatIfTarget] = useState(null);
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const stopStreamRef = useRef(null);

  useEffect(() => {
    createSession()
      .then((data) => setSessionId(data.session_id))
      .catch((err) => console.error("Failed to create session:", err));
    return () => stopStreamRef.current?.();
  }, []);

  // ── Seed graph ────────────────────────────────────────────────────────────
  const handleSubmit = async (prompt) => {
    if (!sessionId) return;

    const gene = prompt.trim().split(/\s+/)[0].toUpperCase();
    setSeedGene(gene);
    setPhase("loading");
    setSelection(null);
    setProgressStep(0);
    setProgressText(STEP_LABELS.normalise_prompt);
    setError(null);
    setActiveTab("overview");
    setWhatIfTarget(null);
    setWhatIfResult(null);

    const accNodes = {};
    const accEdges = {};
    let summaryText = "";
    let stepCount = 0;

    try {
      const { request_id } = await seedGraph(sessionId, prompt);

      const stop = connectStream(request_id, {
        progress({ step, status }) {
          if (status === "running") {
            stepCount = Math.min(stepCount + 1, TOTAL_STEPS);
            setProgressStep(stepCount);
            setProgressText(STEP_LABELS[step] ?? step.replace(/_/g, " ") + "…");
          }
        },
        graph_patch({ nodes, edges }) {
          nodes.forEach((n) => (accNodes[n.id] = n));
          edges.forEach((e) => (accEdges[e.id] = e));
          setGraphData({ nodes: Object.values(accNodes), edges: Object.values(accEdges) });
        },
        summary_chunk({ text }) { summaryText = text; },
        completed() {
          const seedNodeId = `gene_${gene}`;
          if (accNodes[seedNodeId] && summaryText) {
            accNodes[seedNodeId] = {
              ...accNodes[seedNodeId],
              meta: { ...accNodes[seedNodeId].meta, summary: summaryText },
            };
          }
          const finalGraph = { nodes: Object.values(accNodes), edges: Object.values(accEdges) };
          setGraphData(finalGraph);
          setPhase("graph");
          const seedNode = accNodes[seedNodeId] ?? Object.values(accNodes)[0];
          if (seedNode) setSelection({ _type: "node", ...seedNode });
          setExpandedNodes(new Set([seedNodeId]));
        },
        error({ message, recoverable }) {
          setError(message);
          if (!recoverable) setPhase("chat");
        },
      });
      stopStreamRef.current = stop;
    } catch (err) {
      setError(err.message);
      setPhase("chat");
    }
  };

  // ── Graph patch ───────────────────────────────────────────────────────────
  const handleGraphPatch = ({ nodes = [], edges = [] }) => {
    setGraphData((prev) => {
      const nodeMap = Object.fromEntries(prev.nodes.map((n) => [n.id, n]));
      const edgeMap = Object.fromEntries(prev.edges.map((e) => [e.id, e]));
      nodes.forEach((n) => (nodeMap[n.id] = n));
      edges.forEach((e) => (edgeMap[e.id] = e));
      return { nodes: Object.values(nodeMap), edges: Object.values(edgeMap) };
    });
  };

  const handleNodeExpanded = (nodeId) =>
    setExpandedNodes((prev) => new Set(prev).add(nodeId));

  // ── What-if ───────────────────────────────────────────────────────────────
  // Map frontend perturbation labels → backend PerturbationType enum values
  const PERTURB_TO_BACKEND = {
    inhibit:     "disruption",
    activate:    "upregulation",
    downregulate:"downregulation",
    upregulate:  "upregulation",
  };

  const handleRunWhatIf = async (targetNode, perturbationType) => {
    if (!sessionId) return;
    setWhatIfLoading(true);
    setWhatIfResult(null);
    stopStreamRef.current?.();

    const backendType = PERTURB_TO_BACKEND[perturbationType] ?? "disruption";

    try {
      const { request_id } = await runWhatIf(
        sessionId,
        targetNode.id,
        "node",
        backendType,
        null,
      );

      const stop = connectStream(request_id, {
        hypothesis(payload) {
          // Compute visual cascade from real graph topology
          const { affectedNodes, affectedEdgeIds } = computeCascade(
            graphData,
            targetNode.id,
            perturbationType,
          );
          setWhatIfResult({
            confidence:            payload.confidence,
            known_context:         payload.known_context ?? [],
            hypotheses:            payload.hypotheses ?? [],
            downstream_candidates: payload.downstream_candidates ?? [],
            existing_therapeutics: [],   // not provided by backend
            uncertainty_notes:     payload.uncertainty_notes ?? [],
            nodeId:                targetNode.id,
            nodeLabel:             targetNode.label,
            type:                  perturbationType,
            affected_nodes:        affectedNodes,
            affected_edge_ids:     affectedEdgeIds,
          });
          setWhatIfLoading(false);
        },
        error({ message }) {
          console.error("What-if error:", message);
          setWhatIfLoading(false);
        },
        completed() {
          setWhatIfLoading(false);
        },
        onClose() {
          setWhatIfLoading(false);
        },
      });
      stopStreamRef.current = stop;
    } catch (err) {
      console.error("What-if request failed:", err);
      setWhatIfLoading(false);
    }
  };

  const handleResetWhatIf = () => { setWhatIfResult(null); setWhatIfTarget(null); };

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    if (tabKey === "overview") {
      setWhatIfResult(null);
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNewSearch = () => {
    stopStreamRef.current?.();
    setPhase("chat");
    setSeedGene(null);
    setGraphData({ nodes: [], edges: [] });
    setSelection(null);
    setExpandedNodes(new Set());
    setError(null);
    setActiveTab("overview");
    setWhatIfTarget(null);
    setWhatIfResult(null);
  };

  const handleSelectNode = (node) => {
    if (activeTab === "whatif") {
      setWhatIfTarget(node);
      setWhatIfResult(null);
    } else {
      setSelection({ _type: "node", ...node });
    }
  };
  const handleSelectEdge = (edge) => {
    if (activeTab === "overview") setSelection({ _type: "edge", ...edge });
  };

  const progressPercent = Math.round((progressStep / TOTAL_STEPS) * 100);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="loading-screen">
        <CascadeLogo size="icon" />
        <div style={{ textAlign: "center" }}>
          <Text strong style={{ fontSize: 16, display: "block", marginBottom: 4 }}>
            Researching{" "}
            <Tag color="blue" style={{ fontSize: 14, fontWeight: 700 }}>{seedGene}</Tag>
          </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>{progressText}</Text>
        </div>
        <Progress percent={progressPercent} status="active" strokeColor="#1677ff" style={{ width: 320 }} showInfo={false} />
        <Spin size="small" />
      </div>
    );
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  if (phase === "chat") {
    return <ChatView onSubmit={handleSubmit} loading={!sessionId} error={error} />;
  }

  // ── Graph ─────────────────────────────────────────────────────────────────
  const seedId = graphData?.nodes[0]?.id;

  const perturbationOverlay = whatIfResult
    ? {
        type: whatIfResult.type,
        targetNodeId: whatIfResult.nodeId,
        affectedNodes: whatIfResult.affected_nodes,
        affectedEdgeIds: resolveOverlayEdgeIds(graphData.edges, whatIfResult.affected_edge_ids),
      }
    : null;

  return (
    <Layout className="graph-layout">
      <Header className="app-header">
        <CascadeLogo size="header" />

        <div className="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab-btn${activeTab === tab.key ? " tab-btn--active" : ""}`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <Tag color="blue" style={{ fontWeight: 700, fontSize: 13 }}>{seedGene}</Tag>
        <Button icon={<ReloadOutlined />} size="small" onClick={handleNewSearch} style={{ marginLeft: 8 }}>
          New search
        </Button>
      </Header>

      <Layout style={{ flex: 1, overflow: "hidden" }}>
        <Content style={{ position: "relative", overflow: "hidden" }}>
          {graphData?.nodes.length > 0 && (
            <GraphCanvas
              graphData={graphData}
              seedId={seedId}
              expandedNodes={expandedNodes}
              selectedNodeId={
                activeTab === "overview"
                  ? (selection?._type === "node" ? selection.id : null)
                  : (whatIfTarget?.id ?? null)
              }
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
              perturbationOverlay={perturbationOverlay}
            />
          )}
        </Content>

        <Sider
          width={PANEL_WIDTH}
          style={{
            background: "#ffffff",
            borderLeft: "1px solid #f0f0f0",
            overflow: "hidden",
            boxShadow: "-4px 0 16px rgba(0,0,0,0.06)",
          }}
        >
          {activeTab === "overview" ? (
            <InfoPanel
              selection={selection}
              graphData={graphData}
              sessionId={sessionId}
              onNewSearch={handleNewSearch}
              onGraphPatch={handleGraphPatch}
              onNodeExpanded={handleNodeExpanded}
              onSelectNode={handleSelectNode}
            />
          ) : (
            <WhatIfPanel
              graphData={graphData}
              whatIfTarget={whatIfTarget}
              onSelectTarget={(node) => { setWhatIfTarget(node); setWhatIfResult(null); }}
              onRun={handleRunWhatIf}
              result={whatIfResult}
              loading={whatIfLoading}
              onReset={handleResetWhatIf}
              onNewSearch={handleNewSearch}
            />
          )}
        </Sider>
      </Layout>
    </Layout>
  );
}

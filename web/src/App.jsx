import { useState, useEffect, useRef } from "react";
import { Layout, Typography, Button, Spin, Progress, Tag } from "antd";
import { ExperimentOutlined, ReloadOutlined } from "@ant-design/icons";
import ChatView from "./components/ChatView";
import GraphCanvas from "./components/GraphCanvas";
import InfoPanel from "./components/InfoPanel";
import { createSession, seedGraph, connectStream } from "./api/client";
import "./App.css";

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const PANEL_WIDTH = 360;

// Maps backend SSE step names → user-friendly labels
const STEP_LABELS = {
  normalise_prompt:   "Normalising gene symbol…",
  retrieve_context:   "Retrieving session context…",
  research_seed_gene: "Fetching gene data from literature…",
  find_adjacent_genes:"Finding adjacent interactors…",
  build_graph:        "Building interaction graph…",
  generate_summary:   "Generating summary…",
};
const TOTAL_STEPS = Object.keys(STEP_LABELS).length;

export default function App() {
  const [phase, setPhase] = useState("chat"); // "chat" | "loading" | "graph"
  const [sessionId, setSessionId] = useState(null);
  const [seedGene, setSeedGene] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [selection, setSelection] = useState(null);
  const [progressStep, setProgressStep] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState(null);

  const stopStreamRef = useRef(null);

  // Create a session on first mount
  useEffect(() => {
    createSession()
      .then((data) => setSessionId(data.session_id))
      .catch((err) => console.error("Failed to create session:", err));
    return () => stopStreamRef.current?.();
  }, []);

  // ── Seed graph workflow ───────────────────────────────────────────────────

  const handleSubmit = async (prompt) => {
    if (!sessionId) return;

    const gene = prompt.trim().split(/\s+/)[0].toUpperCase();
    setSeedGene(gene);
    setPhase("loading");
    setSelection(null);
    setProgressStep(0);
    setProgressText(STEP_LABELS.normalise_prompt);
    setError(null);

    // Accumulated graph state from patches
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
          setGraphData({
            nodes: Object.values(accNodes),
            edges: Object.values(accEdges),
          });
        },

        summary_chunk({ text }) {
          summaryText = text;
        },

        completed() {
          // Attach the LLM summary to the seed node's meta so InfoPanel shows it
          const seedNodeId = `gene_${gene}`;
          if (accNodes[seedNodeId] && summaryText) {
            accNodes[seedNodeId] = {
              ...accNodes[seedNodeId],
              meta: { ...accNodes[seedNodeId].meta, summary: summaryText },
            };
          }

          const finalGraph = {
            nodes: Object.values(accNodes),
            edges: Object.values(accEdges),
          };
          setGraphData(finalGraph);
          setPhase("graph");

          // Auto-select the seed node
          const seedNode = accNodes[seedNodeId] ?? Object.values(accNodes)[0];
          if (seedNode) setSelection({ _type: "node", ...seedNode });
        },

        error({ message, recoverable }) {
          console.error("Stream error:", message);
          setError(message);
          if (!recoverable) setPhase("chat");
        },
      });

      stopStreamRef.current = stop;
    } catch (err) {
      console.error("Failed to start seed workflow:", err);
      setError(err.message);
      setPhase("chat");
    }
  };

  // ── Graph patch callback (used by InfoPanel when expanding nodes) ──────────

  const handleGraphPatch = ({ nodes = [], edges = [] }) => {
    setGraphData((prev) => {
      const nodeMap = Object.fromEntries(prev.nodes.map((n) => [n.id, n]));
      const edgeMap = Object.fromEntries(prev.edges.map((e) => [e.id, e]));
      nodes.forEach((n) => (nodeMap[n.id] = n));
      edges.forEach((e) => (edgeMap[e.id] = e));
      return {
        nodes: Object.values(nodeMap),
        edges: Object.values(edgeMap),
      };
    });
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleNewSearch = () => {
    stopStreamRef.current?.();
    setPhase("chat");
    setSeedGene(null);
    setGraphData({ nodes: [], edges: [] });
    setSelection(null);
    setError(null);
  };

  const handleSelectNode = (node) => setSelection({ _type: "node", ...node });
  const handleSelectEdge = (edge) => setSelection({ _type: "edge", ...edge });

  const progressPercent = Math.round((progressStep / TOTAL_STEPS) * 100);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="loading-screen">
        <ExperimentOutlined style={{ fontSize: 40, color: "#1677ff" }} />
        <div style={{ textAlign: "center" }}>
          <Text strong style={{ fontSize: 16, display: "block", marginBottom: 4 }}>
            Researching{" "}
            <Tag color="blue" style={{ fontSize: 14, fontWeight: 700 }}>
              {seedGene}
            </Tag>
          </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {progressText}
          </Text>
        </div>
        <Progress
          percent={progressPercent}
          status="active"
          strokeColor="#1677ff"
          style={{ width: 320 }}
          showInfo={false}
        />
        <Spin size="small" />
      </div>
    );
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  if (phase === "chat") {
    return (
      <ChatView
        onSubmit={handleSubmit}
        loading={!sessionId}
        error={error}
      />
    );
  }

  // ── Graph ─────────────────────────────────────────────────────────────────

  const seedId = graphData?.nodes[0]?.id;

  return (
    <Layout className="graph-layout">
      <Header className="app-header">
        <ExperimentOutlined style={{ color: "#1677ff", fontSize: 16 }} />
        <Text strong style={{ fontSize: 14 }}>
          Gene Interaction Explorer
        </Text>
        <div style={{ flex: 1 }} />
        <Tag color="blue" style={{ fontWeight: 700, fontSize: 13 }}>
          {seedGene}
        </Tag>
        <Button
          icon={<ReloadOutlined />}
          size="small"
          onClick={handleNewSearch}
          style={{ marginLeft: 8 }}
        >
          New search
        </Button>
      </Header>

      <Layout style={{ flex: 1, overflow: "hidden" }}>
        <Content style={{ position: "relative", overflow: "hidden" }}>
          {graphData?.nodes.length > 0 && (
            <GraphCanvas
              graphData={graphData}
              seedId={seedId}
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
            />
          )}
        </Content>

        <Sider
          width={PANEL_WIDTH}
          style={{
            background: "#ffffff",
            borderLeft: "1px solid #f0f0f0",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "-4px 0 16px rgba(0,0,0,0.06)",
          }}
        >
          <InfoPanel
            selection={selection}
            graphData={graphData}
            sessionId={sessionId}
            onNewSearch={handleNewSearch}
            onGraphPatch={handleGraphPatch}
          />
        </Sider>
      </Layout>
    </Layout>
  );
}

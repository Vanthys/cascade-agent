import { useState, useEffect, useRef } from "react";
import { Layout, Typography, Button, Spin, Progress, Tag } from "antd";
import { ExperimentOutlined, ReloadOutlined } from "@ant-design/icons";
import ChatView from "./components/ChatView";
import GraphCanvas from "./components/GraphCanvas";
import InfoPanel from "./components/InfoPanel";
import { MOCK_GRAPH, simulateSSEStream } from "./data/mockData";
import "./App.css";

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const PANEL_WIDTH = 360;

const PROGRESS_STEPS = [
  "Normalising gene symbol…",
  "Retrieving gene function from literature…",
  "Finding adjacent interactors…",
  "Building interaction graph…",
  "Generating summary…",
];

export default function App() {
  const [phase, setPhase] = useState("chat"); // "chat" | "loading" | "graph"
  const [seedGene, setSeedGene] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [selection, setSelection] = useState(null);
  const [progressStep, setProgressStep] = useState(0);
  const [progressText, setProgressText] = useState("");

  const stopStreamRef = useRef(null);

  useEffect(() => () => stopStreamRef.current?.(), []);

  const handleSubmit = (prompt) => {
    setSeedGene(prompt.toUpperCase());
    setPhase("loading");
    setSelection(null);
    setProgressStep(0);
    setProgressText(PROGRESS_STEPS[0]);

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      if (step < PROGRESS_STEPS.length) {
        setProgressStep(step);
        setProgressText(PROGRESS_STEPS[step]);
      } else {
        clearInterval(interval);
        setGraphData(MOCK_GRAPH);
        setPhase("graph");
        // Auto-select seed node
        const seed = MOCK_GRAPH.nodes[0];
        setSelection({ _type: "node", ...seed });
      }
    }, 700);
  };

  const handleNewSearch = () => {
    stopStreamRef.current?.();
    setPhase("chat");
    setSeedGene(null);
    setGraphData(null);
    setSelection(null);
  };

  const handleSelectNode = (node) => setSelection({ _type: "node", ...node });
  const handleSelectEdge = (edge) => setSelection({ _type: "edge", ...edge });

  const progressPercent = Math.round((progressStep / (PROGRESS_STEPS.length - 1)) * 100);

  // ── Loading ─────────────────────────────────────────────────────────────────
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

  // ── Chat ────────────────────────────────────────────────────────────────────
  if (phase === "chat") {
    return <ChatView onSubmit={handleSubmit} loading={false} />;
  }

  // ── Graph ───────────────────────────────────────────────────────────────────
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
          {graphData && (
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
            onNewSearch={handleNewSearch}
          />
        </Sider>
      </Layout>
    </Layout>
  );
}

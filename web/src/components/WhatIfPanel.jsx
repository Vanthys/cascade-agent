import { useState } from "react";
import {
  Typography,
  Button,
  Select,
  Divider,
  Tag,
  Tooltip,
  Badge,
} from "antd";
import {
  StopOutlined,
  ThunderboltOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import Markdown from "react-markdown";

const { Text, Title } = Typography;

// ─── Perturbation type config ─────────────────────────────────────────────────
const PERTURBATION_TYPES = [
  {
    key: "inhibit",
    label: "Inhibit",
    desc: "Direct molecular inhibition (e.g. small-molecule inhibitor)",
    color: "#ff4d4f",
    bg: "#fff2f0",
    border: "#ffccc7",
    icon: <StopOutlined />,
  },
  {
    key: "activate",
    label: "Activate",
    desc: "Direct molecular activation (e.g. agonist, allosteric activator)",
    color: "#52c41a",
    bg: "#f6ffed",
    border: "#b7eb8f",
    icon: <ThunderboltOutlined />,
  },
  {
    key: "downregulate",
    label: "Downregulate",
    desc: "Reduce expression level (e.g. siRNA, shRNA, gene silencing)",
    color: "#fa8c16",
    bg: "#fff7e6",
    border: "#ffd591",
    icon: <ArrowDownOutlined />,
  },
  {
    key: "upregulate",
    label: "Upregulate",
    desc: "Increase expression level (e.g. cDNA overexpression)",
    color: "#1677ff",
    bg: "#e6f4ff",
    border: "#91caff",
    icon: <ArrowUpOutlined />,
  },
];

const CONFIDENCE_COLORS = { high: "green", medium: "orange", low: "default" };

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <span style={{ color, fontSize: 12 }}>{icon}</span>
      <Text strong style={{ fontSize: 11, color: "#8c8c8c", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </Text>
    </div>
  );
}

function BulletList({ items, italic, color }) {
  return (
    <ul style={{ paddingLeft: 16, margin: "0 0 4px", listStyle: "none" }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ color: color ?? "#d9d9d9", flexShrink: 0, marginTop: 2, fontSize: 10 }}>
            {italic ? "◇" : "◆"}
          </span>
          <span style={{ fontSize: 12, lineHeight: 1.65, fontStyle: italic ? "italic" : "normal", color: italic ? "#595959" : "#262626" }}>
            <Markdown components={{ p: ({ children }) => <span>{children}</span> }}>{item}</Markdown>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WhatIfPanel({
  graphData,
  whatIfTarget,
  onSelectTarget,
  onRun,
  result,
  loading,
  onReset,
  onNewSearch,
}) {
  const [perturbationType, setPerturbationType] = useState(null);

  const nodes = graphData?.nodes ?? [];
  const selectedType = PERTURBATION_TYPES.find((t) => t.key === perturbationType);

  const handleRun = () => {
    if (!whatIfTarget || !perturbationType) return;
    onRun(whatIfTarget, perturbationType);
  };

  const handleReset = () => {
    setPerturbationType(null);
    onReset();
  };

  // ── Results view ────────────────────────────────────────────────────────
  if (result) {
    const conf = PERTURBATION_TYPES.find((t) => t.key === result.type);
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Result header */}
        <div style={{ padding: "14px 16px 10px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>Perturbation analysis</Text>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Title level={4} style={{ margin: 0 }}>{result.nodeLabel}</Title>
                <Tag
                  icon={conf?.icon}
                  color={conf?.color}
                  style={{ fontSize: 11, fontWeight: 600, borderColor: conf?.border, background: conf?.bg, color: conf?.color }}
                >
                  {conf?.label}
                </Tag>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <Tooltip title="New perturbation">
                <Button icon={<ReloadOutlined />} size="small" type="text" onClick={handleReset} style={{ color: "#8c8c8c" }} />
              </Tooltip>
              <Tooltip title="New search">
                <Button icon={<ExperimentOutlined />} size="small" type="text" onClick={onNewSearch} style={{ color: "#8c8c8c" }} />
              </Tooltip>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <Tag color={CONFIDENCE_COLORS[result.confidence]}>
              Confidence: {result.confidence}
            </Tag>
          </div>
        </div>

        <Divider style={{ margin: "0 0 0" }} />

        {/* Scrollable results */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "12px 16px" }}>

          {/* Known context */}
          <SectionHeader icon={<InfoCircleOutlined />} label="Known context" color="#1677ff" />
          <BulletList items={result.known_context} />

          <Divider dashed style={{ margin: "12px 0" }} />

          {/* Hypothesised effects */}
          <SectionHeader icon={<ExperimentOutlined />} label="Hypothesised effects" color="#722ed1" />
          <div
            style={{
              background: "#fafafa",
              border: "1px dashed #d9d9d9",
              borderRadius: 6,
              padding: "8px 10px",
              marginBottom: 4,
            }}
          >
            <Text style={{ fontSize: 10, color: "#8c8c8c" }}>
              Model-generated — not established fact
            </Text>
          </div>
          <BulletList items={result.hypotheses} italic color="#722ed1" />

          {/* Downstream candidates */}
          {result.downstream_candidates?.length > 0 && (
            <>
              <Divider dashed style={{ margin: "12px 0" }} />
              <SectionHeader icon={null} label="Downstream candidates" color="#8c8c8c" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.downstream_candidates.map((g) => (
                  <Tag key={g} color="blue" style={{ cursor: "pointer", fontWeight: 600 }}>
                    {g}
                  </Tag>
                ))}
              </div>
            </>
          )}

          {/* Existing therapeutics */}
          {result.existing_therapeutics?.length > 0 && (
            <>
              <Divider dashed style={{ margin: "12px 0" }} />
              <SectionHeader icon={null} label="Existing therapeutics" color="#8c8c8c" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.existing_therapeutics.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      padding: "7px 10px",
                      background: "#f5f5f5",
                      borderRadius: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div>
                      <Text strong style={{ fontSize: 12 }}>{t.name}</Text>
                      <Text type="secondary" style={{ fontSize: 11, display: "block" }}>{t.type}</Text>
                    </div>
                    <Tag style={{ flexShrink: 0, fontSize: 10 }}>{t.status}</Tag>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Uncertainty notes */}
          {result.uncertainty_notes?.length > 0 && (
            <>
              <Divider dashed style={{ margin: "12px 0" }} />
              <SectionHeader icon={<WarningOutlined />} label="Uncertainty" color="#fa8c16" />
              <BulletList items={result.uncertainty_notes} color="#fa8c16" />
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Setup view ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text strong style={{ fontSize: 13 }}>What-if analysis</Text>
          <Tooltip title="New search">
            <Button icon={<ReloadOutlined />} size="small" type="text" onClick={onNewSearch} style={{ color: "#8c8c8c" }} />
          </Tooltip>
        </div>

        {/* Target selector */}
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 6 }}>
          Target protein
        </Text>
        <Select
          style={{ width: "100%", marginBottom: 16 }}
          placeholder="Click a node on the graph, or select here…"
          value={whatIfTarget?.id ?? null}
          onChange={(val) => {
            const node = nodes.find((n) => n.id === val);
            if (node) onSelectTarget(node);
          }}
          options={nodes.map((n) => ({ value: n.id, label: n.label }))}
          size="middle"
          allowClear
          onClear={() => onSelectTarget(null)}
        />

        {/* Perturbation type */}
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 8 }}>
          Perturbation type
        </Text>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          {PERTURBATION_TYPES.map((t) => {
            const active = perturbationType === t.key;
            return (
              <Tooltip key={t.key} title={t.desc} placement="bottom">
                <button
                  onClick={() => setPerturbationType(t.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1.5px solid ${active ? t.color : "#e0e0e0"}`,
                    background: active ? t.bg : "#ffffff",
                    color: active ? t.color : "#595959",
                    fontWeight: active ? 600 : 400,
                    fontSize: 12,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {t.icon}
                  {t.label}
                </button>
              </Tooltip>
            );
          })}
        </div>

        <Button
          type="primary"
          block
          size="middle"
          disabled={!whatIfTarget || !perturbationType}
          loading={loading}
          onClick={handleRun}
          style={{ borderRadius: 8 }}
        >
          Run analysis
        </Button>
      </div>

      <Divider style={{ margin: "16px 0" }} />

      {/* Empty state guidance */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 16px 16px" }}>
        <div style={{ background: "#fafafa", borderRadius: 8, padding: "12px 14px" }}>
          <Text strong style={{ fontSize: 12, display: "block", marginBottom: 6 }}>How it works</Text>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              ["1", "Select a protein from the graph"],
              ["2", "Choose how to perturb it"],
              ["3", "See known effects and AI-generated hypotheses"],
            ].map(([num, text]) => (
              <div key={num} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", background: "#e6f4ff",
                  color: "#1677ff", fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {num}
                </div>
                <Text style={{ fontSize: 12, color: "#595959" }}>{text}</Text>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "#fff7e6",
            border: "1px solid #ffd591",
            borderRadius: 6,
            fontSize: 11,
            color: "#874d00",
          }}
        >
          <WarningOutlined style={{ marginRight: 6 }} />
          Hypothesised effects are model-generated. Known context is evidence-backed.
          Not intended as clinical guidance.
        </div>
      </div>
    </div>
  );
}

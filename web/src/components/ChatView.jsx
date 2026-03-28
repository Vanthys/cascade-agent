import { Alert, Button } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import PromptInput from "./PromptInput";

function Text({ children, style }) {
  return <span style={style}>{children}</span>;
}

function Title({ children, style }) {
  return <h1 style={{ margin: 0, ...style }}>{children}</h1>;
}

function Paragraph({ children, style }) {
  return <p style={style}>{children}</p>;
}

export default function ChatView({ onSubmit, loading, error }) {
  const suggestions = ["TP53", "BRCA1", "EGFR", "MYC"];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "#fafafa",
      }}
    >
      {/* Logo / icon */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "linear-gradient(135deg, #1677ff 0%, #0958d9 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
          boxShadow: "0 8px 24px rgba(22,119,255,0.25)",
        }}
      >
        <ExperimentOutlined style={{ fontSize: 30, color: "#fff" }} />
      </div>

      <Title style={{ fontSize: 32, marginBottom: 8, textAlign: "center", fontWeight: 700 }}>
        Gene Interaction Explorer
      </Title>

      <Paragraph
        style={{
          fontSize: 16,
          color: "#595959",
          textAlign: "center",
          maxWidth: 540,
          marginBottom: 8,
          lineHeight: 1.7,
        }}
      >
        Enter any gene of interest and our AI agent will research its function,
        map its protein-protein interactions, and build an interactive knowledge graph —
        pulling from the latest literature.
      </Paragraph>

      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 40,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {["Explore interactions", "Summarize function", "What-if hypotheses"].map((tag) => (
          <Text
            key={tag}
            style={{
              fontSize: 13,
              color: "#1677ff",
              background: "#e6f4ff",
              padding: "4px 12px",
              borderRadius: 20,
              border: "1px solid #91caff",
            }}
          >
            {tag}
          </Text>
        ))}
      </div>

      <div style={{ width: "100%", maxWidth: 560 }}>
        <PromptInput
          onSubmit={onSubmit}
          loading={loading}
          placeholder={loading ? "Connecting to backend…" : "Try: TP53, BRCA1, EGFR, MYC…"}
          autoFocus
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 12,
          }}
        >
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              size="small"
              disabled={loading}
              onClick={() => onSubmit(suggestion)}
              style={{ borderRadius: 999, fontWeight: 600 }}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          title={error}
          showIcon
          style={{ marginTop: 16, maxWidth: 560, width: "100%", fontSize: 12 }}
        />
      )}

      <Text style={{ marginTop: 16, fontSize: 12, color: "#8c8c8c" }}>
        For research purposes only. Not intended as clinical guidance.
      </Text>
    </div>
  );
}

import { Alert, Button } from "antd";
import PromptInput from "./PromptInput";
import CascadeLogo from "./CascadeLogo";

function Text({ children, style }) {
  return <span style={style}>{children}</span>;
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
      <CascadeLogo size="full" style={{ marginBottom: 32 }} />

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

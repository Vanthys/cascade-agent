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
  const suggestions = ["BCL-2", "TP53", "BRCA1", "EGFR", "MYC"];

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
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          maxWidth: 320,
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid #ffd591",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Text style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#d46b08", marginBottom: 4 }}>
          Hackathon build
        </Text>
        <Text style={{ fontSize: 12, color: "#874d00", lineHeight: 1.5 }}>
          Crafted within a few hours for the Total Agent Recall hackathon. Expect rough edges.
        </Text>
      </div>

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
          placeholder={loading ? "Connecting to backend…" : "Try: BCL-2, TP53, BRCA1, EGFR…"}
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
              style={
                suggestion === "BCL-2"
                  ? {
                      borderRadius: 999,
                      fontWeight: 700,
                      color: "#7a0619",
                      borderColor: "#ff85a1",
                      background: "linear-gradient(135deg, #fff1f5 0%, #ffe7ba 100%)",
                      boxShadow: "0 6px 18px rgba(199, 54, 89, 0.18)",
                    }
                  : { borderRadius: 999, fontWeight: 600 }
              }
            >
              {suggestion === "BCL-2" ? "BCL-2" : suggestion}
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

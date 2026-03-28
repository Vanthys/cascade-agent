import { useEffect, useRef, useState } from "react";
import { Typography, Tag, Divider, Button, Spin, Tooltip } from "antd";
import {
  NodeIndexOutlined,
  ApartmentOutlined,
  ReloadOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import PromptInput from "./PromptInput";
import { simulateSSEStream } from "../data/mockData";

const { Title, Text, Paragraph } = Typography;

const RELATION_COLORS = {
  activates: "green",
  inhibits: "red",
  binds: "blue",
  coexpressed_with: "purple",
  in_pathway_with: "orange",
  associated_with: "cyan",
  unknown_related: "default",
};

// ─── Node detail view ─────────────────────────────────────────────────────────
function NodeDetail({ node }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <NodeIndexOutlined style={{ color: "#1677ff" }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Protein · {node.meta?.organism ?? "human"}
        </Text>
      </div>
      <Title level={4} style={{ margin: "0 0 12px" }}>
        {node.label}
        {node.meta?.aliases?.length > 0 && (
          <Text style={{ fontSize: 13, fontWeight: 400, color: "#8c8c8c", marginLeft: 8 }}>
            ({node.meta.aliases.join(", ")})
          </Text>
        )}
      </Title>

      {node.meta?.pathways?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {node.meta.pathways.map((p) => (
            <Tag key={p} color="blue" style={{ marginBottom: 4 }}>
              {p}
            </Tag>
          ))}
        </div>
      )}

      {node.meta?.disease_relevance && (
        <div
          style={{
            background: "#fff7e6",
            border: "1px solid #ffd591",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          <Text strong style={{ color: "#d46b08" }}>
            Disease relevance:{" "}
          </Text>
          <Text style={{ color: "#874d00", fontSize: 12 }}>{node.meta.disease_relevance}</Text>
        </div>
      )}
    </>
  );
}

// ─── Edge detail view ─────────────────────────────────────────────────────────
function EdgeDetail({ edge, graphData }) {
  const sourceNode = graphData?.nodes.find((n) => n.id === edge.source);
  const targetNode = graphData?.nodes.find((n) => n.id === edge.target);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <ApartmentOutlined style={{ color: "#722ed1" }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Interaction
        </Text>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Tag color="blue" style={{ fontWeight: 600 }}>
          {sourceNode?.label ?? edge.source}
        </Tag>
        <Tag color={RELATION_COLORS[edge.relation] ?? "default"}>{edge.relation}</Tag>
        <Tag color="blue" style={{ fontWeight: 600 }}>
          {targetNode?.label ?? edge.target}
        </Tag>
      </div>

      <div style={{ marginBottom: 12, display: "flex", gap: 12 }}>
        <div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Confidence
          </Text>
          <br />
          <Text strong style={{ fontSize: 15 }}>
            {Math.round((edge.confidence ?? 0) * 100)}%
          </Text>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Evidence sources
          </Text>
          <br />
          <Text strong style={{ fontSize: 15 }}>
            {edge.evidence_count ?? "—"}
          </Text>
        </div>
      </div>
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function InfoPanel({ selection, graphData, onNewSearch, streamingText }) {
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [displayedText, setDisplayedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef(null);
  const stopStreamRef = useRef(null);

  // When selection changes, reset conversation
  useEffect(() => {
    setConversation([]);
    setDisplayedText("");
    setIsStreaming(false);
    if (stopStreamRef.current) stopStreamRef.current();
  }, [selection?.id]);

  // Stream the main summary text for nodes
  useEffect(() => {
    if (!selection || selection._type !== "node") return;
    const text = selection.meta?.summary;
    if (!text) return;

    setDisplayedText("");
    setIsStreaming(true);
    if (stopStreamRef.current) stopStreamRef.current();

    const stop = simulateSSEStream(
      text,
      (chunk) => setDisplayedText((prev) => prev + chunk),
      () => setIsStreaming(false),
      30
    );
    stopStreamRef.current = stop;
    return stop;
  }, [selection?.id]);

  // Stream edge summary
  useEffect(() => {
    if (!selection || selection._type !== "edge") return;
    const text = selection.evidence_summary;
    if (!text) return;

    setDisplayedText("");
    setIsStreaming(true);
    if (stopStreamRef.current) stopStreamRef.current();

    const stop = simulateSSEStream(
      text,
      (chunk) => setDisplayedText((prev) => prev + chunk),
      () => setIsStreaming(false),
      30
    );
    stopStreamRef.current = stop;
    return stop;
  }, [selection?.id]);

  // Scroll conversation to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, displayedText]);

  const handleFollowUp = (prompt) => {
    setFollowUpLoading(true);
    setConversation((prev) => [...prev, { role: "user", text: prompt }]);

    // Mock response
    setTimeout(() => {
      const mockReply = `This is a mock response to: "${prompt}". In the real application this will be answered by the AI agent using session context and the current graph state.`;
      let partial = "";
      const stop = simulateSSEStream(
        mockReply,
        (chunk) => {
          partial += chunk;
          setConversation((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
              updated[updated.length - 1] = { role: "assistant", text: partial };
            } else {
              updated.push({ role: "assistant", text: partial });
            }
            return updated;
          });
        },
        () => setFollowUpLoading(false),
        35
      );
      stopStreamRef.current = stop;
    }, 400);
  };

  if (!selection) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 24,
          color: "#8c8c8c",
          textAlign: "center",
          gap: 8,
        }}
      >
        <NodeIndexOutlined style={{ fontSize: 32, color: "#d9d9d9" }} />
        <Text type="secondary">Click any node or edge on the graph to see details here.</Text>
        <Divider style={{ margin: "16px 0" }} />
        <Button icon={<ReloadOutlined />} onClick={onNewSearch} type="default" size="small">
          New search
        </Button>
      </div>
    );
  }

  const isNode = selection._type === "node";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1 }}>
          {isNode ? (
            <NodeDetail node={selection} />
          ) : (
            <EdgeDetail edge={selection} graphData={graphData} />
          )}
        </div>
        <Tooltip title="New search">
          <Button
            icon={<ReloadOutlined />}
            size="small"
            type="text"
            onClick={onNewSearch}
            style={{ marginLeft: 8, color: "#8c8c8c" }}
          />
        </Tooltip>
      </div>

      <Divider style={{ margin: "8px 0" }} />

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 16px 8px",
        }}
      >
        {/* Main streamed summary */}
        <Paragraph
          style={{
            fontSize: 13,
            lineHeight: 1.75,
            color: "#262626",
            marginBottom: 0,
          }}
        >
          {displayedText}
          {isStreaming && (
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: "1em",
                background: "#1677ff",
                marginLeft: 2,
                verticalAlign: "text-bottom",
                animation: "blink 0.8s step-end infinite",
              }}
            />
          )}
        </Paragraph>

        {/* Follow-up conversation */}
        {conversation.length > 0 && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            {conversation.map((msg, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  display: "flex",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    background: msg.role === "user" ? "#1677ff" : "#f5f5f5",
                    color: msg.role === "user" ? "#fff" : "#262626",
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  {msg.text}
                  {i === conversation.length - 1 && msg.role === "assistant" && followUpLoading && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 2,
                        height: "1em",
                        background: "#1677ff",
                        marginLeft: 2,
                        verticalAlign: "text-bottom",
                        animation: "blink 0.8s step-end infinite",
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Follow-up input */}
      <div
        style={{
          padding: "8px 12px 12px",
          borderTop: "1px solid #f0f0f0",
          flexShrink: 0,
          background: "#fff",
        }}
      >
        <PromptInput
          onSubmit={handleFollowUp}
          loading={followUpLoading}
          placeholder={
            isNode
              ? `Ask about ${selection.label}…`
              : "Ask about this interaction…"
          }
        />
      </div>
    </div>
  );
}

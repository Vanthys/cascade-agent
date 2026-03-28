import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Typography, Tag, Divider, Button, Spin, Tooltip, Alert } from "antd";
import {
  NodeIndexOutlined,
  ApartmentOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import PromptInput from "./PromptInput";
import { simulateSSEStream } from "../data/mockData";
import {
  expandGene,
  explainEdge,
  runWhatIf,
  connectStream,
  detectPerturbation,
} from "../api/client";

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

// ─── Node detail header ────────────────────────────────────────────────────────
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

// ─── Edge detail header ────────────────────────────────────────────────────────
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
export default function InfoPanel({
  selection,
  graphData,
  sessionId,
  onNewSearch,
  onGraphPatch,
}) {
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [displayedText, setDisplayedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const scrollRef = useRef(null);
  const stopStreamRef = useRef(null);

  // Reset state when selection changes
  useEffect(() => {
    setConversation([]);
    setDisplayedText("");
    setIsStreaming(false);
    setStreamError(null);
    stopStreamRef.current?.();
    stopStreamRef.current = null;
  }, [selection?.id]);

  // ── Node: typewriter summary from meta ─────────────────────────────────────
  useEffect(() => {
    if (!selection || selection._type !== "node") return;
    const text = selection.meta?.summary;
    if (!text) return;

    setDisplayedText("");
    setIsStreaming(true);
    stopStreamRef.current?.();

    const stop = simulateSSEStream(
      text,
      (chunk) => setDisplayedText((prev) => prev + chunk),
      () => setIsStreaming(false),
      25
    );
    stopStreamRef.current = stop;
    return stop;
  }, [selection?.id]);

  // ── Edge: call real explain endpoint, stream result ────────────────────────
  useEffect(() => {
    if (!selection || selection._type !== "edge" || !sessionId) return;

    setDisplayedText("");
    setIsStreaming(true);
    setStreamError(null);
    stopStreamRef.current?.();

    let buffer = "";

    explainEdge(sessionId, selection.id)
      .then(({ request_id }) => {
        const stop = connectStream(request_id, {
          summary_chunk({ text }) {
            buffer += text;
            const current = buffer;
            // typewriter: re-stream accumulated text from scratch each time
            // (simpler: just append chunks directly)
            setDisplayedText(current);
          },
          completed() {
            setIsStreaming(false);
          },
          error({ message }) {
            setStreamError(message);
            setIsStreaming(false);
          },
          onClose() {
            setIsStreaming(false);
          },
        });
        stopStreamRef.current = stop;
      })
      .catch((err) => {
        // Fallback: show static evidence_summary if API fails
        const fallback = selection.evidence_summary || "";
        if (fallback) {
          const stop = simulateSSEStream(
            fallback,
            (chunk) => setDisplayedText((prev) => prev + chunk),
            () => setIsStreaming(false),
            25
          );
          stopStreamRef.current = stop;
        } else {
          setStreamError("Could not fetch edge explanation.");
          setIsStreaming(false);
        }
      });
  }, [selection?.id, sessionId]);

  // Scroll conversation to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, displayedText]);

  // ── Follow-up prompt handler ───────────────────────────────────────────────
  const handleFollowUp = async (prompt) => {
    if (!sessionId || !selection) return;

    setFollowUpLoading(true);
    setConversation((prev) => [...prev, { role: "user", text: prompt }]);

    const isNode = selection._type === "node";
    const perturbation = detectPerturbation(prompt);

    try {
      let request_id;

      if (isNode && perturbation) {
        // What-if hypothesis
        ({ request_id } = await runWhatIf(
          sessionId,
          selection.id,
          "node",
          perturbation
        ));
      } else if (isNode) {
        // Expand gene for more detail
        ({ request_id } = await expandGene(sessionId, selection.id));
      } else {
        // Edge follow-up → re-explain
        ({ request_id } = await explainEdge(sessionId, selection.id));
      }

      let partial = "";

      const stop = connectStream(request_id, {
        graph_patch(patch) {
          // Expand-gene may return new nodes; propagate upward
          onGraphPatch?.(patch);
        },
        summary_chunk({ text }) {
          partial += text;
          const snap = partial;
          setConversation((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
              updated[updated.length - 1] = { role: "assistant", text: snap };
            } else {
              updated.push({ role: "assistant", text: snap });
            }
            return updated;
          });
        },
        completed(data) {
          // If what-if, surface downstream candidates
          if (data.downstream_candidates?.length) {
            const note = `Downstream candidates: ${data.downstream_candidates.join(", ")}`;
            setConversation((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  role: "assistant",
                  text: last.text + `\n\n${note}`,
                };
              }
              return updated;
            });
          }
          setFollowUpLoading(false);
          stop?.();
        },
        error({ message }) {
          setConversation((prev) => [
            ...prev,
            { role: "assistant", text: `Error: ${message}` },
          ]);
          setFollowUpLoading(false);
        },
        onClose() {
          setFollowUpLoading(false);
        },
      });
      stopStreamRef.current = stop;
    } catch (err) {
      setConversation((prev) => [
        ...prev,
        { role: "assistant", text: `Failed to call backend: ${err.message}` },
      ]);
      setFollowUpLoading(false);
    }
  };

  // ── Empty state ────────────────────────────────────────────────────────────
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
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
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 16px 8px" }}>
        {streamError && (
          <Alert
            type="warning"
            message={streamError}
            showIcon
            style={{ marginBottom: 12, fontSize: 12 }}
          />
        )}

        {/* Main streamed summary / explanation */}
        <div className="panel-markdown">
          <Markdown>{displayedText}</Markdown>
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
        </div>

        {/* What-if hint for nodes */}
        {isNode && !isStreaming && displayedText && conversation.length === 0 && (
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 8 }}>
            <ThunderboltOutlined /> Try: "What if {selection.label} is downregulated?"
          </Text>
        )}

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
                  className={msg.role === "assistant" ? "panel-markdown bubble-assistant" : "bubble-user"}
                  style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius:
                      msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    background: msg.role === "user" ? "#1677ff" : "#f5f5f5",
                    color: msg.role === "user" ? "#fff" : "#262626",
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  {msg.role === "assistant" ? (
                    <Markdown>{msg.text}</Markdown>
                  ) : (
                    msg.text
                  )}
                  {i === conversation.length - 1 &&
                    msg.role === "assistant" &&
                    followUpLoading && (
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
              ? `Ask about ${selection.label} or try a what-if…`
              : "Ask about this interaction…"
          }
        />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Tag, Divider, Button, Tooltip, Alert } from "antd";
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
  isWhatIfPrompt,
} from "../api/client";

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

function Title({ children, style }) {
  return <h4 style={{ margin: 0, ...style }}>{children}</h4>;
}

const RELATION_COLORS = {
  activates: "green",
  inhibits: "red",
  binds: "blue",
  coexpressed_with: "purple",
  in_pathway_with: "orange",
  associated_with: "cyan",
  unknown_related: "default",
};

const CONFIDENCE_COLORS = {
  high: "green",
  medium: "gold",
  low: "volcano",
  unknown: "default",
};

function formatPerturbation(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function upsertAssistantMessage(messages, nextMessage) {
  const updated = [...messages];
  const last = updated[updated.length - 1];
  if (last?.role === "assistant") {
    updated[updated.length - 1] = nextMessage;
  } else {
    updated.push(nextMessage);
  }
  return updated;
}

function NodeDetail({ node }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <NodeIndexOutlined style={{ color: "#1677ff" }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Protein | {node.meta?.organism ?? "human"}
        </Text>
      </div>
      <Title style={{ fontSize: 24, margin: "0 0 12px" }}>
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

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
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
            {edge.evidence_count ?? "-"}
          </Text>
        </div>
      </div>
    </>
  );
}

function HypothesisSection({ title, items, accent }) {
  if (!items?.length) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <Text strong style={{ fontSize: 12, color: accent }}>
        {title}
      </Text>
      <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
        {items.map((item, index) => (
          <div
            key={`${title}-${index}`}
            style={{
              background: "#fff",
              border: "1px solid #f0f0f0",
              borderLeft: `3px solid ${accent}`,
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function HypothesisResult({ payload }) {
  if (!payload) return null;

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #f6ffed 0%, #ffffff 140px)",
        border: "1px solid #d9f7be",
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Hypothesis
          </Text>
          <div style={{ marginTop: 4 }}>
            <Text strong style={{ fontSize: 13 }}>
              {payload.question || "What-if analysis"}
            </Text>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Tag color="blue">{formatPerturbation(payload.perturbation)}</Tag>
          <Tag color={CONFIDENCE_COLORS[payload.confidence] ?? "default"}>
            {formatPerturbation(payload.confidence)} confidence
          </Tag>
        </div>
      </div>

      <HypothesisSection
        title="Known Context"
        items={payload.known_context}
        accent="#1677ff"
      />
      <HypothesisSection
        title="Mechanistic Hypotheses"
        items={payload.hypotheses}
        accent="#389e0d"
      />

      {payload.downstream_candidates?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text strong style={{ fontSize: 12, color: "#722ed1" }}>
            Likely Downstream Genes
          </Text>
          <div style={{ marginTop: 8 }}>
            {payload.downstream_candidates.map((gene) => (
              <Tag key={gene} color="purple" style={{ marginBottom: 6 }}>
                {gene}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <HypothesisSection
        title="Uncertainty"
        items={payload.uncertainty_notes}
        accent="#d46b08"
      />
    </div>
  );
}

function ConversationBubble({ message, loading }) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      style={{
        marginBottom: 10,
        display: "flex",
        flexDirection: isAssistant ? "row" : "row-reverse",
        gap: 8,
      }}
    >
      <div
        className={isAssistant && message.kind === "markdown" ? "panel-markdown bubble-assistant" : ""}
        style={{
          maxWidth: "92%",
          padding: message.kind === "hypothesis" ? 0 : "8px 12px",
          borderRadius: isAssistant ? "12px 12px 12px 4px" : "12px 12px 4px 12px",
          background: isAssistant ? (message.kind === "hypothesis" ? "transparent" : "#f5f5f5") : "#1677ff",
          color: isAssistant ? "#262626" : "#fff",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {message.kind === "hypothesis" ? (
          <HypothesisResult payload={message.payload} />
        ) : isAssistant ? (
          <Markdown>{message.text}</Markdown>
        ) : (
          message.text
        )}
        {loading && isAssistant && message.kind !== "hypothesis" && (
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
  );
}

export default function InfoPanel({
  selection,
  graphData,
  sessionId,
  onNewSearch,
  onGraphPatch,
  onNodeExpanded,
}) {
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [displayedText, setDisplayedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const scrollRef = useRef(null);
  const stopStreamRef = useRef(null);
  const panelCacheRef = useRef({});
  const lastSelectionIdRef = useRef(null);
  const lastNodeStreamSelectionRef = useRef(null);
  const lastEdgeStreamSelectionRef = useRef(null);
  const selectionId = selection?.id;
  const selectionType = selection?._type;
  const selectionSummary = selection?.meta?.summary;
  const selectionEvidenceSummary = selection?.evidence_summary;
  const panelEntry = selectionId ? panelCacheRef.current[selectionId] : null;

  useEffect(() => {
    if (lastSelectionIdRef.current === selectionId) return;
    lastSelectionIdRef.current = selectionId;
    stopStreamRef.current?.();
    stopStreamRef.current = null;
    setConversation(panelEntry?.conversation ?? []);
    setDisplayedText(panelEntry?.displayedText ?? "");
    setIsStreaming(false);
    setStreamError(null);
  }, [panelEntry, selectionId]);

  useEffect(() => {
    if (!selection || selection._type !== "node") return;
    if (lastNodeStreamSelectionRef.current === selectionId) return;
    lastNodeStreamSelectionRef.current = selectionId;
    if (panelCacheRef.current[selectionId]?.displayedText) return;
    const text = selectionSummary;
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
  }, [selection, selectionId, selectionType, selectionSummary]);

  useEffect(() => {
    if (!selection || selection._type !== "edge" || !sessionId) return;
    if (lastEdgeStreamSelectionRef.current === selectionId) return;
    lastEdgeStreamSelectionRef.current = selectionId;
    if (panelCacheRef.current[selectionId]?.displayedText) return;

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
            setDisplayedText(buffer);
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
      .catch(() => {
        const fallback = selectionEvidenceSummary || "";
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
  }, [selection, selectionId, selectionType, selectionEvidenceSummary, sessionId]);

  useEffect(() => {
    if (!selectionId) return;
    panelCacheRef.current[selectionId] = {
      displayedText,
      conversation,
    };
  }, [conversation, displayedText, selectionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, displayedText]);

  const handleFollowUp = async (prompt) => {
    if (!sessionId || !selection) return;

    setFollowUpLoading(true);
    setConversation((prev) => [...prev, { role: "user", kind: "text", text: prompt }]);
    setStreamError(null);

    const isNode = selection._type === "node";
    const text = prompt.trim();

    try {
      let request_id;

      if (isNode) {
        if (text.startsWith("/expand")) {
          onNodeExpanded?.(selection.id);
          const query = text.replace("/expand", "").trim();
          ({ request_id } = await expandGene(sessionId, selection.id, query));
        } else if (text.startsWith("/whatif") || isWhatIfPrompt(text)) {
          const pertStr = text.startsWith("/whatif") ? text.replace("/whatif", "").trim() : text;
          const perturbation = detectPerturbation(pertStr) || "knockout";
          ({ request_id } = await runWhatIf(sessionId, selection.id, "node", perturbation, text));
        } else {
          onNodeExpanded?.(selection.id);
          ({ request_id } = await expandGene(sessionId, selection.id, text));
        }
      } else {
        ({ request_id } = await explainEdge(sessionId, selection.id));
      }

      let partial = "";
      let receivedHypothesis = false;

      const stop = connectStream(request_id, {
        graph_patch(patch) {
          onGraphPatch?.(patch);
        },
        summary_chunk({ text: chunk }) {
          if (receivedHypothesis) return;
          partial += chunk;
          setConversation((prev) =>
            upsertAssistantMessage(prev, { role: "assistant", kind: "markdown", text: partial })
          );
        },
        hypothesis(payload) {
          receivedHypothesis = true;
          setConversation((prev) =>
            upsertAssistantMessage(prev, { role: "assistant", kind: "hypothesis", payload })
          );
        },
        completed() {
          setFollowUpLoading(false);
          stop?.();
        },
        error({ message }) {
          setConversation((prev) => [
            ...prev,
            { role: "assistant", kind: "markdown", text: `Error: ${message}` },
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
        { role: "assistant", kind: "markdown", text: `Failed to call backend: ${err.message}` },
      ]);
      setFollowUpLoading(false);
    }
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
  const suggestionPrompt = isNode
    ? `What if ${selection.label} is downregulated; which neighboring genes are most likely to change first?`
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
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

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 16px 8px" }}>
        {streamError && (
          <Alert
            type="warning"
            message={streamError}
            showIcon
            style={{ marginBottom: 12, fontSize: 12 }}
          />
        )}

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

        {isNode && !isStreaming && displayedText && conversation.length === 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#f6ffed",
              border: "1px solid #d9f7be",
            }}
          >
            <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
              <ThunderboltOutlined /> Ask a specific interaction question
            </Text>
            <Button
              size="small"
              disabled={followUpLoading}
              onClick={() => handleFollowUp(suggestionPrompt)}
              style={{
                marginTop: 8,
                height: "auto",
                whiteSpace: "normal",
                textAlign: "left",
                borderRadius: 8,
              }}
            >
              {suggestionPrompt}
            </Button>
          </div>
        )}

        {conversation.length > 0 && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            {conversation.map((message, index) => (
              <ConversationBubble
                key={index}
                message={message}
                loading={
                  index === conversation.length - 1 &&
                  message.role === "assistant" &&
                  followUpLoading
                }
              />
            ))}
          </>
        )}
      </div>

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
              ? `Ask about ${selection.label} interactions or run a specific what-if.`
              : "Ask about this interaction."
          }
        />
      </div>
    </div>
  );
}

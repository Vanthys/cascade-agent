/**
 * CascadeLogo — SVG recreation of the Cascade brand mark.
 *
 * Props:
 *   size="full"  → icon + "cascade" + "MOLECULAR INTELLIGENCE" (landing page)
 *   size="header" → compact icon + wordmark only (top bar)
 *   size="icon"  → icon only
 */
export default function CascadeLogo({ size = "full", style = {} }) {
  const NetworkIcon = ({ dim = 56 }) => (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* ── Edges ─────────────────────────────────────── */}
      <g stroke="#b8d9f5" strokeWidth="1.4" strokeLinecap="round">
        {/* center → inner ring */}
        <line x1="50" y1="50" x2="22" y2="24" />
        <line x1="50" y1="50" x2="50" y2="14" />
        <line x1="50" y1="50" x2="78" y2="24" />
        <line x1="50" y1="50" x2="86" y2="50" />
        <line x1="50" y1="50" x2="78" y2="76" />
        <line x1="50" y1="50" x2="50" y2="86" />
        <line x1="50" y1="50" x2="22" y2="76" />
        <line x1="50" y1="50" x2="14" y2="50" />
        {/* inner ring → outer nodes */}
        <line x1="22" y1="24" x2="8"  y2="8"  />
        <line x1="50" y1="14" x2="62" y2="4"  />
        <line x1="78" y1="24" x2="92" y2="10" />
        <line x1="86" y1="50" x2="98" y2="62" />
        <line x1="78" y1="76" x2="88" y2="92" />
        <line x1="50" y1="86" x2="38" y2="97" />
        <line x1="22" y1="76" x2="10" y2="90" />
        <line x1="14" y1="50" x2="4"  y2="36" />
        {/* inner ring peer edges (adjacent) */}
        <line x1="22" y1="24" x2="50" y2="14" />
        <line x1="50" y1="14" x2="78" y2="24" />
        <line x1="78" y1="24" x2="86" y2="50" />
        <line x1="86" y1="50" x2="78" y2="76" />
        <line x1="78" y1="76" x2="50" y2="86" />
        <line x1="50" y1="86" x2="22" y2="76" />
        <line x1="22" y1="76" x2="14" y2="50" />
        <line x1="14" y1="50" x2="22" y2="24" />
      </g>

      {/* ── Outer (distant) nodes ──────────────────────── */}
      <g fill="#c9e4f8">
        <circle cx="8"  cy="8"  r="4" />
        <circle cx="62" cy="4"  r="4" />
        <circle cx="92" cy="10" r="4" />
        <circle cx="98" cy="62" r="4" />
        <circle cx="88" cy="92" r="4" />
        <circle cx="38" cy="97" r="4" />
        <circle cx="10" cy="90" r="4" />
        <circle cx="4"  cy="36" r="4" />
      </g>

      {/* ── Inner ring nodes ──────────────────────────── */}
      <g fill="#4096ff">
        <circle cx="22" cy="24" r="7.5" />
        <circle cx="50" cy="14" r="7.5" />
        <circle cx="78" cy="24" r="7.5" />
        <circle cx="86" cy="50" r="7.5" />
        <circle cx="78" cy="76" r="7.5" />
        <circle cx="50" cy="86" r="7.5" />
        <circle cx="22" cy="76" r="7.5" />
        <circle cx="14" cy="50" r="7.5" />
      </g>

      {/* ── Center node (ring + core) ──────────────────── */}
      <circle cx="50" cy="50" r="19" fill="#bdd8f5" />
      <circle cx="50" cy="50" r="14" fill="#1677ff" />
      <circle cx="50" cy="50" r="9"  fill="#0a4fc4" />

      {/* ── Data lines (≡ to the right of center) ─────── */}
      <g stroke="#bdd8f5" strokeWidth="2" strokeLinecap="round">
        <line x1="63" y1="46" x2="74" y2="46" />
        <line x1="63" y1="50" x2="76" y2="50" />
        <line x1="63" y1="54" x2="72" y2="54" />
      </g>
    </svg>
  );

  if (size === "icon") {
    return <NetworkIcon dim={40} />;
  }

  if (size === "header") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...style }}>
        <NetworkIcon dim={32} />
        <span
          style={{
            fontSize: 18,
            fontWeight: 300,
            letterSpacing: "-0.5px",
            color: "#111",
            lineHeight: 1,
          }}
        >
          cascade
        </span>
      </div>
    );
  }

  // size === "full" — landing page
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, ...style }}>
      <NetworkIcon dim={96} />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 300,
            letterSpacing: "-1px",
            color: "#111",
            lineHeight: 1,
          }}
        >
          cascade
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "4px",
            color: "#8c8c8c",
            textTransform: "uppercase",
            marginTop: 6,
          }}
        >
          Molecular Intelligence
        </div>
      </div>
    </div>
  );
}
